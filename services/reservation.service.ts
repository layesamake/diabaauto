import { z } from "zod";
import { AppError } from "@/lib/errors";
import { formatReservationReference } from "@/lib/reservation-reference";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createReservationRepository } from "@/repositories/reservation.repository";
import { requireCustomer, requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import {
  canTransitionDepositStatus,
  canTransitionReservationStatus,
  type DepositStatus,
  type ReservationStatus,
  type VehicleCommercialStatus,
} from "@/services/transitions.service";
import type { AuditWriter } from "@/services/vehicle.service";

/**
 * Réservations et acompte externe (contrat lot 6 §3.1, §3.2, §4, §5 ; doc 09 §5-§6 et §10).
 *
 * Règles tenues par ce module :
 * - **autorisation** : `vehicle.reserve` pour créer, confirmer, annuler, expirer une réservation et
 *   faire évoluer l'acompte ; `order.view` pour la liste et la fiche côté personnel ; `requireCustomer`
 *   pour `listOwnReservations` (le client ne voit que ses propres lignes, contrat §4). Aucune
 *   permission nouvelle n'est inventée (T20) ; le refus est **neutre** et n'expose aucune donnée.
 * - **machines à états importées** (`services/transitions.service.ts`) : la réservation
 *   (`PENDING → CONFIRMED`, `PENDING|CONFIRMED → CANCELLED`, `CONFIRMED → EXPIRED`) et l'acompte
 *   (`NOT_REQUIRED|REQUESTED → REPORTED → VERIFIED|REJECTED`) ne sont **jamais** réécrites ici. Toute
 *   transition non listée est refusée (`VALIDATION`).
 * - **effet transactionnel** (doc 09 §10) : la confirmation écrit dans **une seule** transaction la
 *   réservation `CONFIRMED`, `Vehicle.commercial_status = RESERVED` et l'audit. L'annulation et
 *   l'expiration libèrent le véhicule (`RESERVED → AVAILABLE`). Aucun encaissement n'existe : Diaba
 *   Auto V1 ne perçoit rien (BR-101/BR-102), l'acompte n'est qu'un contrôle externe enregistré.
 * - **projection explicite** : aucune donnée interne n'est exposée (`confirmedBy`, identifiant de
 *   personnel, est retiré ; seule une valeur booléenne `confirmed` en dérive).
 * - **concurrence** (BR-103, §3.5) : le contrôle « une réservation active maximum par véhicule »
 *   s'exécute **dans la transaction** et s'appuie en plus sur l'index unique partiel de la base.
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port) et une piste
 * d'audit, comme `services/staff-customer.service.ts` / `services/reseller-application.service.ts`.
 * Son repository **par défaut** est le repository Prisma (`repositories/reservation.repository.ts`),
 * remplaçable par les tests via `configureReservationDependencies`.
 */

export type { DepositStatus, ReservationStatus };
export { canTransitionDepositStatus, canTransitionReservationStatus };

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

/** Ligne telle que retournée par le repository : projection figée, jamais un modèle Prisma complet. */
export type ReservationRow = {
  id: string;
  reference: string;
  vehicleId: string;
  customerId: string;
  leadId: string | null;
  status: ReservationStatus;
  expiresAt: Date | null;
  agreedPrice: string | null;
  depositRequired: boolean;
  depositAmount: string | null;
  depositCurrency: string | null;
  depositStatus: DepositStatus;
  externalDepositReference: string | null;
  confirmedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Vue d'une réservation servie au client ou au personnel. `confirmedBy` (identifiant interne de
 * personnel) est **retiré** : seule sa présence est exposée via `confirmed`.
 */
export type ReservationView = {
  id: string;
  reference: string;
  vehicleId: string;
  customerId: string;
  leadId: string | null;
  status: ReservationStatus;
  expiresAt: Date | null;
  agreedPrice: string | null;
  depositRequired: boolean;
  depositAmount: string | null;
  depositCurrency: string | null;
  depositStatus: DepositStatus;
  externalDepositReference: string | null;
  confirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ReservationFilters = {
  status?: ReservationStatus;
  vehicleId?: string;
  customerId?: string;
  /** Recherche libre sur la référence de réservation. */
  search?: string;
};

export type ReservationCreateData = {
  reference: string;
  vehicleId: string;
  customerId: string;
  leadId: string | null;
  status: ReservationStatus;
  expiresAt: Date | null;
  agreedPrice: string | null;
  depositRequired: boolean;
  depositAmount: string | null;
  depositCurrency: string | null;
  depositStatus: DepositStatus;
};

/** Valeurs d'une transition de statut de réservation. `confirmedBy` absent = inchangé. */
export type ReservationStatusValues = {
  status: ReservationStatus;
  confirmedBy?: string | null;
};

/** Valeurs d'une transition d'acompte. Champs absents = inchangés. */
export type ReservationDepositValues = {
  depositStatus: DepositStatus;
  externalDepositReference?: string | null;
  depositAmount?: string | null;
  depositCurrency?: string | null;
};

// ---------------------------------------------------------------------------
// Port d'accès aux données (`reservations`, plus l'effet véhicule de la transaction)
// ---------------------------------------------------------------------------

/**
 * Port du service réservations. Le repository Prisma l'implémente
 * (`repositories/reservation.repository.ts`) ; les tests unitaires fournissent un double.
 *
 * `readVehicleCommercialStatus` / `setVehicleCommercialStatus` sont portés ici — et non par un second
 * repository — afin que l'effet « Reservation CONFIRMED + Vehicle RESERVED + Audit » (doc 09 §10)
 * tienne dans **une seule** transaction. `null` signifie « ligne introuvable » et donne un refus
 * neutre (`NOT_FOUND`).
 */
export type ReservationRepository = {
  /** Maximum existant + 1 pour l'année donnée (le service en dérive la référence). */
  nextReferenceSequence(year: number): Promise<number>;
  findActiveByVehicle(vehicleId: string): Promise<ReservationRow | null>;
  create(data: ReservationCreateData): Promise<ReservationRow>;
  findById(id: string): Promise<ReservationRow | null>;
  list(filters: ReservationFilters): Promise<ReservationRow[]>;
  listByCustomer(customerId: string): Promise<ReservationRow[]>;
  updateStatus(id: string, values: ReservationStatusValues): Promise<ReservationRow | null>;
  updateDeposit(id: string, values: ReservationDepositValues): Promise<ReservationRow | null>;
  readVehicleCommercialStatus(vehicleId: string): Promise<VehicleCommercialStatus | null>;
  setVehicleCommercialStatus(vehicleId: string, status: VehicleCommercialStatus): Promise<void>;
  transaction<T>(fn: (tx: ReservationRepository) => Promise<T>): Promise<T>;
};

export type ReservationDependencies = {
  repository: ReservationRepository;
  audit: AuditWriter;
};

let dependencies: ReservationDependencies = {
  repository: createReservationRepository(),
  audit: createAuditWriter(),
};

/** Remplace le repository ou la piste d'audit (tests unitaires, ou composition serveur). */
export function configureReservationDependencies(next: Partial<ReservationDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les dépendances par défaut (repository Prisma, audit Prisma). */
export function resetReservationDependencies(): void {
  dependencies = { repository: createReservationRepository(), audit: createAuditWriter() };
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export class ReservationValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "ReservationValidationError";
    this.fields = fields;
  }
}

const NOT_FOUND_MESSAGE = "Ressource introuvable.";

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

const ID_MAX_LENGTH = 120;
const SEARCH_MAX_LENGTH = 120;
const DEPOSIT_REFERENCE_MAX_LENGTH = 160;
const MONEY_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;

const RESERVATION_STATUSES: readonly ReservationStatus[] = ["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"];

const idField = z.string().trim().min(1).max(ID_MAX_LENGTH);
const moneyField = z.string().trim().regex(MONEY_PATTERN);
const currencyField = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());

const createReservationSchema = z
  .object({
    vehicleId: idField,
    customerId: idField,
    leadId: idField.nullish(),
    expiresAt: z.coerce.date().nullish(),
    agreedPrice: moneyField.nullish(),
    depositRequired: z.boolean().optional(),
    depositAmount: moneyField.nullish(),
    depositCurrency: currencyField.nullish(),
  })
  .strict();

const reservationFiltersSchema = z
  .object({
    status: z.enum(RESERVATION_STATUSES).optional(),
    vehicleId: idField.optional(),
    customerId: idField.optional(),
    search: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
  })
  .strict();

const reportDepositSchema = z
  .object({
    externalDepositReference: z.string().trim().min(1).max(DEPOSIT_REFERENCE_MAX_LENGTH),
    depositAmount: moneyField.nullish(),
    depositCurrency: currencyField.nullish(),
  })
  .strict();

export type ParsedReservationCreate = {
  vehicleId: string;
  customerId: string;
  leadId: string | null;
  expiresAt: Date | null;
  agreedPrice: string | null;
  depositRequired: boolean;
  depositAmount: string | null;
  depositCurrency: string | null;
};

export type ParsedDepositReport = {
  externalDepositReference: string;
  depositAmount: string | null;
  depositCurrency: string | null;
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

/** Valide et normalise l'entrée de création. Un champ inconnu est refusé, jamais ignoré. */
export function parseReservationCreate(input: unknown): ParsedReservationCreate {
  const result = createReservationSchema.safeParse(input);
  if (!result.success) {
    throw new ReservationValidationError(issueFields(result.error));
  }

  const data = result.data;
  return {
    vehicleId: data.vehicleId,
    customerId: data.customerId,
    leadId: data.leadId ?? null,
    expiresAt: data.expiresAt ?? null,
    agreedPrice: data.agreedPrice ?? null,
    depositRequired: data.depositRequired ?? false,
    depositAmount: data.depositAmount ?? null,
    depositCurrency: data.depositCurrency ?? null,
  };
}

/** Valide les filtres de liste. Un champ inconnu est refusé, jamais ignoré. */
export function parseReservationFilters(input?: ReservationFilters): ReservationFilters {
  const result = reservationFiltersSchema.safeParse(input ?? {});
  if (!result.success) {
    throw new ReservationValidationError(issueFields(result.error));
  }

  return result.data;
}

/** Valide la déclaration d'un acompte externe (aucun encaissement : on enregistre une référence). */
export function parseDepositReport(input: unknown): ParsedDepositReport {
  const result = reportDepositSchema.safeParse(input);
  if (!result.success) {
    throw new ReservationValidationError(issueFields(result.error));
  }

  return {
    externalDepositReference: result.data.externalDepositReference,
    depositAmount: result.data.depositAmount ?? null,
    depositCurrency: result.data.depositCurrency ?? null,
  };
}

/** Valide un identifiant de réservation (non vide) sans imposer de format — la cible vient du serveur. */
export function parseReservationId(reservationId: string): string {
  const result = idField.safeParse(reservationId);
  if (!result.success) {
    throw new ReservationValidationError(["reservationId"]);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Projection de lecture
// ---------------------------------------------------------------------------

/** Projection explicite : `confirmedBy` (identifiant interne de personnel) n'est pas exposé. */
export function toReservationView(row: ReservationRow): ReservationView {
  return {
    id: row.id,
    reference: row.reference,
    vehicleId: row.vehicleId,
    customerId: row.customerId,
    leadId: row.leadId ?? null,
    status: row.status,
    expiresAt: row.expiresAt ?? null,
    agreedPrice: row.agreedPrice ?? null,
    depositRequired: row.depositRequired,
    depositAmount: row.depositAmount ?? null,
    depositCurrency: row.depositCurrency ?? null,
    depositStatus: row.depositStatus,
    externalDepositReference: row.externalDepositReference ?? null,
    confirmed: row.confirmedBy !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Opérations — réservation
// ---------------------------------------------------------------------------

/**
 * Crée une réservation `PENDING` au nom d'un client (le `customerId` est validé côté serveur, jamais
 * dérivé du navigateur seul). Exige `vehicle.reserve`.
 *
 * La référence `RES-YYYY-NNNNNN` est générée côté serveur (T43). L'invariant « une réservation active
 * maximum par véhicule » (PENDING/CONFIRMED) est vérifié **dans la transaction** (`CONFLICT`,
 * §3.5/BR-103) : le double clic ne crée qu'une seule ligne. Le véhicule doit être `AVAILABLE`.
 * Aucun encaissement : si `depositRequired`, l'acompte naît `REQUESTED` (activation = effet de la
 * réservation, pas une transition de la machine d'acompte, §3.2), sinon `NOT_REQUIRED`.
 */
export async function createReservation(actor: Actor, input: unknown): Promise<ReservationView> {
  requireStaff(actor, "vehicle.reserve");
  const parsed = parseReservationCreate(input);
  const year = new Date().getUTCFullYear();

  return dependencies.repository.transaction(async (tx) => {
    const active = await tx.findActiveByVehicle(parsed.vehicleId);
    if (active) {
      throw new AppError("CONFLICT", "Une réservation active existe déjà pour ce véhicule.");
    }

    const vehicleStatus = await tx.readVehicleCommercialStatus(parsed.vehicleId);
    if (vehicleStatus === null) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (vehicleStatus !== "AVAILABLE") {
      throw new AppError("CONFLICT", "Le véhicule n'est pas disponible à la réservation.");
    }

    const sequence = await tx.nextReferenceSequence(year);
    const reference = formatReservationReference(year, sequence);

    const created = await tx.create({
      reference,
      vehicleId: parsed.vehicleId,
      customerId: parsed.customerId,
      leadId: parsed.leadId,
      status: "PENDING",
      expiresAt: parsed.expiresAt,
      agreedPrice: parsed.agreedPrice,
      depositRequired: parsed.depositRequired,
      depositAmount: parsed.depositAmount,
      depositCurrency: parsed.depositCurrency,
      depositStatus: parsed.depositRequired ? "REQUESTED" : "NOT_REQUIRED",
    });

    return toReservationView(created);
  });
}

/**
 * Confirme une réservation (`PENDING → CONFIRMED`). Exige `vehicle.reserve`.
 *
 * Transaction atomique (doc 09 §10) : `Reservation CONFIRMED` + `Vehicle RESERVED` + `Audit`
 * (`vehicle.reserve`, action canonique existante — aucune n'est inventée, T20). La disponibilité est
 * revérifiée : un véhicule déjà mobilisé donne `CONFLICT` (BR-103).
 */
export async function confirmReservation(actor: Actor, reservationId: string): Promise<ReservationView> {
  const staff = requireStaff(actor, "vehicle.reserve");
  const id = parseReservationId(reservationId);

  return dependencies.repository.transaction(async (tx) => {
    const current = await tx.findById(id);
    if (!current) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (!canTransitionReservationStatus(current.status, "CONFIRMED")) {
      throw new AppError("VALIDATION", `Transition impossible de « ${current.status} » vers « CONFIRMED ».`);
    }

    const vehicleStatus = await tx.readVehicleCommercialStatus(current.vehicleId);
    if (vehicleStatus === null) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (vehicleStatus !== "AVAILABLE") {
      throw new AppError("CONFLICT", "Le véhicule n'est plus disponible : une réservation ou une vente l'a mobilisé.");
    }

    const updated = await tx.updateStatus(id, { status: "CONFIRMED", confirmedBy: staff.staffId });
    if (!updated) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    await tx.setVehicleCommercialStatus(current.vehicleId, "RESERVED");

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.reserve",
        entityType: "Reservation",
        entityId: id,
        oldValues: { status: current.status, vehicleCommercialStatus: vehicleStatus },
        newValues: { status: "CONFIRMED", vehicleCommercialStatus: "RESERVED" },
        reason: `Réservation ${current.reference} confirmée.`,
      }),
    );

    return toReservationView(updated);
  });
}

/**
 * Annule une réservation (`PENDING|CONFIRMED → CANCELLED`). Exige `vehicle.reserve`.
 * Le véhicule revient `AVAILABLE` s'il était `RESERVED` (un véhicule `SOLD` n'est jamais ramené).
 * Audité (`vehicle.reserve`).
 */
export async function cancelReservation(actor: Actor, reservationId: string): Promise<ReservationView> {
  const staff = requireStaff(actor, "vehicle.reserve");
  const id = parseReservationId(reservationId);

  return dependencies.repository.transaction(async (tx) => {
    const current = await tx.findById(id);
    if (!current) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (!canTransitionReservationStatus(current.status, "CANCELLED")) {
      throw new AppError("VALIDATION", `Transition impossible de « ${current.status} » vers « CANCELLED ».`);
    }

    const vehicleStatus = await tx.readVehicleCommercialStatus(current.vehicleId);
    const released = vehicleStatus === "RESERVED" ? "AVAILABLE" : vehicleStatus;

    const updated = await tx.updateStatus(id, { status: "CANCELLED" });
    if (!updated) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (vehicleStatus === "RESERVED") {
      await tx.setVehicleCommercialStatus(current.vehicleId, "AVAILABLE");
    }

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.reserve",
        entityType: "Reservation",
        entityId: id,
        oldValues: { status: current.status, vehicleCommercialStatus: vehicleStatus },
        newValues: { status: "CANCELLED", vehicleCommercialStatus: released },
        reason: `Réservation ${current.reference} annulée.`,
      }),
    );

    return toReservationView(updated);
  });
}

