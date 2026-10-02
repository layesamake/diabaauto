import { z } from "zod";
import { AppError } from "@/lib/errors";
import { assertOwnProfile, requireCustomer } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";

/**
 * Profil client (My Diaba Auto).
 *
 * Seuls les « champs personnels autorisés » sont acceptés (doc 11). Les champs privilégiés
 * (`userType`, statut de compte, `resellerStatus`, `pricingProfile`, `segment`, rôles) et tout champ
 * inconnu sont rejetés : un utilisateur ne peut pas se déclarer STAFF, ADMIN, Revendeur approuvé ni
 * modifier son profil tarifaire ou son segment (doc 11, dev.md §5-6).
 */
export const customerProfileUpdateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(32).nullish(),
    whatsapp: z.string().trim().max(32).nullish(),
    city: z.string().trim().max(80).nullish(),
    country: z.string().trim().max(80).nullish(),
  })
  .strict();

export type CustomerProfileUpdate = z.infer<typeof customerProfileUpdateSchema>;

export type CustomerProfileView = {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string | null;
  resellerStatus: string;
};

export class ProfileValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "ProfileValidationError";
    this.fields = fields;
  }
}

/** Valide les entrées ; n'expose jamais la valeur fautive dans le message. */
export function parseCustomerProfileUpdate(input: unknown): CustomerProfileUpdate {
  const result = customerProfileUpdateSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.flatMap((issue) => issueFields(issue)))].sort();
    throw new ProfileValidationError(fields);
  }

  return result.data;
}

/** Un champ inconnu est signalé par zod via `keys` (et non via `path`) : les deux cas sont couverts. */
function issueFields(issue: { path: PropertyKey[]; keys?: string[] }): string[] {
  if (Array.isArray(issue.keys) && issue.keys.length > 0) {
    return issue.keys;
  }

  return [String(issue.path[0] ?? "unknown")];
}

/** Projection explicite : aucune donnée interne ni donnée d'un autre client n'est retournée. */
export function projectCustomerProfile(row: {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string | null;
  resellerStatus: string;
}): CustomerProfileView {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    city: row.city ?? null,
    country: row.country ?? null,
    resellerStatus: row.resellerStatus,
  };
}

export type CustomerProfileRepository = {
  readProfile(customerId: string): Promise<{
    firstName: string;
    lastName: string;
    phone: string | null;
    whatsapp: string | null;
    city: string | null;
    country: string | null;
    resellerStatus: string;
  } | null>;
  updateProfile(customerId: string, data: CustomerProfileUpdate): Promise<{
    firstName: string;
    lastName: string;
    phone: string | null;
    whatsapp: string | null;
    city: string | null;
    country: string | null;
    resellerStatus: string;
  } | null>;
};

export async function readOwnCustomerProfile(
  repository: CustomerProfileRepository,
  actor: Actor,
): Promise<CustomerProfileView> {
  const customer = requireCustomer(actor);
  assertOwnProfile(actor, customer.profileId);

  const row = await repository.readProfile(customer.customerId);
  if (!row) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  return projectCustomerProfile(row);
}

export async function updateOwnCustomerProfile(
  repository: CustomerProfileRepository,
  actor: Actor,
  input: unknown,
): Promise<CustomerProfileView> {
  const customer = requireCustomer(actor);
  assertOwnProfile(actor, customer.profileId);

  const data = parseCustomerProfileUpdate(input);
  const row = await repository.updateProfile(customer.customerId, data);
  if (!row) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  return projectCustomerProfile(row);
}
