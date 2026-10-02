import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createResellerApplicationRepository } from "@/repositories/reseller-application.repository";
import { requireCustomer, requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import {
  canTransitionResellerApplication,
  resellerApplicationTransitions,
  type ResellerApplicationStatus,
} from "@/services/transitions.service";
import type { AuditWriter } from "@/services/vehicle.service";

/**
 * Demande Revendeur (doc 03 §4, doc 09 §3, contrat lot 5 §3 et §5).
 *
 * Un client dépose une demande ; le personnel la prend en charge, l'approuve ou la refuse. La machine
 * à états est imposée : `PENDING → UNDER_REVIEW`, `UNDER_REVIEW → APPROVED | REJECTED`,
 * `PENDING/UNDER_REVIEW → CANCELLED`. Toute transition non listée est refusée (`VALIDATION`).
 *
 * Effet de l'approbation (transactionnel, même appel) : `customer_profiles.pricing_profile = RESELLER`
 * **et** `reseller_status = APPROVED` — c'est ce qui débloque réellement le tarif professionnel
 * (`services/pricing.service.ts` ne teste que `resellerStatus === "APPROVED"`).
 *
 * Chaque transition produit une entrée d'audit `reseller.status.change` (action EXISTANTE du corpus,
 * T20 : aucune permission ni action inventée). Cette action exige un motif (`audit.service.ts`) : la
 * transition fournit le motif de refus saisi, sinon une description factuelle de la transition.
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port) et une piste
 * d'audit, comme `services/pricing.service.ts`.
 */

export type { ResellerApplicationStatus };
export { canTransitionResellerApplication, resellerApplicationTransitions };

export type ResellerApplicationView = {
  id: string;
  customerId: string;
  companyName: string;
  businessType: string | null;
  estimatedVolume: string | null;
  status: ResellerApplicationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Ligne telle que retournée par le repository `reseller-application.repository.ts`. */
export type ResellerApplicationRow = ResellerApplicationView;

export type ResellerApplicationCreateData = {
  customerId: string;
  companyName: string;
  businessType: string | null;
  estimatedVolume: string | null;
  status: ResellerApplicationStatus;
};

export type ResellerApplicationReviewValues = {
  status: ResellerApplicationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
};

export type ResellerApplicationFilters = {
  status?: ResellerApplicationStatus;
};

/**
 * Port d'accès aux demandes Revendeur (`repositories/reseller-application.repository.ts`).
 * `transaction` permet de porter dans **une seule** transaction la mise à jour de la demande,
 * l'effet d'approbation sur `customer_profiles` et l'audit. `approveResellerCustomer` matérialise cet
 * effet (`pricing_profile = RESELLER`, `reseller_status = APPROVED`) sans exposer le profil client.
 */
export type ResellerApplicationRepository = {
  findOpenByCustomer(customerId: string): Promise<ResellerApplicationRow | null>;
  create(data: ResellerApplicationCreateData): Promise<ResellerApplicationRow>;
  list(filters: ResellerApplicationFilters): Promise<ResellerApplicationRow[]>;
  findById(id: string): Promise<ResellerApplicationRow | null>;
  updateReview(id: string, values: ResellerApplicationReviewValues): Promise<ResellerApplicationRow>;
  approveResellerCustomer(customerId: string): Promise<void>;
  transaction<T>(fn: (tx: ResellerApplicationRepository) => Promise<T>): Promise<T>;
};

export type ResellerApplicationDependencies = {
  repository: ResellerApplicationRepository;
  audit: AuditWriter;
};

let dependencies: ResellerApplicationDependencies = {
  repository: createResellerApplicationRepository(),
  audit: createAuditWriter(),
};

/** Remplace le repository ou la piste d'audit (tests unitaires, ou composition serveur). */
export function configureResellerApplicationDependencies(next: Partial<ResellerApplicationDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les dépendances Prisma par défaut. */
export function resetResellerApplicationDependencies(): void {
  dependencies = { repository: createResellerApplicationRepository(), audit: createAuditWriter() };
}

// ---------------------------------------------------------------------------
// Actions de revue et permissions (existantes — aucune création, T20)
// ---------------------------------------------------------------------------

export type ResellerReviewAction = "START_REVIEW" | "APPROVE" | "REJECT" | "CANCEL";

/**
 * Correspondance action → cible + permission existante (contrat §4).
 * `START_REVIEW` et `CANCEL` ne sont pas associés à une permission dédiée par le contrat :
 * la plus faible permission existante de la famille, `reseller.view`, les gouverne.
 */
const REVIEW_ACTIONS: Readonly<
  Record<ResellerReviewAction, { target: ResellerApplicationStatus; permission: "reseller.view" | "reseller.approve" | "reseller.reject" }>
> = {
  START_REVIEW: { target: "UNDER_REVIEW", permission: "reseller.view" },
  APPROVE: { target: "APPROVED", permission: "reseller.approve" },
  REJECT: { target: "REJECTED", permission: "reseller.reject" },
  CANCEL: { target: "CANCELLED", permission: "reseller.view" },
};

const NOT_FOUND_MESSAGE = "Ressource introuvable.";
const COMPANY_NAME_MAX_LENGTH = 160;
const BUSINESS_TYPE_MAX_LENGTH = 120;
const ESTIMATED_VOLUME_MAX_LENGTH = 120;

const idField = z.string().trim().min(1).max(120);

const resellerApplicationInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(COMPANY_NAME_MAX_LENGTH),
    businessType: z.string().trim().min(1).max(BUSINESS_TYPE_MAX_LENGTH).nullish(),
    estimatedVolume: z.string().trim().min(1).max(ESTIMATED_VOLUME_MAX_LENGTH).nullish(),
  })
  .strict();

const resellerFiltersSchema = z
  .object({
    status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  })
  .strict();

export type ParsedResellerApplicationInput = {
  companyName: string;
  businessType: string | null;
  estimatedVolume: string | null;
};

function idOf(value: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant invalide.");
  }

  return result.data;
}