/**
 * Expire une réservation (`CONFIRMED → EXPIRED`). Exige `vehicle.reserve`.
 * Libère le véhicule s'il était `RESERVED`. Audité (`vehicle.reserve`).
 */
export async function expireReservation(actor: Actor, reservationId: string): Promise<ReservationView> {
  const staff = requireStaff(actor, "vehicle.reserve");
  const id = parseReservationId(reservationId);

  return dependencies.repository.transaction(async (tx) => {
    const current = await tx.findById(id);
    if (!current) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (!canTransitionReservationStatus(current.status, "EXPIRED")) {
      throw new AppError("VALIDATION", `Transition impossible de « ${current.status} » vers « EXPIRED ».`);
    }

    const vehicleStatus = await tx.readVehicleCommercialStatus(current.vehicleId);
    const released = vehicleStatus === "RESERVED" ? "AVAILABLE" : vehicleStatus;

    const updated = await tx.updateStatus(id, { status: "EXPIRED" });
    if (!updated) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (vehicleStatus === "RESERVED") {
      await tx.setVehicleCommercialStatus(current.vehicleId, "AVAILABLE");
    }

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.reserve",
        entityType: "Reservation",
        entityId: id,
        oldValues: { status: current.status, vehicleCommercialStatus: vehicleStatus },
        newValues: { status: "EXPIRED", vehicleCommercialStatus: released },
        reason: `Réservation ${current.reference} expirée.`,
      }),
    );

    return toReservationView(updated);
  });
}

