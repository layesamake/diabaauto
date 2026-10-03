import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createStaffCustomerRepository } from "@/repositories/staff-customer.repository";
import { requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import type { ResellerStatus } from "@/services/pricing.service";
import type { AuditWriter } from "@/services/vehicle.service";

/**
 * Gestion des clients par le personnel — back-office « Clients » (doc 05 §5 : « Table + fiche »,
 * contrat lot 5 §4 et §5).
 *
 * Règles tenues par ce module :
 * - **autorisation** : `customer.view` pour lister et consulter, `customer.edit` pour modifier
 *   (segment, coordonnées) et pour changer le statut Revendeur (contrat §4). Aucune permission
 *   nouvelle n'est inventée (T20) ; le refus est **neutre** et n'expose aucune donnée ;
 * - **projection explicite** : seules les colonnes utiles à l'écran sont retournées, jamais un
 *   modèle Prisma complet ni un identifiant interne (`profileId`, `authUserId`) — CLAUDE.md §7 ;
 * - **validation stricte** : un champ inconnu ou privilégié (`resellerStatus`, `pricingProfile`,
 *   `status`, `userType`, `id`, `profileId`, `roles`, `roleCodes`…) est **refusé**, jamais ignoré :
 *   le statut Revendeur se change uniquement par `setResellerStatus`, jamais par un patch de fiche ;
 * - **audit** : un changement de statut Revendeur produit une entrée `reseller.status.change`
 *   (doc 09 §10 « Approbation Revendeur … + Audit », D06). L'édition des coordonnées/segment n'est
 *   pas auditée (D06 ne la liste pas). Le statut Revendeur modifie **uniquement** `reseller_status` :
 *   le passage à `pricing_profile = RESELLER` relève de la transaction d'approbation
 *   (`services/reseller-application.service.ts`, contrat §5) et n'est **pas** rejoué ici.
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port), comme
 * `services/custom-request.service.ts` / `services/pricing.service.ts`. Son repository **par défaut**
 * est le repository Prisma (`repositories/staff-customer.repository.ts`), remplaçable par les tests
 * via `configureStaffCustomerDependencies`.
 */

// ---------------------------------------------------------------------------
// Vocabulaire (enums existants du corpus — aucune valeur inventée)
// ---------------------------------------------------------------------------

/** `CustomerSegment` du schéma figé (doc 03 §3). */
export type CustomerSegment = "INDIVIDUAL" | "FLEET" | "GARAGE" | "OTHER";

/** `PricingProfile` du schéma figé (doc 03 §9). */
export type PricingProfile = "STANDARD" | "RESELLER";

const CUSTOMER_SEGMENTS: readonly CustomerSegment[] = ["INDIVIDUAL", "FLEET", "GARAGE", "OTHER"];
const RESELLER_STATUSES: readonly ResellerStatus[] = [
  "NOT_APPLICABLE",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

export type CustomerFilters = {
  segment?: CustomerSegment;
  resellerStatus?: ResellerStatus;
  /** Recherche libre sur le nom, le téléphone, la ville ou la raison sociale. */
  search?: string;
};

/** Champs réellement modifiables par le personnel (contrat §4 : « segment, coordonnées »). */
export type CustomerUpdateData = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  country?: string;
  segment?: CustomerSegment;
};

/** Ligne telle que retournée par le repository : projection figée, jamais un modèle Prisma complet. */
export type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string;
  companyName: string | null;
  segment: CustomerSegment;
  pricingProfile: PricingProfile;
  resellerStatus: ResellerStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** Élément de la table « Clients ». */
export type CustomerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string;
  segment: CustomerSegment;
  pricingProfile: PricingProfile;
  resellerStatus: ResellerStatus;
  createdAt: Date;
};

