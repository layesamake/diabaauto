import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { translatePrismaError } from "@/lib/prisma/errors";
import { nextVehicleSequence } from "@/lib/vehicle-reference";
import { VEHICLE_STAGES, type VehicleStage } from "@/lib/vehicle-stage";
import type {
  VehicleCreateData,
  VehicleDetail,
  VehicleListFilters,
  VehicleStageCounts,
  VehicleListItem,
  VehicleListPage,
  VehicleMediaSummary,
  VehiclePriceSummary,
  VehicleRecord,
  VehicleRepository,
  VehicleUpdatePatch,
} from "@/services/vehicle.service";

/**
 * Accès Prisma aux véhicules (doc 03 §6), à leurs médias et à leurs prix.
 *
 * `vehicleSelect` est la sélection d'ADMINISTRATION (back-office). `publicVehicleSelect` est la
 * sélection PUBLIQUE : elle n'expose aucune donnée d'approvisionnement (`supplier_reference`,
 * `supplier_name`, `source_type`, `source_url`) ni coût, afin qu'aucune requête publique ne puisse
 * les faire fuiter même si le modèle Prisma évolue (CLAUDE.md §7).
 */

/** Colonnes d'administration du véhicule (back-office habilité). */
export const vehicleSelect = {
  id: true,
  reference: true,
  slug: true,
  title: true,
  description: true,
  brandId: true,
  modelId: true,
  year: true,
  condition: true,
  logisticsLocation: true,
  commercialStatus: true,
  isPublished: true,
  publishedAt: true,
  archivedAt: true,
} as const;

/** Colonnes de liste back-office (aucun champ d'approvisionnement). */
export const vehicleListSelect = {
  id: true,
  reference: true,
  slug: true,
  title: true,
  brandId: true,
  modelId: true,
  year: true,
  condition: true,
  logisticsLocation: true,
  commercialStatus: true,
  isPublished: true,
  featured: true,
  mileage: true,
  publishedAt: true,
} as const;

/** Image principale publique et prix standard actif : les deux conditions de mise en ligne qui varient. */
const PRIMARY_PUBLIC_IMAGE = { mediaType: "IMAGE", isPrimary: true, visibility: "PUBLIC" } as const;
const ACTIVE_STANDARD_PRICE = { pricingProfile: "STANDARD", isActive: true } as const;

/**
 * Sélection de la liste : les colonnes de `vehicleListSelect` et deux indicateurs. `take: 1` suffit
 * (on ne veut qu'un oui ou un non) ; aucun média ni prix n'est renvoyé au service.
 */
export const vehicleListEntrySelect = {
  ...vehicleListSelect,
  media: { where: PRIMARY_PUBLIC_IMAGE, select: { id: true }, take: 1 },
  prices: { where: ACTIVE_STANDARD_PRICE, select: { id: true }, take: 1 },
} as const;

/** Colonnes de la fiche d'administration (`vehicle.view` obligatoire). */
export const vehicleDetailSelect = {
  ...vehicleListSelect,
  description: true,
  generationId: true,
  trimId: true,
  firstRegistrationDate: true,
  previousOwners: true,
  accidentKnown: true,
  serviceHistoryAvailable: true,
  fuelTypeId: true,
  transmissionTypeId: true,
  bodyTypeId: true,
  exteriorColorId: true,
  interiorColorId: true,
  powerKw: true,
  powerHp: true,
  engineDisplacement: true,
  doors: true,
  seats: true,
  supplierReference: true,
  supplierName: true,
  sourceType: true,
  sourceUrl: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Colonnes publiques autorisées (doc 03 §1 : « Données publiques séparées des coûts, notes et
 * documents privés »). Champs d'approvisionnement volontairement exclus.
 */
export const publicVehicleSelect = {
  id: true,
  reference: true,
  slug: true,
  title: true,
  description: true,
  brandId: true,
  modelId: true,
  year: true,
  condition: true,
  mileage: true,
  fuelTypeId: true,
  transmissionTypeId: true,
  bodyTypeId: true,
  exteriorColorId: true,
  interiorColorId: true,
  powerKw: true,
  powerHp: true,
  doors: true,
  seats: true,
  logisticsLocation: true,
  commercialStatus: true,
  isPublished: true,
  publishedAt: true,
} as const;

/** Champs sensibles qui ne doivent jamais apparaître dans une sélection publique. */
export const SENSITIVE_VEHICLE_FIELDS = [
  "supplierReference",
  "supplierName",
  "sourceType",
  "sourceUrl",
] as const;

export type VehicleRow = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  description: string | null;
  brandId: string;
  modelId: string;
  year: number;
  condition: VehicleRecord["condition"];
  logisticsLocation: VehicleRecord["logisticsLocation"];
  commercialStatus: VehicleRecord["commercialStatus"];
  isPublished: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toVehicleRecord(row: VehicleRow): VehicleRecord {
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    brandId: row.brandId,
    modelId: row.modelId,
    year: row.year,
    condition: row.condition,
    logisticsLocation: row.logisticsLocation,
    commercialStatus: row.commercialStatus,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt ?? null,
    archivedAt: row.archivedAt ?? null,
  };
}

