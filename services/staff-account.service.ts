import { z } from "zod";
import { AppError, type ErrorCode } from "@/lib/errors";
import {
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
  issueFields,
} from "@/lib/auth/password-policy";
import {
  STAFF_ACCOUNT_STATUSES,
  StaffAccountValidationError,
  type StaffAccountStatus,
} from "@/lib/staff/staff-account-form";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createStaffAccountRepository } from "@/repositories/staff-account.repository";
import { requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { AuditWriter } from "@/services/vehicle.service";
import type { Actor, ProfileStatus } from "@/services/identity.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Gestion des comptes internes du back-office — écran « Personnel » (lot 7).
 *
 * Ferme la décision **D23** du corpus : « `staff:grant` ajoute un rôle mais aucune commande ne le
 * retire ni ne désactive un membre ; la révocation se fait aujourd'hui par SQL/console — à outiller ».
 *
 * Règles tenues par ce module :
 * - **autorisation** : `user.manage` (permission **existante**, ADMIN seul) pour toutes les
 *   opérations. Aucun code de permission n'est créé (T42 / D21). Le refus est **neutre** ;
 * - **périmètre** : uniquement les comptes `userType = STAFF`. Les comptes clients ne sont ni créés
 *   ni convertis (décision U2) : un client s'inscrit lui-même (doc 11) ;
 * - **aucune suppression** : « supprimer » = désactiver (`Profile.status = DISABLED`), réversible
 *   (décision U3 ; doc 20 §4 « suspendre plutôt que supprimer »). « Réactiver » repasse à `ACTIVE` ;
 * - **statut** : tout statut ≠ `ACTIVE` est traité comme non authentifié par `identity.service`
 *   (contrat §4.1), donc `DISABLED` révoque réellement l'accès ;
 * - **auto-protection** (T50) : un membre ne peut ni changer son propre statut, ni se retirer à
 *   lui-même le rôle ADMIN ;
 * - **aucune adoption de compte existant** (T52) : si l'adresse existe déjà, la création est
 *   refusée. Convertir un compte client en compte personnel serait une élévation de privilège ;
 * - **`customer_profiles` parasite** (T53) : le trigger `on_auth_user_created` crée un profil client
 *   pour chaque utilisateur Auth ; la création d'un compte personnel le supprime dans la même
 *   transaction, pour qu'un membre du personnel n'apparaisse jamais dans la liste Clients ;
 * - **compensation** (T54) : si la transaction échoue après la création de l'utilisateur Auth, le
 *   compte est retiré (profil puis utilisateur Auth, ordre imposé par la FK `RESTRICT` de T39),
 *   faute de quoi l'adresse serait définitivement refusée (T52) ;
 * - **mot de passe** (T51) : il n'est ni généré, ni renvoyé, ni journalisé, ni affiché. Il est fourni
 *   par l'administrateur qui crée le compte (le projet n'a ni SMTP ni `mailer_autoconfirm`) ;
 * - **audit** (D06) : rôle/permission du personnel (`staff.role.assign` / `staff.role.revoke`) et
 *   statut de compte (`staff.activate` / `staff.deactivate`), avec motif obligatoire pour un
 *   changement de statut. L'édition des noms et de la fonction n'est pas auditée (D06 ne la liste pas).
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port) et un port
 * d'identité (API admin Supabase). Les deux sont remplaçables par les tests.
 */

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------

export type { StaffAccountStatus };

/** Statuts exposés par l'écran : `ACTIVE` ↔ `DISABLED`, rien d'autre (T55). */
const STAFF_ACTIONS = STAFF_ACCOUNT_STATUSES;

/** Un rôle attribuable, lu depuis la table `roles` (aucune valeur inventée). */
export type StaffRoleOption = { code: string; name: string };

/** Projection publique : jamais `profileId`, ni `authUserId` (CLAUDE.md §7). */
export type StaffAccountView = {
  staffId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: ProfileStatus;
  active: boolean;
  roleCodes: string[];
};

export type StaffAccountList = {
  accounts: StaffAccountView[];
  roles: StaffRoleOption[];
};

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** Ligne interne : `authUserId` sert à lire l'e-mail, il n'est jamais projeté. */
export type StaffAccountRow = {
  staffId: string;
  authUserId: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: ProfileStatus;
  roleCodes: string[];
};