/** Fiche client détaillée. */
export type CustomerDetail = CustomerListItem & {
  companyName: string | null;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Port d'accès aux données (`customer_profiles` uniquement)
// ---------------------------------------------------------------------------

/**
 * Port du service personnel clients. Le repository Prisma l'implémente
 * (`repositories/staff-customer.repository.ts`) ; les tests unitaires fournissent un double.
 * `updateCustomer` n'applique que les clés présentes (patch partiel) ; `null` signifie « ligne
 * introuvable » et donne un refus neutre (`NOT_FOUND`).
 */
export type StaffCustomerRepository = {
  listCustomers(filters: CustomerFilters): Promise<CustomerRow[]>;
  readCustomer(customerId: string): Promise<CustomerRow | null>;
  updateCustomer(customerId: string, data: CustomerUpdateData): Promise<CustomerRow | null>;
  setResellerStatus(customerId: string, status: ResellerStatus): Promise<CustomerRow | null>;
};

export type StaffCustomerDependencies = {
  repository: StaffCustomerRepository;
  audit: AuditWriter;
};

let dependencies: StaffCustomerDependencies = {
  repository: createStaffCustomerRepository(),
  audit: createAuditWriter(),
};

/** Remplace le repository ou la piste d'audit (tests unitaires, ou composition serveur). */
export function configureStaffCustomerDependencies(next: Partial<StaffCustomerDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les dépendances par défaut (repository Prisma, audit Prisma). */
export function resetStaffCustomerDependencies(): void {
  dependencies = { repository: createStaffCustomerRepository(), audit: createAuditWriter() };
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export class StaffCustomerValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "StaffCustomerValidationError";
    this.fields = fields;
  }
}

const NOT_FOUND_MESSAGE = "Ressource introuvable.";

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

const NAME_MAX_LENGTH = 80;
const PHONE_MAX_LENGTH = 32;
const TEXT_MAX_LENGTH = 80;
const SEARCH_MAX_LENGTH = 120;

const filtersSchema = z
  .object({
    segment: z.enum(CUSTOMER_SEGMENTS).optional(),
    resellerStatus: z.enum(RESELLER_STATUSES).optional(),
    search: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
  })
  .strict();

const customerPatchSchema = z
  .object({
    firstName: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
    lastName: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
    phone: z.string().trim().max(PHONE_MAX_LENGTH).nullish(),
    whatsapp: z.string().trim().max(PHONE_MAX_LENGTH).nullish(),
    city: z.string().trim().max(TEXT_MAX_LENGTH).nullish(),
    country: z.string().trim().min(1).max(TEXT_MAX_LENGTH).optional(),
    segment: z.enum(CUSTOMER_SEGMENTS).optional(),
  })
  .strict();

const resellerStatusSchema = z.enum(RESELLER_STATUSES);

/** Un champ inconnu est signalé par zod via `keys` (et non via `path`) : les deux cas sont couverts. */
function issueFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.flatMap((issue) => fieldNames(issue)))].sort();
}

function fieldNames(issue: { path: PropertyKey[]; keys?: string[] }): string[] {
  if (Array.isArray(issue.keys) && issue.keys.length > 0) {
    return issue.keys;
  }

  return [String(issue.path[0] ?? "unknown")];
}

/** Valide et normalise les filtres de liste. Un champ inconnu est refusé, jamais ignoré. */
export function parseCustomerFilters(input: unknown): CustomerFilters {
  const result = filtersSchema.safeParse(input ?? {});
  if (!result.success) {
    throw new StaffCustomerValidationError(issueFields(result.error));
  }

  return result.data;
}

/** Valide un patch de fiche client : au moins un champ, aucun champ privilégié ni inconnu. */
export function parseCustomerUpdate(input: unknown): CustomerUpdateData {
  const result = customerPatchSchema.safeParse(input);
  if (!result.success) {
    throw new StaffCustomerValidationError(issueFields(result.error));
  }

  if (Object.keys(result.data).length === 0) {
    throw new StaffCustomerValidationError(["patch"]);
  }

  return result.data;
}