export type VehicleListItemRow = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  brandId: string;
  modelId: string;
  year: number;
  condition: VehicleListItem["condition"];
  logisticsLocation: VehicleListItem["logisticsLocation"];
  commercialStatus: VehicleListItem["commercialStatus"];
  isPublished: boolean;
  featured: boolean;
  mileage: number | null;
  publishedAt: Date | null;
};

export function toVehicleListItem(row: VehicleListItemRow): VehicleListItem {
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    title: row.title,
    brandId: row.brandId,
    modelId: row.modelId,
    year: row.year,
    condition: row.condition,
    logisticsLocation: row.logisticsLocation,
    commercialStatus: row.commercialStatus,
    isPublished: row.isPublished,
    featured: row.featured,
    mileage: row.mileage ?? null,
    publishedAt: row.publishedAt ?? null,
  };
}

export type VehicleDetailRow = VehicleListItemRow & {
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
  powerKw: Prisma.Decimal | null;
  powerHp: Prisma.Decimal | null;
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

export function toVehicleDetail(row: VehicleDetailRow): VehicleDetail {
  return {
    ...toVehicleListItem(row),
    description: row.description ?? null,
    generationId: row.generationId ?? null,
    trimId: row.trimId ?? null,
    firstRegistrationDate: row.firstRegistrationDate ?? null,
    previousOwners: row.previousOwners ?? null,
    accidentKnown: row.accidentKnown ?? null,
    serviceHistoryAvailable: row.serviceHistoryAvailable ?? null,
    fuelTypeId: row.fuelTypeId,
    transmissionTypeId: row.transmissionTypeId,
    bodyTypeId: row.bodyTypeId,
    exteriorColorId: row.exteriorColorId ?? null,
    interiorColorId: row.interiorColorId ?? null,
    powerKw: row.powerKw ? row.powerKw.toString() : null,
    powerHp: row.powerHp ? row.powerHp.toString() : null,
    engineDisplacement: row.engineDisplacement ?? null,
    doors: row.doors ?? null,
    seats: row.seats ?? null,
    supplierReference: row.supplierReference ?? null,
    supplierName: row.supplierName ?? null,
    sourceType: row.sourceType ?? null,
    sourceUrl: row.sourceUrl ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const DEFAULT_PAGE_SIZE = 20;

/** Construit le filtre `where` borné de la liste back-office. */
/**
 * Condition d'une étape. Disjointes : `online`, `ready` et `incomplete` excluent l'archivé et le
 * vendu, que `sold` capte seul.
 */
export function toStageWhere(stage: VehicleStage): Prisma.VehicleWhereInput {
  const live = { archivedAt: null, commercialStatus: { not: "SOLD" } } as const;
  const readyToPublish = {
    media: { some: PRIMARY_PUBLIC_IMAGE },
    prices: { some: ACTIVE_STANDARD_PRICE },
  } as const;

  switch (stage) {
    case "online":
      return { ...live, isPublished: true };
    case "ready":
      return { ...live, isPublished: false, ...readyToPublish };
    case "incomplete":
      return { ...live, isPublished: false, NOT: readyToPublish };
    case "sold":
      return { commercialStatus: "SOLD" };
  }
}

export function toVehicleWhere(filters: VehicleListFilters = {}): Prisma.VehicleWhereInput {
  const { stage, ...base } = filters;
  const where = toBaseVehicleWhere(base);

  return stage ? { AND: [where, toStageWhere(stage)] } : where;
}

function toBaseVehicleWhere(filters: VehicleListFilters): Prisma.VehicleWhereInput {
  return {
    ...(filters.commercialStatus ? { commercialStatus: filters.commercialStatus } : {}),
    ...(filters.isPublished === undefined ? {} : { isPublished: filters.isPublished }),
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { reference: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function createVehicleRepository(client: Prisma.TransactionClient = prisma): VehicleRepository {
  async function findByReference(reference: string): Promise<VehicleRecord | null> {
    const row = await client.vehicle.findUnique({ where: { reference }, select: vehicleSelect });
    return row ? toVehicleRecord(row) : null;
  }

  async function findById(id: string): Promise<VehicleRecord | null> {
    const row = await client.vehicle.findUnique({ where: { id }, select: vehicleSelect });
    return row ? toVehicleRecord(row) : null;
  }

  async function findDetailById(id: string): Promise<VehicleDetail | null> {
    const row = await client.vehicle.findUnique({ where: { id }, select: vehicleDetailSelect });
    return row ? toVehicleDetail(row) : null;
  }

  async function list(filters: VehicleListFilters): Promise<VehicleListPage> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
    const where = toVehicleWhere(filters);

    const [rows, total] = await Promise.all([
      client.vehicle.findMany({
        where,
        select: vehicleListEntrySelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      client.vehicle.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...toVehicleListItem(row),
        hasPrimaryImage: row.media.length > 0,
        hasStandardPrice: row.prices.length > 0,
      })),
      total,
    };
  }

  async function countStages(filters: VehicleListFilters): Promise<VehicleStageCounts> {
    const [all, ...perStage] = await Promise.all([
      client.vehicle.count({ where: toVehicleWhere(filters) }),
      ...VEHICLE_STAGES.map((stage) => client.vehicle.count({ where: toVehicleWhere({ ...filters, stage }) })),
    ]);

    return {
      all,
      ...(Object.fromEntries(VEHICLE_STAGES.map((stage, index) => [stage, perStage[index]])) as Record<
        VehicleStage,
        number
      >),
    };
  }

  async function nextReferenceSequence(year: number): Promise<number> {
    const rows = await client.vehicle.findMany({
      where: { reference: { startsWith: `DBC-${year}-` } },
      select: { reference: true },
    });

    return nextVehicleSequence(
      year,
      rows.map((row) => row.reference),
    );
  }

  async function create(input: VehicleCreateData): Promise<VehicleRecord> {
    try {
      const row = await client.vehicle.create({
        data: {
          reference: input.reference,
          slug: input.slug,
          title: input.title,
          description: input.description,
          brandId: input.brandId,
          modelId: input.modelId,
          generationId: input.generationId,
          trimId: input.trimId,
          condition: input.condition,
          year: input.year,
          firstRegistrationDate: input.firstRegistrationDate,
          mileage: input.mileage,
          previousOwners: input.previousOwners,
          accidentKnown: input.accidentKnown,
          serviceHistoryAvailable: input.serviceHistoryAvailable,
          fuelTypeId: input.fuelTypeId,
          transmissionTypeId: input.transmissionTypeId,
          bodyTypeId: input.bodyTypeId,
          exteriorColorId: input.exteriorColorId,
          interiorColorId: input.interiorColorId,
          powerKw: input.powerKw,
          powerHp: input.powerHp,
          engineDisplacement: input.engineDisplacement,
          doors: input.doors,
          seats: input.seats,
          supplierReference: input.supplierReference,
          supplierName: input.supplierName,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          logisticsLocation: input.logisticsLocation,
          featured: input.featured,
        },
        select: vehicleSelect,
      });

      return toVehicleRecord(row);
    } catch (error) {
      const translated = translatePrismaError(error, "Référence ou slug véhicule déjà utilisé.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function update(id: string, patch: VehicleUpdatePatch): Promise<VehicleRecord> {
    try {
      const row = await client.vehicle.update({
        where: { id },
        data: toVehicleUpdateData(patch),
        select: vehicleSelect,
      });

      return toVehicleRecord(row);
    } catch (error) {
      const translated = translatePrismaError(error, "Référence ou slug véhicule déjà utilisé.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function setPublication(
    id: string,
    values: { isPublished: boolean; publishedAt: Date | null },
  ): Promise<VehicleRecord> {
    const row = await client.vehicle.update({
      where: { id },
      data: { isPublished: values.isPublished, publishedAt: values.publishedAt },
      select: vehicleSelect,
    });

    return toVehicleRecord(row);
  }

  async function setCommercialStatus(
    id: string,
    status: VehicleRecord["commercialStatus"],
    archivedAt: Date | null,
  ): Promise<VehicleRecord> {
    const row = await client.vehicle.update({
      where: { id },
      data: { commercialStatus: status, archivedAt },
      select: vehicleSelect,
    });

    return toVehicleRecord(row);
  }

  async function listMedia(vehicleId: string): Promise<VehicleMediaSummary[]> {
    const rows = await client.vehicleMedia.findMany({
      where: { vehicleId },
      select: { id: true, mediaType: true, isPrimary: true, visibility: true },
      orderBy: { displayOrder: "asc" },
    });

    return rows.map((row) => ({
      id: row.id,
      mediaType: row.mediaType,
      isPrimary: row.isPrimary,
      visibility: row.visibility,
    }));
  }

  async function listPrices(vehicleId: string): Promise<VehiclePriceSummary[]> {
    const rows = await client.vehiclePrice.findMany({
      where: { vehicleId },
      select: { pricingProfile: true, isActive: true },
    });

    return rows.map((row) => ({ pricingProfile: row.pricingProfile, isActive: row.isActive }));
  }

  return {
    findByReference,
    findById,
    findDetailById,
    list,
    countStages,
    nextReferenceSequence,
    create,
    update,
    setPublication,
    setCommercialStatus,
    listMedia,
    listPrices,
    // Transaction de premier niveau uniquement : le client transactionnel ne relance pas de
    // transaction imbriquée (l'appelant ne compose pas deux `transaction`).
    transaction: (fn) => prisma.$transaction(async (tx) => fn(createVehicleRepository(tx))),
  };
}

/** Seuls les champs fournis sont transmis : Prisma laisse les autres colonnes inchangées. */
export function toVehicleUpdateData(patch: VehicleUpdatePatch): Prisma.VehicleUpdateInput {
  return {
    ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.brandId !== undefined ? { brandId: patch.brandId } : {}),
    ...(patch.modelId !== undefined ? { modelId: patch.modelId } : {}),
    ...(patch.generationId !== undefined ? { generationId: patch.generationId } : {}),
    ...(patch.trimId !== undefined ? { trimId: patch.trimId } : {}),
    ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
    ...(patch.year !== undefined ? { year: patch.year } : {}),
    ...(patch.firstRegistrationDate !== undefined
      ? { firstRegistrationDate: patch.firstRegistrationDate }
      : {}),
    ...(patch.mileage !== undefined ? { mileage: patch.mileage } : {}),
    ...(patch.previousOwners !== undefined ? { previousOwners: patch.previousOwners } : {}),
    ...(patch.accidentKnown !== undefined ? { accidentKnown: patch.accidentKnown } : {}),
    ...(patch.serviceHistoryAvailable !== undefined
      ? { serviceHistoryAvailable: patch.serviceHistoryAvailable }
      : {}),
    ...(patch.fuelTypeId !== undefined ? { fuelTypeId: patch.fuelTypeId } : {}),
    ...(patch.transmissionTypeId !== undefined ? { transmissionTypeId: patch.transmissionTypeId } : {}),
    ...(patch.bodyTypeId !== undefined ? { bodyTypeId: patch.bodyTypeId } : {}),
    ...(patch.exteriorColorId !== undefined ? { exteriorColorId: patch.exteriorColorId } : {}),
    ...(patch.interiorColorId !== undefined ? { interiorColorId: patch.interiorColorId } : {}),
    ...(patch.powerKw !== undefined ? { powerKw: patch.powerKw } : {}),
    ...(patch.powerHp !== undefined ? { powerHp: patch.powerHp } : {}),
    ...(patch.engineDisplacement !== undefined ? { engineDisplacement: patch.engineDisplacement } : {}),
    ...(patch.doors !== undefined ? { doors: patch.doors } : {}),
    ...(patch.seats !== undefined ? { seats: patch.seats } : {}),
    ...(patch.supplierReference !== undefined ? { supplierReference: patch.supplierReference } : {}),
    ...(patch.supplierName !== undefined ? { supplierName: patch.supplierName } : {}),
    ...(patch.sourceType !== undefined ? { sourceType: patch.sourceType } : {}),
    ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl } : {}),
    ...(patch.logisticsLocation !== undefined ? { logisticsLocation: patch.logisticsLocation } : {}),
    ...(patch.featured !== undefined ? { featured: patch.featured } : {}),
  };
}