// ---------------------------------------------------------------------------
// Opérations — acompte externe (aucun encaissement : contrôle enregistré, BR-102)
// ---------------------------------------------------------------------------

/**
 * Déclare l'acompte externe comme `REPORTED` (`NOT_REQUIRED|REQUESTED → REPORTED`). Exige
 * `vehicle.reserve`. On enregistre la référence externe et, le cas échéant, montant et devise : Diaba
 * Auto **ne perçoit rien** (BR-101). Audité (`vehicle.reserve`).
 */
export async function reportDeposit(
  actor: Actor,
  reservationId: string,
  input: unknown,
): Promise<ReservationView> {
  const staff = requireStaff(actor, "vehicle.reserve");
  const id = parseReservationId(reservationId);
  const parsed = parseDepositReport(input);

  return dependencies.repository.transaction(async (tx) => {
    const current = await tx.findById(id);
    if (!current) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (!canTransitionDepositStatus(current.depositStatus, "REPORTED")) {
      throw new AppError("VALIDATION", `Transition d'acompte impossible de « ${current.depositStatus} » vers « REPORTED ».`);
    }

    const updated = await tx.updateDeposit(id, {
      depositStatus: "REPORTED",
      externalDepositReference: parsed.externalDepositReference,
      ...(parsed.depositAmount !== null ? { depositAmount: parsed.depositAmount } : {}),
      ...(parsed.depositCurrency !== null ? { depositCurrency: parsed.depositCurrency } : {}),
    });
    if (!updated) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.reserve",
        entityType: "Reservation",
        entityId: id,
        oldValues: { depositStatus: current.depositStatus },
        newValues: { depositStatus: "REPORTED", externalDepositReference: parsed.externalDepositReference },
        reason: `Acompte externe de la réservation ${current.reference} déclaré.`,
      }),
    );

    return toReservationView(updated);
  });
}

