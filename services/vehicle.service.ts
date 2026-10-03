import { z } from "zod";
import { VEHICLE_STAGES, type VehicleStage } from "@/lib/vehicle-stage";
import { AppError } from "@/lib/errors";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createVehicleRepository } from "@/repositories/vehicle.repository";
import { requireStaff } from "@/services/access.service";
import { buildAuditEntry, type AuditAction, type AuditLogEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import {
  canTransitionVehicleStatus,
  type VehicleCommercialStatus,
} from "@/services/transitions.service";
import {
  formatVehicleReference,
  isValidVehicleReference,
  nextVehicleReference,
  nextVehicleSequence,
} from "@/lib/vehicle-reference";

export { formatVehicleReference, isValidVehicleReference, nextVehicleReference, nextVehicleSequence };

/**
 * Cycle de vie du véhicule (doc 03 §6 et §6.1, contrat L2 §2.1, §2.2, §2.7).
 *
 * - référence unique `DBC-YYYY-NNNNNN` générée par le serveur (jamais par le navigateur) ;
 * - invariant de publication : marque, modèle, année, état, localisation, au moins un média image
 *   principal public ET au moins un prix actif `STANDARD` ;
 * - transitions commerciales validées par `services/transitions.service.ts` ;
 * - retrait de publication et archivage tracés par `vehicle.withdraw` (motif obligatoire).
 *
 * Audit : le corpus d'actions est fermé. `vehicle.publish`, `vehicle.withdraw`, `vehicle.reserve` et
 * `vehicle.sell` couvrent publication, retrait, archivage et transitions sensibles. La CRÉATION et la
 * MODIFICATION d'un véhicule n'ont pas d'action canonique : le contrat §2.7 interdit d'en inventer
 * une, ces deux opérations ne produisent donc pas d'entrée d'audit (écart signalé au coordinateur).
 *
 * Surface d'API gelée (contrat §2bis) : `listVehicles` / `getVehicle` / `createVehicle` /
 * `updateVehicle` / `publishVehicle` / `unpublishVehicle` / `changeCommercialStatus` /
 * `archiveVehicle`. Repository et piste d'audit sont résolus par une fabrique remplaçable
 * (`configureVehicleDependencies`) : les Server Actions n'ont aucun paramètre d'infrastructure et les
 * tests restent unitaires.
 */

export type VehicleCondition = "NEW" | "USED";
export type LogisticsLocation = "CHINA" | "IN_TRANSIT" | "SENEGAL";
export type DocumentVisibility = "PUBLIC" | "PRIVATE" | "SHARE_ON_REQUEST";
export type MediaType = "IMAGE" | "VIDEO";
export type { VehicleCommercialStatus };

// ---------------------------------------------------------------------------
// Contrats du domaine et port d'accès aux données
// ---------------------------------------------------------------------------

/** Ligne de liste back-office (colonnes strictement nécessaires à l'écran). */
export type VehicleListItem = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  brandId: string;
  modelId: string;
  year: number;
  condition: VehicleCondition;
  logisticsLocation: LogisticsLocation;
  commercialStatus: VehicleCommercialStatus;
  isPublished: boolean;
  featured: boolean;
  mileage: number | null;
  publishedAt: Date | null;
};

