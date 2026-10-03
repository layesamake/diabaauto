import { prisma } from "@/lib/prisma/client";
import type { PermissionCode } from "@/services/permissions.service";
import type { ResellerStatus } from "@/services/pricing.service";
import { unionRolePermissions, type IdentityRepository, type ProfileRecord, type StaffRoleRecord } from "@/services/identity.service";

/**
 * Accès aux données des profils (CLAUDE.md §7 : « retourner des objets explicitement sélectionnés selon
 * l'acteur. Éviter de sérialiser un modèle Prisma complet »).
 *
 * Cette connexion est privilégiée côté serveur et peut contourner RLS : les contrôles de permission et
 * de propriété restent obligatoires dans les services (doc 11).
 *
 * Les rôles du personnel sont lus via la table de jointure `staff_roles` → `roles.permissions`
 * (relation N:N du schéma canonique) : il n'existe plus de `staff.role` ni de `staff.active`.
 */
const profileSelect = {
  id: true,
  authUserId: true,
  userType: true,
  status: true,
  customer: { select: { id: true, resellerStatus: true } },
  staff: {
    select: {
      id: true,
      roles: {
        select: {
          role: {
            select: {
              code: true,
              permissions: { select: { permission: { select: { code: true } } } },
            },
          },
        },
      },
    },
  },
} as const;

export type ProfileRow = {
  id: string;
  authUserId: string;
  userType: "CUSTOMER" | "STAFF";
  status: ProfileRecord["status"];
  customer: { id: string; resellerStatus: ResellerStatus } | null;
  staff: {
    id: string;
    roles: { role: { code: string; permissions: { permission: { code: string } }[] } }[];
  } | null;
};

/**
 * Traduit les lignes de jointure en rôles du domaine : rôles triés par code, permissions de chaque
 * rôle triées, et union dédupliquée (`unionRolePermissions`) portée par `staff.permissions`.
 */
function toStaffRecord(staff: NonNullable<ProfileRow["staff"]>): {
  id: string;
  roles: StaffRoleRecord[];
  permissions: PermissionCode[];
} {
  const roles: StaffRoleRecord[] = staff.roles
    .map((entry) => ({
      code: entry.role.code,
      permissions: entry.role.permissions
        .map((item) => item.permission.code as PermissionCode)
        .sort(),
    }))
    .sort((left, right) => left.code.localeCompare(right.code));

  return { id: staff.id, roles, permissions: unionRolePermissions(roles) };
}

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toProfileRecord(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    authUserId: row.authUserId,
    userType: row.userType,
    status: row.status,
    customer: row.customer ? { id: row.customer.id, resellerStatus: row.customer.resellerStatus } : null,
    staff: row.staff ? toStaffRecord(row.staff) : null,
  };
}

export function createIdentityRepository(): IdentityRepository {
  return {
    async findByAuthUserId(authUserId: string) {
      const row = await prisma.profile.findUnique({ where: { authUserId }, select: profileSelect });
      return row ? toProfileRecord(row as ProfileRow) : null;
    },

    /**
     * Idempotent : l'unicité `profiles.auth_user_id` et l'`upsert` garantissent l'absence de doublon
     * même en cas d'appels concurrents (doc 11 : « création fiable et idempotente »).
     * Le domaine privilégié n'est jamais fourni par l'appelant : toujours CUSTOMER / ACTIVE ici.
     * Les champs obligatoires du profil personnel (`firstName`, `lastName`) sont renseignés ;
     * `preferred_locale`, `country`, `pricing_profile`, `customer_segment` et `reseller_status`
     * prennent leurs valeurs par défaut du schéma.
     */
    async createCustomerProfile(input: { authUserId: string; firstName: string; lastName: string }) {
      const row = await prisma.profile.upsert({
        where: { authUserId: input.authUserId },
        create: {
          authUserId: input.authUserId,
          userType: "CUSTOMER",
          status: "ACTIVE",
          preferredLocale: "fr",
          customer: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              country: "SN",
            },
          },
        },
        update: {},
        select: profileSelect,
      });

      return toProfileRecord(row as ProfileRow);
    },
  };
}