export type StaffAccountRepository = {
  listRoles(): Promise<StaffRoleOption[]>;
  listStaffAccounts(): Promise<StaffAccountRow[]>;
  findStaffAccount(staffId: string): Promise<StaffAccountRow | null>;
  /**
   * Crée le compte personnel en **une transaction** : `profiles` passe en `STAFF`, le
   * `customer_profiles` créé par le trigger est supprimé, `staff_profiles` est créé et les rôles
   * sont attachés.
   */
  createStaffAccount(input: {
    authUserId: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    roleCodes: string[];
  }): Promise<StaffAccountRow>;
  updateStaffIdentity(input: {
    staffId: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
  }): Promise<void>;
  /** Remplace les rôles par la liste donnée : renvoie ce qui a été attribué et retiré. */
  replaceStaffRoles(input: {
    staffId: string;
    roleCodes: string[];
  }): Promise<{ assigned: string[]; revoked: string[] }>;
  setProfileStatus(input: { staffId: string; status: ProfileStatus }): Promise<void>;
  /** Compensation (T54) : retire le profil créé par le trigger pour un compte tout neuf. */
  discardNewAccount(authUserId: string): Promise<void>;
};

/** Port d'identité : seule l'API Auth d'administration. */
export type StaffIdentityPort = {
  findUserIdByEmail(email: string): Promise<string | null>;
  /** Crée un utilisateur Auth **confirmé** (aucun e-mail n'est envoyé) et renvoie son identifiant. */
  createConfirmedUser(input: { email: string; password: string }): Promise<string>;
  /** Retire l'utilisateur Auth (compensation). */
  deleteUser(authUserId: string): Promise<void>;
  /** Adresses des membres : elles vivent dans `auth.users`, pas dans `profiles` (T56). */
  findEmailsByIds(authUserIds: readonly string[]): Promise<Record<string, string>>;
};

export type StaffAccountDependencies = {
  repository: StaffAccountRepository;
  identity: StaffIdentityPort;
  audit: AuditWriter;
  /** Client d'administration, injectable pour les tests. */
  adminClient?: () => SupabaseClient;
};

// ---------------------------------------------------------------------------
// Schémas (revérifiés côté service, en plus de l'analyse du formulaire)
// ---------------------------------------------------------------------------

const roleCodeSchema = z.string().trim().min(1).max(64);

const createSchema = z
  .object({
    email: z.string().trim().min(3).max(254),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    jobTitle: z.string().trim().max(120).nullish(),
    roleCodes: z.array(roleCodeSchema).min(1),
    password: z.string().min(1).max(200),
    confirmPassword: z.string().max(200),
  })
  .strict();

const updateSchema = z
  .object({
    staffId: z.string().trim().min(1).max(64),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    jobTitle: z.string().trim().max(120).nullish(),
    roleCodes: z.array(roleCodeSchema).min(1),
  })
  .strict();