/** Fiche d'administration : elle n'est servie qu'à un acteur porteur de `vehicle.view`. */
export type VehicleDetail = VehicleListItem & {
  description: string | null;
  generationId: string | null;
  trimId: string | null;
  firstRegistrationDate: Date | null;
  previousOwners: number | null;
  accidentKnown: boolean | null;
  serviceHistoryAvailable: boolean | null;
  fuelTypeId: string;
  transmissionTypeId: string;
  bodyTypeId: string;
  exteriorColorId: string | null;
  interiorColorId: string | null;
  powerKw: string | null;
  powerHp: string | null;
  engineDisplacement: number | null;
  doors: number | null;
  seats: number | null;
  supplierReference: string | null;
  supplierName: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export { VEHICLE_STAGES, type VehicleStage };

export type VehicleListFilters = {
  search?: string;
  stage?: VehicleStage;
  commercialStatus?: VehicleCommercialStatus;
  isPublished?: boolean;
  brandId?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Ligne de la liste : le véhicule, plus ce qui conditionne sa mise en ligne. Les deux indicateurs
 * sont calculés en base pour les seules lignes affichées, sans rapatrier ni médias ni prix.
 */
export type VehicleListEntry = VehicleListItem & {
  hasPrimaryImage: boolean;
  hasStandardPrice: boolean;
};

export type VehicleListPage = { items: VehicleListEntry[]; total: number };

/** Effectif de chaque étape (et du stock entier), pour les onglets. */
export type VehicleStageCounts = Record<VehicleStage | "all", number>;

export type VehicleListResult = VehicleListPage & { stageCounts: VehicleStageCounts };

export type VehicleRecord = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  description: string | null;
  brandId: string;
  modelId: string;
  year: number;
  condition: VehicleCondition;
  logisticsLocation: LogisticsLocation;
  commercialStatus: VehicleCommercialStatus;
  isPublished: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
};

export type VehicleMediaSummary = {
  id: string;
  mediaType: MediaType;
  isPrimary: boolean;
  visibility: DocumentVisibility;
};

export type VehiclePriceSummary = {
  pricingProfile: "STANDARD" | "RESELLER";
  isActive: boolean;
};

export type VehicleCreateData = {
  reference: string;
  slug: string;
  title: string;
  description: string | null;
  brandId: string;
  modelId: string;
  generationId: string | null;
  trimId: string | null;
  condition: VehicleCondition;
  year: number;
  firstRegistrationDate: Date | null;
  mileage: number | null;
  previousOwners: number | null;
  accidentKnown: boolean | null;
  serviceHistoryAvailable: boolean | null;
  fuelTypeId: string;
  transmissionTypeId: string;
  bodyTypeId: string;
  exteriorColorId: string | null;
  interiorColorId: string | null;
  powerKw: string | null;
  powerHp: string | null;
  engineDisplacement: number | null;
  doors: number | null;
  seats: number | null;
  supplierReference: string | null;
  supplierName: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  logisticsLocation: LogisticsLocation;
  featured: boolean;
};

export type VehicleUpdatePatch = Partial<Omit<VehicleCreateData, "reference">>;

export type VehicleRepository = {
  findByReference(reference: string): Promise<VehicleRecord | null>;
  findById(id: string): Promise<VehicleRecord | null>;
  findDetailById(id: string): Promise<VehicleDetail | null>;
  list(filters: VehicleListFilters): Promise<VehicleListPage>;
  /** Effectif par étape, sur le périmètre de la recherche (sans l'étape ni la pagination). */
  countStages(filters: VehicleListFilters): Promise<VehicleStageCounts>;
  /** Maximum existant + 1 pour l'année donnée (le service en dérive la référence). */
  nextReferenceSequence(year: number): Promise<number>;
  create(input: VehicleCreateData): Promise<VehicleRecord>;
  update(id: string, patch: VehicleUpdatePatch): Promise<VehicleRecord>;
  setPublication(
    id: string,
    values: { isPublished: boolean; publishedAt: Date | null },
  ): Promise<VehicleRecord>;
  setCommercialStatus(
    id: string,
    status: VehicleCommercialStatus,
    archivedAt: Date | null,
  ): Promise<VehicleRecord>;
  listMedia(vehicleId: string): Promise<VehicleMediaSummary[]>;
  listPrices(vehicleId: string): Promise<VehiclePriceSummary[]>;
  transaction<T>(fn: (tx: VehicleRepository) => Promise<T>): Promise<T>;
};

/** Écriture d'audit (port) : doit partager la connexion transactionnelle de l'opération auditée. */
export type AuditWriter = (entry: AuditLogEntry) => Promise<void>;

export type VehicleDependencies = { repository: VehicleRepository; audit: AuditWriter };

let dependencies: VehicleDependencies = {
  repository: createVehicleRepository(),
  audit: createAuditWriter(),
};

/** Remplace le repository ou la piste d'audit (tests unitaires, ou composition serveur). */
export function configureVehicleDependencies(next: Partial<VehicleDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les dépendances Prisma par défaut. */
export function resetVehicleDependencies(): void {
  dependencies = { repository: createVehicleRepository(), audit: createAuditWriter() };
}

// ---------------------------------------------------------------------------
// Invariant de publication (contrat §2.2)
// ---------------------------------------------------------------------------

/** Contrôle pur de l'invariant de publication : liste des manques, dans l'ordre du doc 03 §6.1. */
export function publicationGaps(
  vehicle: Pick<VehicleRecord, "brandId" | "modelId" | "year" | "condition" | "logisticsLocation">,
  media: readonly VehicleMediaSummary[],
  prices: readonly VehiclePriceSummary[],
): string[] {
  const gaps: string[] = [];
  if (!vehicle.brandId) gaps.push("marque");
  if (!vehicle.modelId) gaps.push("modèle");
  if (!vehicle.year) gaps.push("année");
  if (!vehicle.condition) gaps.push("état");
  if (!vehicle.logisticsLocation) gaps.push("localisation");

  const hasPrimaryImage = media.some(
    (item) => item.mediaType === "IMAGE" && item.isPrimary && item.visibility === "PUBLIC",
  );
  if (!hasPrimaryImage) gaps.push("média image principal public");

  const hasActiveStandardPrice = prices.some(
    (price) => price.pricingProfile === "STANDARD" && price.isActive,
  );
  if (!hasActiveStandardPrice) gaps.push("prix actif STANDARD");

  return gaps;
}

// ---------------------------------------------------------------------------
// Droits et audit par opération
// ---------------------------------------------------------------------------

const STATUS_PERMISSIONS: Readonly<Record<VehicleCommercialStatus, "vehicle.edit" | "vehicle.reserve" | "vehicle.mark_sold" | "vehicle.publish">> = {
  DRAFT: "vehicle.edit",
  AVAILABLE: "vehicle.edit",
  UNAVAILABLE: "vehicle.edit",
  RESERVED: "vehicle.reserve",
  SOLD: "vehicle.mark_sold",
  ARCHIVED: "vehicle.publish",
};

const STATUS_AUDIT_ACTIONS: Partial<Readonly<Record<VehicleCommercialStatus, AuditAction>>> = {
  RESERVED: "vehicle.reserve",
  SOLD: "vehicle.sell",
};

// ---------------------------------------------------------------------------
// Schémas d'entrée (champs privilégiés refusés : is_published, statut, référence, dates)
// ---------------------------------------------------------------------------

const idField = z.string().trim().uuid();
const dateField = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountField = z.number().min(0).max(10_000).nullish();

const vehicleFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).nullish(),
  slug: z.string().trim().min(2).max(120).optional(),
  brandId: idField,
  modelId: idField,
  generationId: idField.nullish(),
  trimId: idField.nullish(),
  condition: z.enum(["NEW", "USED"]),
  year: z.number().int().min(1900).max(2100),
  firstRegistrationDate: dateField.nullish(),
  mileage: z.number().int().min(0).max(2_000_000).nullish(),
  previousOwners: z.number().int().min(0).max(50).nullish(),
  accidentKnown: z.boolean().nullish(),
  serviceHistoryAvailable: z.boolean().nullish(),
  fuelTypeId: idField,
  transmissionTypeId: idField,
  bodyTypeId: idField,
  exteriorColorId: idField.nullish(),
  interiorColorId: idField.nullish(),
  powerKw: amountField,
  powerHp: amountField,
  engineDisplacement: z.number().int().min(0).max(20_000).nullish(),
  doors: z.number().int().min(1).max(7).nullish(),
  seats: z.number().int().min(1).max(80).nullish(),
  supplierReference: z.string().trim().max(120).nullish(),
  supplierName: z.string().trim().max(160).nullish(),
  sourceType: z.string().trim().max(60).nullish(),
  sourceUrl: z.string().trim().url().max(2048).nullish(),
  logisticsLocation: z.enum(["CHINA", "IN_TRANSIT", "SENEGAL"]),
  featured: z.boolean().optional(),
} as const;

