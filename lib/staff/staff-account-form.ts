import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
  issueFields,
} from "@/lib/auth/password-policy";

/**
 * Analyse des formulaires de l'écran « Personnel » (gestion des comptes internes).
 *
 * Module **pur**, sans JSX, importable par un test en environnement `node`.
 *
 * Règles :
 * - **seuls les champs connus sont lus** (`readKnownFields`) : un champ privilégié envoyé par le
 *   navigateur (`userType`, `status`, `id`, `profileId`, `authUserId`, `active`…) n'est jamais lu,
 *   donc jamais appliqué — le service refuse en plus explicitement toute clé inconnue ;
 * - les erreurs n'exposent que des **noms de champs**, jamais une valeur saisie : le mot de passe
 *   initial d'un nouveau membre ne doit apparaître dans aucun message, aucun journal ;
 * - le champ de confirmation n'est jamais renvoyé : il n'a servi qu'au contrôle.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nameSchema = z.string().trim().min(1).max(120);
const jobTitleSchema = z.string().trim().max(120);
const roleCodeSchema = z.string().trim().min(1).max(64);
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const staffIdSchema = z.string().trim().min(1).max(64);

export const STAFF_ACCOUNT_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type StaffAccountStatus = (typeof STAFF_ACCOUNT_STATUSES)[number];

const createSchema = z
  .object({
    email: z.string().trim().min(3).max(254).regex(EMAIL_PATTERN),
    firstName: nameSchema,
    lastName: nameSchema,
    jobTitle: jobTitleSchema.optional(),
    roleCodes: z.array(roleCodeSchema).min(1, "Au moins un rôle est requis."),
    password: passwordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .strict();

const updateSchema = z
  .object({
    staffId: staffIdSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    jobTitle: jobTitleSchema.optional(),
    roleCodes: z.array(roleCodeSchema).min(1, "Au moins un rôle est requis."),
  })
  .strict();

const statusSchema = z
  .object({
    staffId: staffIdSchema,
    status: z.enum(STAFF_ACCOUNT_STATUSES),
    // Motif obligatoire : un changement de statut de compte est une transition sensible auditée
    // (`account.status.change` figure dans `sensitiveTransitionsRequiringReason`).
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type StaffAccountCreateInput = {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  roleCodes: string[];
  password: string;
};

export type StaffAccountUpdateInput = {
  staffId: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  roleCodes: string[];
};

export type StaffAccountStatusInput = {
  staffId: string;
  status: StaffAccountStatus;
  reason: string;
};

export const STAFF_ACCOUNT_CREATE_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "jobTitle",
  "roleCodes",
  "password",
  "confirmPassword",
] as const;

export const STAFF_ACCOUNT_UPDATE_FIELDS = [
  "staffId",
  "firstName",
  "lastName",
  "jobTitle",
  "roleCodes",
] as const;

export const STAFF_ACCOUNT_STATUS_FIELDS = ["staffId", "status", "reason"] as const;

/** Erreur de validation : seuls les NOMS de champs sont exposés. */
export class StaffAccountValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[], message = "Entrée invalide.") {
    super("VALIDATION", message);
    this.name = "StaffAccountValidationError";
    this.fields = fields;
  }
}

/** Seuls les champs connus sont lus : un champ privilégié n'est jamais lu, donc jamais appliqué. */
function readCreateFields(formData: FormData): Record<string, unknown> {
  const jobTitle = formData.get("jobTitle");
  return {
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    jobTitle: typeof jobTitle === "string" && jobTitle.trim().length > 0 ? jobTitle : undefined,
    roleCodes: formData.getAll("roleCodes").filter((value) => typeof value === "string"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };
}

function readUpdateFields(formData: FormData): Record<string, unknown> {
  const jobTitle = formData.get("jobTitle");
  return {
    staffId: formData.get("staffId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    jobTitle: typeof jobTitle === "string" && jobTitle.trim().length > 0 ? jobTitle : undefined,
    roleCodes: formData.getAll("roleCodes").filter((value) => typeof value === "string"),
  };
}

function readStatusFields(formData: FormData): Record<string, unknown> {
  return {
    staffId: formData.get("staffId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? "",
  };
}

export function parseStaffAccountCreateInput(formData: FormData): StaffAccountCreateInput {
  const parsed = createSchema.safeParse(readCreateFields(formData));
  if (!parsed.success) {
    throw new StaffAccountValidationError(issueFields(parsed.error), PASSWORD_POLICY_MESSAGE);
  }

  const { password, confirmPassword, ...rest } = parsed.data;

  if (password !== confirmPassword) {
    throw new StaffAccountValidationError(["confirmPassword"], PASSWORD_MISMATCH_MESSAGE);
  }

  return {
    email: rest.email.toLowerCase(),
    firstName: rest.firstName,
    lastName: rest.lastName,
    jobTitle: rest.jobTitle ?? null,
    roleCodes: [...new Set(rest.roleCodes)],
    password,
  };
}

export function parseStaffAccountUpdateInput(formData: FormData): StaffAccountUpdateInput {
  const parsed = updateSchema.safeParse(readUpdateFields(formData));
  if (!parsed.success) {
    throw new StaffAccountValidationError(issueFields(parsed.error));
  }

  return {
    staffId: parsed.data.staffId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    jobTitle: parsed.data.jobTitle ?? null,
    roleCodes: [...new Set(parsed.data.roleCodes)],
  };
}

export function parseStaffAccountStatusInput(formData: FormData): StaffAccountStatusInput {
  const parsed = statusSchema.safeParse(readStatusFields(formData));
  if (!parsed.success) {
    throw new StaffAccountValidationError(issueFields(parsed.error));
  }

  return parsed.data;
}