/** Vérifie l'acompte (`REPORTED → VERIFIED`). Exige `vehicle.reserve`. Audité (`vehicle.reserve`). */
export async function verifyDeposit(actor: Actor, reservationId: string): Promise<ReservationView> {
  const staff = requireStaff(actor, "vehicle.reserve");
  const id = parseReservationId(reservationId);

  return dependencies.repository.transaction(async (tx) => {
    const current = await tx.findById(id);
    if (!current) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (!canTransitionDepositStatus(current.depositStatus, "VERIFIED")) {
      throw new AppError("VALIDATION", `Transition d'acompte impossible de « ${current.depositStatus} » vers « VERIFIED ».`);
    }

    const updated = await tx.updateDeposit(id, { depositStatus: "VERIFIED" });
    if (!updated) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.reserve",
        entityType: "Reservation",
        entityId: id,
        oldValues: { depositStatus: current.depositStatus },
        newValues: { depositStatus: "VERIFIED" },
        reason: `Acompte externe de la réservation ${current.reference} vérifié.`,
      }),
    );

    return toReservationView(updated);
  });
}

/**
 * Refuse l'acompte (`REPORTED → REJECTED`). Exige `vehicle.reserve`. Un motif éventuel est repris
 * comme motif d'audit, sinon une description factuelle est utilisée. Audité (`vehicle.reserve`).
 */
