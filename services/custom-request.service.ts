import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createCustomRequestRepository } from "@/repositories/custom-request.repository";
import { requireCustomer, requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";

/**
 * Demande personnalisée (`/commander`, doc 04 §11, contrat lot 4 §2 Sous-agent C, décision T36).
 *
 * Règles tenues par ce module :
 * - accessible sans compte : un visiteur (et, par construction, un compte suspendu ou une session
 *   personnel — ni l'un ni l'autre n'est un `actor.kind === "customer"`) peut soumettre une demande
 *   sans jamais obtenir de `customerId` associé (invariant transversal : un compte suspendu n'obtient
 *   aucune demande lui appartenant) ;
 * - `contactName`/`contactPhone` sont **obligatoires** si `actor.kind !== "customer"` (le canal de
 *   rappel est le téléphone/WhatsApp, cohérent avec `leads.phone NOT NULL`) ;
 * - un client connecté ne peut jamais imposer son contact : les champs envoyés par le formulaire sont
 *   ignorés et la ligne ne porte aucun contact redondant — la cible (`customerId`) vient toujours de
 *   l'acteur résolu côté serveur, jamais du formulaire ;
 * - `budgetMin <= budgetMax` lorsque les deux sont fournis ; au moins un critère (marque, modèle ou
 *   remarque) est exigé — une demande vide n'a pas de sens métier ;
 * - `listOwnCustomRequests` ne retourne jamais `contactName`/`contactPhone`/`customerId` : seules les
 *   données utiles à l'affichage personnel sont projetées (dev.md §7).
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port), comme
 * `services/profile.service.ts` / `services/catalogue.service.ts`.
 */

export type CustomRequestStatus =
  | "RECEIVED"
  | "QUALIFIED"
  | "SEARCHING"
  | "PROPOSED"
  | "CLOSED"
  | "ABANDONED";

/** Critères texte libre ou issus des facettes publiques (`CatalogueFilters`) : aucun champ inventé. */
export type CustomRequestCriteria = {
  brand?: string;
  model?: string;
  notes?: string;
};

/** Filtres de la vue personnel (contrat lot 5 §5). Aucune valeur inventée. */
export type CustomRequestFilters = { status?: CustomRequestStatus };

export type CustomRequestView = {
  id: string;
  criteria: CustomRequestCriteria;
  budgetMin: string | null;
  budgetMax: string | null;
  status: CustomRequestStatus;
  createdAt: Date;
};

/** Ligne telle que retournée par le repository : JSON encore non narrowé vers `CustomRequestCriteria`. */
export type CustomRequestRow = {
  id: string;
  customerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  criteriaJson: Record<string, unknown>;
  budgetMin: string | null;
  budgetMax: string | null;
  status: CustomRequestStatus;
  createdAt: Date;
};

export type CustomRequestCreateData = {
  customerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  criteriaJson: CustomRequestCriteria;
  /** Colonnes du corpus (doc 03 §11) : reprennent la marque et le modèle souhaités de `criteriaJson`. */
  requestedBrand: string | null;
  requestedModel: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
};

/**
 * Port d'accès aux données — `custom_vehicle_requests` uniquement (contrat lot 4 §2 Sous-agent C,
 * table renommée au lot 5 §2.3). `create`/`listByCustomer` servent le parcours client ; `list`,
 * `findById` et `updateStatus` servent la vue personnel (contrat lot 5 §5).
 */
export type CustomRequestRepository = {
  create(data: CustomRequestCreateData): Promise<CustomRequestRow>;
  listByCustomer(customerId: string): Promise<CustomRequestRow[]>;
  list(filters?: CustomRequestFilters): Promise<CustomRequestRow[]>;
  findById(id: string): Promise<CustomRequestRow | null>;
  updateStatus(id: string, status: CustomRequestStatus): Promise<CustomRequestRow | null>;
};

export type CustomRequestDependencies = { repository: CustomRequestRepository };

let dependencies: CustomRequestDependencies = { repository: createCustomRequestRepository() };

/** Remplace le repository (tests unitaires, ou composition serveur). */
export function configureCustomRequestDependencies(next: Partial<CustomRequestDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit le repository Prisma par défaut. */
export function resetCustomRequestDependencies(): void {
  dependencies = { repository: createCustomRequestRepository() };
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export class CustomRequestValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "CustomRequestValidationError";
    this.fields = fields;
  }
}

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

const NAME_MAX_LENGTH = 80;
const PHONE_MAX_LENGTH = 32;
const CRITERIA_TEXT_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;
/** Même forme que `vehicle_prices` / `custom_vehicle_requests.budget_*` : `DECIMAL(14,2)`, jamais de flottant. */
const AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

const amountField = z.string().trim().regex(AMOUNT_PATTERN);
const contactNameField = z.string().trim().min(1).max(NAME_MAX_LENGTH);
const contactPhoneField = z.string().trim().min(3).max(PHONE_MAX_LENGTH);

const criteriaSchema = z
  .object({
    brand: z.string().trim().min(1).max(CRITERIA_TEXT_MAX_LENGTH).optional(),
    model: z.string().trim().min(1).max(CRITERIA_TEXT_MAX_LENGTH).optional(),
    notes: z.string().trim().min(1).max(NOTES_MAX_LENGTH).optional(),
  })
  .strict();

const customRequestInputSchema = z
  .object({
    criteria: criteriaSchema,
    budgetMin: amountField.nullish(),
    budgetMax: amountField.nullish(),
    contactName: contactNameField.nullish(),
    contactPhone: contactPhoneField.nullish(),
  })
  .strict();

type ParsedCustomRequestInput = {
  criteria: CustomRequestCriteria;
  budgetMin: string | null;
  budgetMax: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

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

/**
 * Valide et normalise l'entrée du formulaire.
 *
 * Contact : obligatoire si `actor.kind !== "customer"` ; ignoré — jamais stocké — si le client est
 * connecté (aucune confiance dans un contact envoyé par un client déjà identifié, T36).
 */
export function parseCustomRequestInput(input: unknown, actor: Actor): ParsedCustomRequestInput {
  const result = customRequestInputSchema.safeParse(input);
  if (!result.success) {
    throw new CustomRequestValidationError(issueFields(result.error));
  }

  const data = result.data;
  if (Object.keys(data.criteria).length === 0) {
    throw new CustomRequestValidationError(["criteria"]);
  }

  const budgetMin = data.budgetMin ?? null;
  const budgetMax = data.budgetMax ?? null;
  if (budgetMin !== null && budgetMax !== null && Number(budgetMin) > Number(budgetMax)) {
    throw new CustomRequestValidationError(["budgetMin", "budgetMax"]);
  }

  const isConnectedCustomer = actor.kind === "customer";
  const contactName = isConnectedCustomer ? null : data.contactName ?? null;
  const contactPhone = isConnectedCustomer ? null : data.contactPhone ?? null;

  if (!isConnectedCustomer) {
    const missing: string[] = [];
    if (!contactName) missing.push("contactName");
    if (!contactPhone) missing.push("contactPhone");
    if (missing.length > 0) {
      throw new CustomRequestValidationError(missing);
    }
  }

  return { criteria: data.criteria, budgetMin, budgetMax, contactName, contactPhone };
}

// ---------------------------------------------------------------------------
// Projection de lecture
// ---------------------------------------------------------------------------

/** Lecture tolérante du JSON stocké : seules les clés connues sont reprises, le reste est ignoré. */
function toCriteriaView(raw: Record<string, unknown>): CustomRequestCriteria {
  const view: CustomRequestCriteria = {};
  if (typeof raw.brand === "string" && raw.brand.trim().length > 0) view.brand = raw.brand;
  if (typeof raw.model === "string" && raw.model.trim().length > 0) view.model = raw.model;
  if (typeof raw.notes === "string" && raw.notes.trim().length > 0) view.notes = raw.notes;
  return view;
}

/** Projection explicite : aucune donnée de contact ni identifiant de client n'est jamais exposée. */
export function toCustomRequestView(row: CustomRequestRow): CustomRequestView {
  return {
    id: row.id,
    criteria: toCriteriaView(row.criteriaJson),
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    status: row.status,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Écriture et lecture
// ---------------------------------------------------------------------------

/**
 * Soumet une demande personnalisée. La cible (`customerId`) vient toujours de l'acteur résolu côté
 * serveur : elle n'est jamais fournie — ni devinable — depuis le formulaire. Un acteur qui n'est pas
 * `"customer"` (visiteur, compte suspendu, personnel) ne produit jamais de ligne rattachée à un
 * `customerId` : l'invariant « un compte suspendu n'obtient aucune demande lui appartenant » est tenu
 * par construction.
 */
export async function submitCustomRequest(actor: Actor, input: unknown): Promise<{ id: string }> {
  const parsed = parseCustomRequestInput(input, actor);
  const customerId = actor.kind === "customer" ? actor.customerId : null;

  const created = await dependencies.repository.create({
    customerId,
    contactName: parsed.contactName,
    contactPhone: parsed.contactPhone,
    criteriaJson: parsed.criteria,
    requestedBrand: parsed.criteria.brand ?? null,
    requestedModel: parsed.criteria.model ?? null,
    budgetMin: parsed.budgetMin,
    budgetMax: parsed.budgetMax,
  });

  return { id: created.id };
}

/** Liste des demandes du client connecté. Garde `requireCustomer` (dev.md §6, étapes 1-2). */
export async function listOwnCustomRequests(actor: Actor): Promise<CustomRequestView[]> {
  const customer = requireCustomer(actor);
  const rows = await dependencies.repository.listByCustomer(customer.customerId);
  return rows.map(toCustomRequestView);
}

// ---------------------------------------------------------------------------
// Vue personnel (contrat lot 5 §5) — gouvernée par `lead.*` (contrat §4, T20)
// ---------------------------------------------------------------------------

const CUSTOM_REQUEST_STATUSES: readonly CustomRequestStatus[] = [
  "RECEIVED",
  "QUALIFIED",
  "SEARCHING",
  "PROPOSED",
  "CLOSED",
  "ABANDONED",
];

/** Vrai si la valeur est un statut de demande sur mesure autorisé (aucune valeur inventée). */
export function isCustomRequestStatus(value: unknown): value is CustomRequestStatus {
  return typeof value === "string" && (CUSTOM_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Vrai si `next` est un statut admissible. Le corpus n'impose pas de machine à états ici. */
function assertStatus(value: unknown, field: string): asserts value is CustomRequestStatus {
  if (!isCustomRequestStatus(value)) {
    throw new CustomRequestValidationError([field]);
  }
}

/**
 * Liste les demandes sur mesure pour le personnel (contrat §5). Permission `lead.view`
 * (contrat §4 : aucune permission `custom_request.*` n'existe).
 */
export async function listCustomRequests(
  actor: Actor,
  filters?: CustomRequestFilters,
): Promise<CustomRequestView[]> {
  requireStaff(actor, "lead.view");
  if (filters?.status !== undefined) {
    assertStatus(filters.status, "status");
  }

  const rows = await dependencies.repository.list(filters);
  return rows.map(toCustomRequestView);
}

/**
 * Change le statut d'une demande sur mesure (contrat §5). Permission `lead.update`.
 * Ressource non visible/introuvable : refus neutre `NOT_FOUND` (T11/T12).
 * `RequestStatus` étant hors corpus (E28), aucune transition n'est inventée : tout statut
 * listé est accepté, la cohérence métier restant portée par le corpus.
 */
export async function updateCustomRequestStatus(
  actor: Actor,
  id: string,
  next: CustomRequestStatus,
): Promise<CustomRequestView> {
  requireStaff(actor, "lead.update");
  assertStatus(next, "status");

  const updated = await dependencies.repository.updateStatus(id, next);
  if (!updated) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  return toCustomRequestView(updated);
}
