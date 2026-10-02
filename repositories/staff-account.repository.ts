import { prisma } from "@/lib/prisma/client";
import { AppError } from "@/lib/errors";
import type { ProfileStatus } from "@/services/identity.service";
import type {
  StaffAccountRepository,
  StaffAccountRow,
  StaffRoleOption,
} from "@/services/staff-account.service";

/**
 * Accès Prisma aux comptes internes du personnel (`profiles`, `staff_profiles`, `staff_roles`).
 *
 * Points d'attention :
 * - **le trigger `on_auth_user_created` crée un `customer_profiles`** pour tout nouvel utilisateur
 *   Auth : la création d'un compte personnel le supprime dans la **même transaction** (T53), sinon un
 *   membre du personnel apparaîtrait dans la liste « Clients » ;
 * - `profiles.user_type` passe à `STAFF` dans cette même transaction : un compte n'est jamais
 *   « client » et « personnel » à la fois ;
 * - le schéma ne pose **aucun défaut en base** pour `id` / `created_at` / `updated_at` : c'est
 *   Prisma qui les fournit (`createMany` compris) — ne jamais insérer par SQL brut sans les fournir ;
 * - `listStaffAccounts` ne retourne `authUserId` que pour permettre la lecture des adresses : le
 *   service ne le projette jamais vers l'écran.
 */

function toRow(record: {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  profile: { authUserId: string; status: ProfileStatus };
  roles: { role: { code: string } }[];
}): StaffAccountRow {
  return {
    staffId: record.id,
    authUserId: record.profile.authUserId,
    firstName: record.firstName,
    lastName: record.lastName,
    jobTitle: record.jobTitle,
    status: record.profile.status,
    roleCodes: record.roles.map((link) => link.role.code),
  };
}

const staffInclude = {
  profile: { select: { authUserId: true, status: true } },
  roles: { select: { role: { select: { code: true } } } },
} as const;

export function createStaffAccountRepository(
  client: typeof prisma = prisma,
): StaffAccountRepository {
  return {
    async listRoles(): Promise<StaffRoleOption[]> {
      const roles = await client.role.findMany({ select: { code: true, name: true } });
      return roles.map((role) => ({ code: role.code, name: role.name }));
    },

    async listStaffAccounts(): Promise<StaffAccountRow[]> {
      const records = await client.staffProfile.findMany({
        include: staffInclude,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });

      return records.map(toRow);
    },

    async findStaffAccount(staffId: string): Promise<StaffAccountRow | null> {
      const record = await client.staffProfile.findUnique({
        where: { id: staffId },
        include: staffInclude,
      });

      return record ? toRow(record) : null;
    },

    async createStaffAccount(input): Promise<StaffAccountRow> {
      return client.$transaction(async (tx) => {
        // Le profil existe déjà (créé par le trigger) : on le passe en STAFF sans forcer son statut.
        const profile = await tx.profile.upsert({
          where: { authUserId: input.authUserId },
          update: { userType: "STAFF" },
          create: { authUserId: input.authUserId, userType: "STAFF" },
          select: { id: true, authUserId: true, status: true },
        });

        // T53 : le profil client créé par le trigger n'a aucun sens pour un membre du personnel.
        await tx.customerProfile.deleteMany({ where: { profileId: profile.id } });

        const staff = await tx.staffProfile.create({
          data: {
            profileId: profile.id,
            firstName: input.firstName,
            lastName: input.lastName,
            jobTitle: input.jobTitle,
          },
          select: { id: true, firstName: true, lastName: true, jobTitle: true },
        });

        const roles = await tx.role.findMany({
          where: { code: { in: [...input.roleCodes] } },
          select: { id: true, code: true },
        });
        if (roles.length !== new Set(input.roleCodes).size) {
          throw new AppError("VALIDATION", "Rôle inconnu.");
        }

        await tx.staffRole.createMany({
          data: roles.map((role) => ({ staffId: staff.id, roleId: role.id })),
          skipDuplicates: true,
        });

        return {
          staffId: staff.id,
          authUserId: profile.authUserId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          jobTitle: staff.jobTitle,
          status: profile.status,
          roleCodes: roles.map((role) => role.code),
        };
      });
    },

    async updateStaffIdentity(input): Promise<void> {
      await client.staffProfile.update({
        where: { id: input.staffId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          jobTitle: input.jobTitle,
        },
        select: { id: true },
      });
    },

    async replaceStaffRoles(input): Promise<{ assigned: string[]; revoked: string[] }> {
      return client.$transaction(async (tx) => {
        const [links, targets] = await Promise.all([
          tx.staffRole.findMany({
            where: { staffId: input.staffId },
            select: { roleId: true, role: { select: { code: true } } },
          }),
          tx.role.findMany({
            where: { code: { in: [...input.roleCodes] } },
            select: { id: true, code: true },
          }),
        ]);

        if (targets.length !== new Set(input.roleCodes).size) {
          throw new AppError("VALIDATION", "Rôle inconnu.");
        }

        const currentCodes = new Set(links.map((link) => link.role.code));
        const targetCodes = new Set(targets.map((role) => role.code));

        const assigned = targets.filter((role) => !currentCodes.has(role.code));
        const revoked = links.filter((link) => !targetCodes.has(link.role.code));

        if (revoked.length > 0) {
          await tx.staffRole.deleteMany({
            where: { staffId: input.staffId, roleId: { in: revoked.map((link) => link.roleId) } },
          });
        }
        if (assigned.length > 0) {
          await tx.staffRole.createMany({
            data: assigned.map((role) => ({ staffId: input.staffId, roleId: role.id })),
            skipDuplicates: true,
          });
        }

        return {
          assigned: assigned.map((role) => role.code),
          revoked: revoked.map((link) => link.role.code),
        };
      });
    },

    async setProfileStatus(input): Promise<void> {
      const staff = await client.staffProfile.findUnique({
        where: { id: input.staffId },
        select: { profileId: true },
      });
      if (!staff) {
        throw new AppError("NOT_FOUND", "Ce compte est introuvable.");
      }

      await client.profile.update({
        where: { id: staff.profileId },
        data: { status: input.status },
        select: { id: true },
      });
    },

    async discardNewAccount(authUserId: string): Promise<void> {
      await client.$transaction(async (tx) => {
        const profile = await tx.profile.findUnique({
          where: { authUserId },
          select: { id: true },
        });
        if (!profile) {
          return;
        }

        // Ordre imposé : les dépendances d'abord, le profil ensuite (la FK vers `auth.users` est
        // `ON DELETE RESTRICT`, T39 : supprimer l'utilisateur Auth avant le profil est refusé).
        await tx.customerProfile.deleteMany({ where: { profileId: profile.id } });
        await tx.staffRole.deleteMany({ where: { staff: { profileId: profile.id } } });
        await tx.staffProfile.deleteMany({ where: { profileId: profile.id } });
        await tx.profile.delete({ where: { id: profile.id } });
      });
    },
  };
}