export async function rejectDeposit(
  actor: Actor,
  reservationId: string,
  input?: { reason?: string },
): Promise<ReservationView> {
  const staff = requireStaff(actor, "vehicle.reserve");
  const id = parseReservationId(reservationId);
  const reason = typeof input?.reason === "string" ? input.reason.trim() || null : null;

  return dependencies.repository.transaction(async (tx) => {
    const current = await tx.findById(id);
    if (!current) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    if (!canTransitionDepositStatus(current.depositStatus, "REJECTED")) {
      throw new AppError("VALIDATION", `Transition d'acompte impossible de « ${current.depositStatus} » vers « REJECTED ».`);
    }

    const updated = await tx.updateDeposit(id, { depositStatus: "REJECTED" });
    if (!updated) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.reserve",
        entityType: "Reservation",
        entityId: id,
        oldValues: { depositStatus: current.depositStatus },
        newValues: { depositStatus: "REJECTED" },
        reason: reason ?? `Acompte externe de la réservation ${current.reference} refusé.`,
      }),
    );

    return toReservationView(updated);
  });
}

// ---------------------------------------------------------------------------
// Opérations — lecture
// ---------------------------------------------------------------------------

/** Liste des réservations (back-office) ; exige `order.view` (contrat §4). Refus neutre. */
export async function listReservations(
  actor: Actor,
  filters?: ReservationFilters,
): Promise<ReservationView[]> {
  requireStaff(actor, "order.view");
  const parsed = parseReservationFilters(filters);
  const rows = await dependencies.repository.list(parsed);
  return rows.map(toReservationView);
}

/** Fiche d'une réservation (back-office) ; exige `order.view`. Inconnue → `NOT_FOUND` neutre. */
export async function readReservation(actor: Actor, reservationId: string): Promise<ReservationView> {
  requireStaff(actor, "order.view");
  const id = parseReservationId(reservationId);
  const row = await dependencies.repository.findById(id);
  if (!row) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  return toReservationView(row);
}

/**
 * Réservations du client connecté. `requireCustomer` et portée par `customerId` **résolu côté
 * serveur** : un client ne voit jamais la réservation d'un autre (contrat §4, §6).
 */
export async function listOwnReservations(actor: Actor): Promise<ReservationView[]> {
  const customer = requireCustomer(actor);
  const rows = await dependencies.repository.listByCustomer(customer.customerId);
  return rows.map(toReservationView);
}