/** Valide un identifiant de client (non vide) sans imposer de format — la cible vient du serveur. */
export function parseCustomerId(customerId: string): string {
  if (typeof customerId !== "string" || customerId.trim() === "") {
    throw new StaffCustomerValidationError(["customerId"]);
  }

  return customerId.trim();
}

/** Valide un statut Revendeur : seules les valeurs de l'enum existant sont acceptées. */
export function parseResellerStatus(status: unknown): ResellerStatus {
  const result = resellerStatusSchema.safeParse(status);
  if (!result.success) {
    throw new StaffCustomerValidationError(["status"]);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Projection de lecture
// ---------------------------------------------------------------------------

/** Projection explicite : aucune donnée interne (profileId, authUserId…) n'est exposée. */
export function toCustomerListItem(row: CustomerRow): CustomerListItem {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    city: row.city ?? null,
    country: row.country,
    segment: row.segment,
    pricingProfile: row.pricingProfile,
    resellerStatus: row.resellerStatus,
    createdAt: row.createdAt,
  };
}

export function toCustomerDetail(row: CustomerRow): CustomerDetail {
  return {
    ...toCustomerListItem(row),
    companyName: row.companyName ?? null,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

/** Liste des clients ; exige `customer.view` (contrat §4). Refus neutre sans aucune donnée. */
export async function listCustomers(actor: Actor, filters?: CustomerFilters): Promise<CustomerListItem[]> {
  requireStaff(actor, "customer.view");
  const parsed = parseCustomerFilters(filters);
  const rows = await dependencies.repository.listCustomers(parsed);
  return rows.map(toCustomerListItem);
}

/** Fiche d'un client ; exige `customer.view`. Client inconnu → `NOT_FOUND` neutre. */
export async function readCustomer(actor: Actor, customerId: string): Promise<CustomerDetail> {
  requireStaff(actor, "customer.view");
  const id = parseCustomerId(customerId);
  const row = await dependencies.repository.readCustomer(id);
  if (!row) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  return toCustomerDetail(row);
}

/**
 * Modifie segment et coordonnées ; exige `customer.edit`. Le statut Revendeur et tout champ
 * privilégié sont refusés en amont (validation stricte), avant tout accès aux données.
 */
export async function updateCustomer(actor: Actor, customerId: string, patch: unknown): Promise<CustomerDetail> {
  requireStaff(actor, "customer.edit");
  const id = parseCustomerId(customerId);
  const data = parseCustomerUpdate(patch);

  const row = await dependencies.repository.updateCustomer(id, data);
  if (!row) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  return toCustomerDetail(row);
}

/**
 * Change le statut Revendeur ; exige `customer.edit`. Seul `reseller_status` est écrit : le profil
 * tarifaire (`pricing_profile`) reste inchangé — l'octroi du tarif RESELLER est exclusivement porté
 * par l'approbation transactionnelle de `services/reseller-application.service.ts` (contrat §5).
 * Le changement est audité (`reseller.status.change`, doc 09 §10 / D06).
 */
export async function setResellerStatus(
  actor: Actor,
  customerId: string,
  status: ResellerStatus,
): Promise<CustomerDetail> {
  const staff = requireStaff(actor, "customer.edit");
  const id = parseCustomerId(customerId);
  const nextStatus = parseResellerStatus(status);

  const current = await dependencies.repository.readCustomer(id);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  if (current.resellerStatus === nextStatus) {
    return toCustomerDetail(current);
  }

  const updated = await dependencies.repository.setResellerStatus(id, nextStatus);
  if (!updated) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  await dependencies.audit(
    buildAuditEntry({
      actorProfileId: staff.profileId,
      action: "reseller.status.change",
      entityType: "CustomerProfile",
      entityId: id,
      oldValues: { resellerStatus: current.resellerStatus },
      newValues: { resellerStatus: nextStatus },
      reason: `Statut Revendeur défini sur ${nextStatus} par le personnel.`,
    }),
  );

  return toCustomerDetail(updated);
}