const statusSchema = z
  .object({
    staffId: z.string().trim().min(1).max(64),
    status: z.enum(STAFF_ACTIONS),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

// ---------------------------------------------------------------------------
// Messages (neutres : jamais de donnée, jamais de secret)
// ---------------------------------------------------------------------------

const NOT_FOUND_MESSAGE = "Ce compte est introuvable.";

/**
 * Erreur d'administration d'identité portant les **noms** des champs fautifs (jamais une valeur).
 * `AppError` n'accepte pas de champs : seul le champ `fields` est exposé par `toErrorResponse`.
 */
class StaffAccountError extends AppError {
  readonly fields: string[];

  constructor(code: ErrorCode, fields: string[], message: string) {
    super(code, message);
    this.name = "StaffAccountError";
    this.fields = fields;
  }
}

const DUPLICATE_MESSAGE =
  "Un compte existe déjà pour cette adresse. La création est refusée : un compte client ne peut pas être converti en compte personnel.";
const ROLE_UNKNOWN_MESSAGE = "Rôle inconnu.";
const SELF_STATUS_MESSAGE = "Vous ne pouvez pas changer le statut de votre propre compte.";
const SELF_ROLE_MESSAGE = "Vous ne pouvez pas vous retirer vous-même le rôle Administrateur.";
const REASON_MESSAGE = "Un motif est obligatoire pour changer le statut d'un compte.";
const EMAIL_TAKEN_MESSAGE =
  "Cette adresse est déjà utilisée par un compte existant. Supprimez ce compte dans Supabase, puis réessayez.";

// ---------------------------------------------------------------------------
// Dépendances
// ---------------------------------------------------------------------------

let dependencies: StaffAccountDependencies = {
  repository: createStaffAccountRepository(),
  identity: createSupabaseIdentityPort(),
  audit: createAuditWriter(),
  adminClient: createSupabaseAdminClient,
};

export function configureStaffAccountDependencies(next: Partial<StaffAccountDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

export function resetStaffAccountDependencies(): void {
  dependencies = {
    repository: createStaffAccountRepository(),
    identity: createSupabaseIdentityPort(),
    audit: createAuditWriter(),
    adminClient: createSupabaseAdminClient,
  };
}

// ---------------------------------------------------------------------------
// Port d'identité (API admin Supabase)
// ---------------------------------------------------------------------------

/**
 * Implémentation réelle du port d'identité. Le client est obtenu par la fabrique injectée : elle
 * lève `INTERNAL` si la configuration service_role est absente, sans révéler quoi que ce soit.
 */
export function createSupabaseIdentityPort(client?: SupabaseClient): StaffIdentityPort {
  const resolve = () => client ?? dependencies.adminClient?.() ?? createSupabaseAdminClient();

  return {
    async findUserIdByEmail(email) {
      const supabase = resolve();
      const target = email.trim().toLowerCase();
      const perPage = 1000;

      for (let page = 1; page <= 1000; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) {
          throw new AppError("INTERNAL", "Administration d'identité indisponible.");
        }
        const match = data.users.find((user) => user.email?.trim().toLowerCase() === target);
        if (match) return match.id;
        if (data.users.length < perPage) return null;
      }

      return null;
    },

    async createConfirmedUser({ email, password }) {
      const supabase = resolve();
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        // Aucun e-mail de confirmation ne peut partir (ni SMTP ni mailer_autoconfirm) : le compte
        // créé par un administrateur est confirmé d'office, sinon il serait inutilisable.
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new StaffAccountError("VALIDATION", ["email"], EMAIL_TAKEN_MESSAGE);
      }

      return data.user.id;
    },

    async deleteUser(authUserId) {
      const supabase = resolve();
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) {
        throw new AppError("INTERNAL", "Compensation impossible : utilisateur Auth conservé.");
      }
    },

    async findEmailsByIds(authUserIds) {
      const supabase = resolve();
      const emails: Record<string, string> = {};
      for (const id of authUserIds) {
        const { data, error } = await supabase.auth.admin.getUserById(id);
        if (!error && data.user?.email) {
          emails[id] = data.user.email;
        }
      }

      return emails;
    },
  };
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

/** Vérifie que chaque code de rôle existe réellement en base (vocabulaire non inventé). */
async function assertKnownRoles(roleCodes: readonly string[]): Promise<void> {
  const roles = await dependencies.repository.listRoles();
  const known = new Set(roles.map((role) => role.code));
  const unknown = roleCodes.filter((code) => !known.has(code));
  if (unknown.length > 0) {
    throw new StaffAccountError("VALIDATION", ["roleCodes"], ROLE_UNKNOWN_MESSAGE);
  }
}

function toView(row: StaffAccountRow, email: string | null): StaffAccountView {
  return {
    staffId: row.staffId,
    email,
    firstName: row.firstName,
    lastName: row.lastName,
    jobTitle: row.jobTitle,
    status: row.status,
    active: row.status === "ACTIVE",
    roleCodes: [...row.roleCodes].sort(),
  };
}

async function assertPermission(actor: Actor) {
  return requireStaff(actor, "user.manage");
}

export async function listStaffAccounts(actor: Actor): Promise<StaffAccountList> {
  await assertPermission(actor);

  const [rows, roles] = await Promise.all([
    dependencies.repository.listStaffAccounts(),
    dependencies.repository.listRoles(),
  ]);

  const emails = await dependencies.identity.findEmailsByIds(rows.map((row) => row.authUserId));

  const accounts = rows
    .map((row) => toView(row, emails[row.authUserId] ?? null))
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`, "fr"),
    );

  return { accounts, roles: [...roles].sort((a, b) => a.code.localeCompare(b.code)) };
}

export async function createStaffAccount(actor: Actor, input: unknown): Promise<StaffAccountView> {
  await assertPermission(actor);

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new StaffAccountValidationError(issueFields(parsed.error), PASSWORD_POLICY_MESSAGE);
  }

  const data = parsed.data;
  if (data.password !== data.confirmPassword) {
    throw new StaffAccountValidationError(["confirmPassword"], PASSWORD_MISMATCH_MESSAGE);
  }

  const email = data.email.toLowerCase();
  await assertKnownRoles(data.roleCodes);

  // T52 : aucun rattachement à un compte existant.
  const existing = await dependencies.identity.findUserIdByEmail(email);
  if (existing) {
    throw new StaffAccountError("CONFLICT", ["email"], DUPLICATE_MESSAGE);
  }

  const authUserId = await dependencies.identity.createConfirmedUser({
    email,
    password: data.password,
  });

  let row: StaffAccountRow;
  try {
    row = await dependencies.repository.createStaffAccount({
      authUserId,
      firstName: data.firstName,
      lastName: data.lastName,
      jobTitle: data.jobTitle ?? null,
      roleCodes: data.roleCodes,
    });
  } catch (error) {
    await compensate(authUserId);
    throw error;
  }

  await dependencies.audit(
    buildAuditEntry({
      actorProfileId: actor.kind === "staff" ? actor.profileId : null,
      action: "staff.role.assign",
      entityType: "staff_profile",
      entityId: row.staffId,
      newValues: { roleCodes: [...data.roleCodes].sort(), email },
    }),
  );

  return toView(row, email);
}

export async function updateStaffAccount(actor: Actor, input: unknown): Promise<StaffAccountView> {
  const staff = await assertPermission(actor);

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    throw new StaffAccountValidationError(issueFields(parsed.error));
  }

  const data = parsed.data;
  await assertKnownRoles(data.roleCodes);

  const current = await dependencies.repository.findStaffAccount(data.staffId);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  // T50 : un membre ne peut pas se retirer à lui-même le rôle ADMIN.
  const isSelf = data.staffId === staff.staffId;
  if (isSelf && current.roleCodes.includes("ADMIN") && !data.roleCodes.includes("ADMIN")) {
    throw new AppError("FORBIDDEN", SELF_ROLE_MESSAGE);
  }

  await dependencies.repository.updateStaffIdentity({
    staffId: data.staffId,
    firstName: data.firstName,
    lastName: data.lastName,
    jobTitle: data.jobTitle ?? null,
  });

  const { assigned, revoked } = await dependencies.repository.replaceStaffRoles({
    staffId: data.staffId,
    roleCodes: data.roleCodes,
  });

  const actorProfileId = actor.kind === "staff" ? actor.profileId : null;
  if (assigned.length > 0) {
    await dependencies.audit(
      buildAuditEntry({
        actorProfileId,
        action: "staff.role.assign",
        entityType: "staff_profile",
        entityId: data.staffId,
        newValues: { roleCodes: assigned.sort() },
      }),
    );
  }
  if (revoked.length > 0) {
    await dependencies.audit(
      buildAuditEntry({
        actorProfileId,
        action: "staff.role.revoke",
        entityType: "staff_profile",
        entityId: data.staffId,
        oldValues: { roleCodes: revoked.sort() },
      }),
    );
  }

  const emails = await dependencies.identity.findEmailsByIds([current.authUserId]);

  return toView(
    { ...current, firstName: data.firstName, lastName: data.lastName, jobTitle: data.jobTitle ?? null, roleCodes: data.roleCodes },
    emails[current.authUserId] ?? null,
  );
}

export async function setStaffAccountStatus(
  actor: Actor,
  input: unknown,
): Promise<StaffAccountView> {
  const staff = await assertPermission(actor);

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    const fields = issueFields(parsed.error);
    throw new StaffAccountValidationError(
      fields.includes("reason") ? fields : [...fields, "reason"].sort(),
      fields.includes("reason") ? REASON_MESSAGE : undefined,
    );
  }

  const data = parsed.data;
  const current = await dependencies.repository.findStaffAccount(data.staffId);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  // T50 : un membre ne peut pas changer le statut de son propre compte.
  if (data.staffId === staff.staffId) {
    throw new AppError("FORBIDDEN", SELF_STATUS_MESSAGE);
  }

  await dependencies.repository.setProfileStatus({ staffId: data.staffId, status: data.status });

  await dependencies.audit(
    buildAuditEntry({
      actorProfileId: actor.kind === "staff" ? actor.profileId : null,
      action: data.status === "ACTIVE" ? "staff.activate" : "staff.deactivate",
      entityType: "staff_profile",
      entityId: data.staffId,
      oldValues: { status: current.status },
      newValues: { status: data.status, roleCodes: [...current.roleCodes].sort() },
      reason: data.reason,
    }),
  );

  const emails = await dependencies.identity.findEmailsByIds([current.authUserId]);

  return toView({ ...current, status: data.status }, emails[current.authUserId] ?? null);
}

/** Retire les lignes créées par le trigger pour un compte tout neuf (T54). */
async function compensate(authUserId: string): Promise<void> {
  try {
    await dependencies.repository.discardNewAccount(authUserId);
    await dependencies.identity.deleteUser(authUserId);
  } catch {
    // La compensation est un meilleur effort : si elle échoue, l'erreur d'origine est plus utile à
    // l'opérateur que l'échec de compensation. L'adresse reste refusée (T52) et se répare dans Supabase.
  }
}