/** Valide et normalise l'entrée de dépôt ; un champ inconnu est refusé (strict). */
export function parseResellerApplicationInput(input: unknown): ParsedResellerApplicationInput {
  const result = resellerApplicationInputSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de demande Revendeur invalide.");
  }

  const data = result.data;
  return {
    companyName: data.companyName,
    businessType: data.businessType ?? null,
    estimatedVolume: data.estimatedVolume ?? null,
  };
}

/** Filtres de liste bornés et validés. */
export function parseResellerApplicationFilters(
  filters?: ResellerApplicationFilters,
): ResellerApplicationFilters {
  const result = resellerFiltersSchema.safeParse(filters ?? {});
  if (!result.success) {
    throw new AppError("VALIDATION", "Filtres de demande Revendeur invalides.");
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Projection de lecture
// ---------------------------------------------------------------------------

export function toResellerApplicationView(row: ResellerApplicationRow): ResellerApplicationView {
  return {
    id: row.id,
    customerId: row.customerId,
    companyName: row.companyName,
    businessType: row.businessType,
    estimatedVolume: row.estimatedVolume,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Dépôt, liste et revue
// ---------------------------------------------------------------------------

/**
 * Dépose une demande Revendeur pour le client connecté. `customer_id` vient toujours de l'acteur
 * résolu côté serveur, jamais du formulaire. Invariant corpus « une demande ouverte maximum » : le
 * service refuse (`CONFLICT`) toute demande si une demande `PENDING`/`UNDER_REVIEW` existe déjà pour
 * ce client (la base le garantit en plus par un index unique partiel).
 */
export async function submitResellerApplication(actor: Actor, input: unknown): Promise<{ id: string }> {
  const customer = requireCustomer(actor);
  const parsed = parseResellerApplicationInput(input);

  const open = await dependencies.repository.findOpenByCustomer(customer.customerId);
  if (open) {
    throw new AppError("CONFLICT", "Une demande Revendeur est déjà en cours pour ce client.");
  }

  const created = await dependencies.repository.create({
    customerId: customer.customerId,
    companyName: parsed.companyName,
    businessType: parsed.businessType,
    estimatedVolume: parsed.estimatedVolume,
    status: "PENDING",
  });

  return { id: created.id };
}

/** Liste les demandes Revendeur ; exige `reseller.view`. */
export async function listResellerApplications(
  actor: Actor,
  filters?: { status?: ResellerApplicationStatus },
): Promise<ResellerApplicationView[]> {
  requireStaff(actor, "reseller.view");
  const parsed = parseResellerApplicationFilters(filters);
  const rows = await dependencies.repository.list(parsed);
  return rows.map(toResellerApplicationView);
}

/**
 * Revue d'une demande : prise en charge, approbation, refus ou annulation. Exige la permission
 * correspondante (`reseller.view` / `reseller.approve` / `reseller.reject`). La transition est
 * validée par la machine à états (doc 09 §3) ; toute transition non listée est refusée (`VALIDATION`).
 *
 * `APPROVE` met à jour, dans la même transaction : `reseller_applications.status`, `reviewed_by`,
 * `reviewed_at`, puis `customer_profiles.pricing_profile = RESELLER` + `reseller_status = APPROVED`.
 * Chaque transition écrit une entrée d'audit `reseller.status.change` (motif de refus saisi, sinon
 * description factuelle de la transition).
 */
export async function reviewResellerApplication(
  actor: Actor,
  id: string,
  action: ResellerReviewAction,
  input?: { rejectionReason?: string },
): Promise<ResellerApplicationView> {
  const config = REVIEW_ACTIONS[action];
  if (!config) {
    throw new AppError("VALIDATION", "Action de revue inconnue.");
  }

  const staff = requireStaff(actor, config.permission);
  const applicationId = idOf(id);

  const current = await dependencies.repository.findById(applicationId);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  const target = config.target;
  if (!canTransitionResellerApplication(current.status, target)) {
    throw new AppError("VALIDATION", `Transition impossible de « ${current.status} » vers « ${target} ».`);
  }

  const reviewedAt = new Date();
  const rejectionReason =
    action === "REJECT" && typeof input?.rejectionReason === "string" ? input.rejectionReason.trim() || null : null;

  const entry = buildAuditEntry({
    actorProfileId: staff.profileId,
    action: "reseller.status.change",
    entityType: "ResellerApplication",
    entityId: applicationId,
    oldValues: { status: current.status },
    newValues: { status: target },
    reason: rejectionReason ?? `Transition ${current.status} → ${target}`,
  });

  const updated = await dependencies.repository.transaction(async (tx) => {
    const row = await tx.updateReview(applicationId, {
      status: target,
      reviewedBy: staff.staffId,
      reviewedAt,
      rejectionReason,
    });

    if (action === "APPROVE") {
      await tx.approveResellerCustomer(current.customerId);
    }

    await dependencies.audit(entry);
    return row;
  });

  return toResellerApplicationView(updated);
}