const createSchema = z.object(vehicleFields).strict();
const updateSchema = z.object(vehicleFields).partial().strict();
const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Lecture back-office
// ---------------------------------------------------------------------------

/** Liste paginée (bornée) du back-office ; exige `vehicle.view`. */
export async function listVehicles(
  actor: Actor,
  filters?: VehicleListFilters,
): Promise<VehicleListResult> {
  requireStaff(actor, "vehicle.view");
  const parsed = parseVehicleFilters(filters);
  // Les onglets comptent sur le périmètre de la recherche : ni l'étape choisie ni la page n'en font partie.
  const scope: VehicleListFilters = { ...parsed };
  delete scope.stage;
  delete scope.page;
  delete scope.pageSize;

  const [page, stageCounts] = await Promise.all([
    dependencies.repository.list(parsed),
    dependencies.repository.countStages(scope),
  ]);

  return { ...page, stageCounts };
}

/** Fiche d'administration ; exige `vehicle.view` et retourne `null` si la ressource n'existe pas. */
export async function getVehicle(actor: Actor, id: string): Promise<VehicleDetail | null> {
  requireStaff(actor, "vehicle.view");
  return dependencies.repository.findDetailById(idOf(id));
}

// ---------------------------------------------------------------------------
// Création et modification
// ---------------------------------------------------------------------------

export async function createVehicle(
  actor: Actor,
  input: unknown,
): Promise<{ id: string; reference: string; slug: string }> {
  requireStaff(actor, "vehicle.create");
  const parsed = parseVehicleCreate(input);

  const sequence = await dependencies.repository.nextReferenceSequence(parsed.year);
  const reference = formatVehicleReference(parsed.year, sequence);
  const slug = parsed.slug ?? slugFromReference(parsed.title, reference);

  // Défense en profondeur : l'unicité reste garantie par la contrainte `vehicles.reference`, une
  // collision se traduit par CONFLICT et jamais par une écriture silencieuse (contrat §2.1).
  const clash = await dependencies.repository.findByReference(reference);
  if (clash) {
    throw new AppError("CONFLICT", "Référence véhicule déjà attribuée.");
  }

  const created = await dependencies.repository.create({ ...parsed, reference, slug });
  return { id: created.id, reference: created.reference, slug: created.slug };
}

export async function updateVehicle(actor: Actor, id: string, input: unknown): Promise<void> {
  requireStaff(actor, "vehicle.edit");
  const vehicleId = idOf(id);
  const patch = parseVehicleUpdate(input);

  const current = await dependencies.repository.findById(vehicleId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  await dependencies.repository.update(vehicleId, patch);
}

// ---------------------------------------------------------------------------
// Publication, retrait, transitions
// ---------------------------------------------------------------------------

export async function publishVehicle(actor: Actor, id: string, reason?: string | null): Promise<void> {
  const staff = requireStaff(actor, "vehicle.publish");
  const vehicleId = idOf(id);

  const current = await dependencies.repository.findById(vehicleId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  const [media, prices] = await Promise.all([
    dependencies.repository.listMedia(vehicleId),
    dependencies.repository.listPrices(vehicleId),
  ]);
  const gaps = publicationGaps(current, media, prices);
  if (gaps.length > 0) {
    throw new AppError("VALIDATION", `Publication impossible : ${gaps.join(", ")} manquant(s).`);
  }

  const publishedAt = new Date();
  const entry = buildAuditEntry({
    actorProfileId: staff.profileId,
    action: "vehicle.publish",
    entityType: "Vehicle",
    entityId: vehicleId,
    oldValues: { isPublished: current.isPublished, publishedAt: current.publishedAt },
    newValues: { isPublished: true, publishedAt },
    reason: reason ?? null,
  });

  await dependencies.repository.transaction(async (tx) => {
    await tx.setPublication(vehicleId, { isPublished: true, publishedAt });
    await dependencies.audit(entry);
  });
}

/** Retrait de publication (`vehicle.withdraw`, motif obligatoire — doc 09). */
export async function unpublishVehicle(actor: Actor, id: string, reason?: string | null): Promise<void> {
  const staff = requireStaff(actor, "vehicle.publish");
  const vehicleId = idOf(id);
  const withdrawReason = requireReason(reason);

  const current = await dependencies.repository.findById(vehicleId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  const entry = buildAuditEntry({
    actorProfileId: staff.profileId,
    action: "vehicle.withdraw",
    entityType: "Vehicle",
    entityId: vehicleId,
    oldValues: { isPublished: current.isPublished, publishedAt: current.publishedAt },
    newValues: { isPublished: false, publishedAt: null },
    reason: withdrawReason,
  });

  await dependencies.repository.transaction(async (tx) => {
    await tx.setPublication(vehicleId, { isPublished: false, publishedAt: null });
    await dependencies.audit(entry);
  });
}

/** Archivage : retrait du catalogue (`vehicle.withdraw`), motif obligatoire. */
export async function archiveVehicle(actor: Actor, id: string, reason?: string | null): Promise<void> {
  const staff = requireStaff(actor, "vehicle.publish");
  const vehicleId = idOf(id);
  const archivedReason = requireReason(reason);

  const current = await dependencies.repository.findById(vehicleId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  if (!canTransitionVehicleStatus(current.commercialStatus, "ARCHIVED")) {
    throw new AppError(
      "CONFLICT",
      `Transition impossible de « ${current.commercialStatus} » vers « ARCHIVED ».`,
    );
  }

  const archivedAt = new Date();
  const entry = buildAuditEntry({
    actorProfileId: staff.profileId,
    action: "vehicle.withdraw",
    entityType: "Vehicle",
    entityId: vehicleId,
    oldValues: { commercialStatus: current.commercialStatus, isPublished: current.isPublished },
    newValues: { commercialStatus: "ARCHIVED", isPublished: false, archivedAt },
    reason: archivedReason,
  });

  await dependencies.repository.transaction(async (tx) => {
    await tx.setCommercialStatus(vehicleId, "ARCHIVED", archivedAt);
    await tx.setPublication(vehicleId, { isPublished: false, publishedAt: null });
    await dependencies.audit(entry);
  });
}

/** Transition commerciale hors archivage (archivage via `archiveVehicle`). */
export async function changeCommercialStatus(
  actor: Actor,
  id: string,
  status: VehicleCommercialStatus,
  reason?: string | null,
): Promise<void> {
  if (status === "ARCHIVED") {
    throw new AppError("VALIDATION", "Utilisez l'archivage dédié pour retirer un véhicule.");
  }

  const staff = requireStaff(actor, STATUS_PERMISSIONS[status] ?? "vehicle.edit");
  const vehicleId = idOf(id);

  const current = await dependencies.repository.findById(vehicleId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  if (!canTransitionVehicleStatus(current.commercialStatus, status)) {
    throw new AppError(
      "CONFLICT",
      `Transition impossible de « ${current.commercialStatus} » vers « ${status} ».`,
    );
  }

  const action = STATUS_AUDIT_ACTIONS[status];
  const transitionReason = action ? requireReason(reason) : null;

  await dependencies.repository.transaction(async (tx) => {
    await tx.setCommercialStatus(vehicleId, status, null);
    if (action) {
      await dependencies.audit(
        buildAuditEntry({
          actorProfileId: staff.profileId,
          action,
          entityType: "Vehicle",
          entityId: vehicleId,
          oldValues: { commercialStatus: current.commercialStatus },
          newValues: { commercialStatus: status },
          reason: transitionReason,
        }),
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Analyse des entrées
// ---------------------------------------------------------------------------

type ParsedVehicleCreate = Omit<VehicleCreateData, "reference" | "slug"> & { slug?: string };

export function parseVehicleCreate(input: unknown): ParsedVehicleCreate {
  const result = createSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée véhicule invalide.");
  }

  return toCreateData(result.data);
}

export function parseVehicleUpdate(input: unknown): VehicleUpdatePatch {
  const result = updateSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée véhicule invalide.");
  }

  return toUpdatePatch(result.data);
}

/** Filtres bornés : pagination limitée, recherche bornée, identifiants et statuts validés. */
export function parseVehicleFilters(filters?: VehicleListFilters): VehicleListFilters {
  const result = z
    .object({
      search: z.string().trim().max(120).optional(),
      stage: z.enum(VEHICLE_STAGES).optional(),
      commercialStatus: z.enum(["DRAFT", "AVAILABLE", "RESERVED", "SOLD", "UNAVAILABLE", "ARCHIVED"]).optional(),
      isPublished: z.boolean().optional(),
      brandId: idField.optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    })
    .strict()
    .safeParse(filters ?? {});

  if (!result.success) {
    throw new AppError("VALIDATION", "Filtres de véhicule invalides.");
  }

  return result.data;
}

function toCreateData(data: z.infer<typeof createSchema>): ParsedVehicleCreate {
  return {
    title: data.title,
    description: data.description ?? null,
    slug: data.slug,
    brandId: data.brandId,
    modelId: data.modelId,
    generationId: data.generationId ?? null,
    trimId: data.trimId ?? null,
    condition: data.condition,
    year: data.year,
    firstRegistrationDate: toDate(data.firstRegistrationDate ?? null),
    mileage: data.mileage ?? null,
    previousOwners: data.previousOwners ?? null,
    accidentKnown: data.accidentKnown ?? null,
    serviceHistoryAvailable: data.serviceHistoryAvailable ?? null,
    fuelTypeId: data.fuelTypeId,
    transmissionTypeId: data.transmissionTypeId,
    bodyTypeId: data.bodyTypeId,
    exteriorColorId: data.exteriorColorId ?? null,
    interiorColorId: data.interiorColorId ?? null,
    powerKw: toDecimalString(data.powerKw ?? null),
    powerHp: toDecimalString(data.powerHp ?? null),
    engineDisplacement: data.engineDisplacement ?? null,
    doors: data.doors ?? null,
    seats: data.seats ?? null,
    supplierReference: data.supplierReference ?? null,
    supplierName: data.supplierName ?? null,
    sourceType: data.sourceType ?? null,
    sourceUrl: data.sourceUrl ?? null,
    logisticsLocation: data.logisticsLocation,
    featured: data.featured ?? false,
  };
}

/** Seuls les champs réellement fournis sont transmis : Prisma laisse les autres colonnes intactes. */
function toUpdatePatch(data: z.infer<typeof updateSchema>): VehicleUpdatePatch {
  const patch: VehicleUpdatePatch = {};

  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description ?? null;
  if (data.slug !== undefined) patch.slug = data.slug;
  if (data.brandId !== undefined) patch.brandId = data.brandId;
  if (data.modelId !== undefined) patch.modelId = data.modelId;
  if (data.generationId !== undefined) patch.generationId = data.generationId ?? null;
  if (data.trimId !== undefined) patch.trimId = data.trimId ?? null;
  if (data.condition !== undefined) patch.condition = data.condition;
  if (data.year !== undefined) patch.year = data.year;
  if (data.firstRegistrationDate !== undefined) {
    patch.firstRegistrationDate = toDate(data.firstRegistrationDate ?? null);
  }
  if (data.mileage !== undefined) patch.mileage = data.mileage ?? null;
  if (data.previousOwners !== undefined) patch.previousOwners = data.previousOwners ?? null;
  if (data.accidentKnown !== undefined) patch.accidentKnown = data.accidentKnown ?? null;
  if (data.serviceHistoryAvailable !== undefined) {
    patch.serviceHistoryAvailable = data.serviceHistoryAvailable ?? null;
  }
  if (data.fuelTypeId !== undefined) patch.fuelTypeId = data.fuelTypeId;
  if (data.transmissionTypeId !== undefined) patch.transmissionTypeId = data.transmissionTypeId;
  if (data.bodyTypeId !== undefined) patch.bodyTypeId = data.bodyTypeId;
  if (data.exteriorColorId !== undefined) patch.exteriorColorId = data.exteriorColorId ?? null;
  if (data.interiorColorId !== undefined) patch.interiorColorId = data.interiorColorId ?? null;
  if (data.powerKw !== undefined) patch.powerKw = toDecimalString(data.powerKw ?? null);
  if (data.powerHp !== undefined) patch.powerHp = toDecimalString(data.powerHp ?? null);
  if (data.engineDisplacement !== undefined) patch.engineDisplacement = data.engineDisplacement ?? null;
  if (data.doors !== undefined) patch.doors = data.doors ?? null;
  if (data.seats !== undefined) patch.seats = data.seats ?? null;
  if (data.supplierReference !== undefined) patch.supplierReference = data.supplierReference ?? null;
  if (data.supplierName !== undefined) patch.supplierName = data.supplierName ?? null;
  if (data.sourceType !== undefined) patch.sourceType = data.sourceType ?? null;
  if (data.sourceUrl !== undefined) patch.sourceUrl = data.sourceUrl ?? null;
  if (data.logisticsLocation !== undefined) patch.logisticsLocation = data.logisticsLocation;
  if (data.featured !== undefined) patch.featured = data.featured;

  return patch;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Slug dérivé du titre, suffixé par la référence pour rester unique et lisible. */
export function slugFromReference(title: string, reference: string): string {
  const base = title
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  const suffix = reference.toLowerCase().replace(/^dbc-/, "");
  return base.length >= 2 ? `${base}-${suffix}` : `vehicule-${suffix}`;
}

/** Projection publique : aucune donnée d'approvisionnement n'est exposée (doc 03 §1). */
export function projectPublicVehicle(record: VehicleRecord): {
  reference: string;
  slug: string;
  title: string;
  description: string | null;
  year: number;
  condition: VehicleCondition;
  logisticsLocation: LogisticsLocation;
  isPublished: boolean;
} {
  return {
    reference: record.reference,
    slug: record.slug,
    title: record.title,
    description: record.description,
    year: record.year,
    condition: record.condition,
    logisticsLocation: record.logisticsLocation,
    isPublished: record.isPublished,
  };
}

function toDate(value: string | null): Date | null {
  if (value === null) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION", "Date invalide.");
  }
  return date;
}

function toDecimalString(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function requireReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new AppError("VALIDATION", "Un motif est requis pour cette transition.");
  }
  return trimmed;
}

function idOf(value: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant de véhicule invalide.");
  }
  return result.data;
}