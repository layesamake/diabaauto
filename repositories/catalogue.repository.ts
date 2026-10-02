import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { toVehiclePriceRow, vehiclePriceSelect, type VehiclePriceDbRow } from "@/repositories/pricing.repository";
import { resolveFromRows } from "@/services/pricing.service";
import type {
  CatalogueEligibilityStatus,
  CatalogueFacets,
  CatalogueListQuery,
  CatalogueRepository,
  CatalogueSort,
} from "@/services/catalogue.service";
import type { VehiclePriceRow } from "@/services/pricing.service";
import type {
  DocumentVisibility,
  LogisticsLocation,
  MediaType,
  VehicleCommercialStatus,
  VehicleCondition,
} from "@/services/vehicle.service";

/**
 * Accès Prisma au CATALOGUE PUBLIC (doc 05 §2 et §3, contrat lot 3 §4 « Enfant A »).
 *
 * Règles de la couche :
 * - les sélections sont EXPLICITES et ne portent JAMAIS les champs de `SENSITIVE_VEHICLE_FIELDS`
 *   (`supplierReference`, `supplierName`, `sourceType`, `sourceUrl`) : une requête publique ne peut
 *   donc pas les charger, même si le modèle Prisma évolue (doc 03 §1) ;
 * - `isPublished: true` ET `archivedAt: null` sont posés dans TOUTES les requêtes publiques
 *   (défense en profondeur en plus de la RLS) ;
 * - `total` est compté avec le MÊME `where` que la liste, pour que `pageCount` reste cohérent ;
 * - marque, modèle, carrosserie, énergie, boîte, couleur, médias (ordre `displayOrder`, principal
 *   d'abord) et prix actifs sont joints dans la sélection de carte.
 *
 * Note : le tri par prix ne peut pas être exprimé par Prisma (il porte sur une relation filtrée par
 * `pricingProfile`), il est donc calculé sur l'ensemble filtré puis découpé en page — l'échelle
 * reste celle d'un catalogue, ce point est signalé au rapport.
 */

/** Colonnes de média strictement nécessaires à l'affichage public. */
export const catalogueMediaSelect = {
  id: true,
  vehicleId: true,
  mediaType: true,
  storagePath: true,
  externalUrl: true,
  thumbnailPath: true,
  displayOrder: true,
  isPrimary: true,
  visibility: true,
} satisfies Prisma.VehicleMediaSelect;

/**
 * Sélection PUBLIQUE de la carte et de la fiche : aucun champ d'approvisionnement, aucun coût.
 * `mode: "insensitive"` n'apparaît pas ici (il ne concerne que les filtres de recherche).
 */
export const catalogueVehicleSelect = {
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
  bodyTypeId: true,
  fuelTypeId: true,
  transmissionTypeId: true,
  exteriorColorId: true,
  logisticsLocation: true,
  commercialStatus: true,
  eligibilityStatus: true,
  isPublished: true,
  featured: true,
  publishedAt: true,
  archivedAt: true,
  createdAt: true,
  brand: { select: { id: true, name: true, slug: true } },
  model: { select: { id: true, name: true } },
  bodyType: { select: { id: true, name: true } },
  fuelType: { select: { id: true, name: true } },
  transmissionType: { select: { id: true, name: true } },
  exteriorColor: { select: { id: true, name: true, hexCode: true } },
  media: {
    select: catalogueMediaSelect,
    orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }, { id: "asc" }],
  },
  prices: { where: { isActive: true }, select: vehiclePriceSelect },
} satisfies Prisma.VehicleSelect;

/** Ligne de média publique (visibilité et chemins inclus : le filtrage reste au service). */
export type CatalogueMediaRow = {
  id: string;
  vehicleId: string;
  mediaType: MediaType;
  storagePath: string | null;
  externalUrl: string | null;
  thumbnailPath: string | null;
  displayOrder: number;
  isPrimary: boolean;
  visibility: DocumentVisibility;
};

/**
 * Ligne de catalogue traduite : libellés de référentiel aplatis, médias et prix ACTIFS joints.
 * Aucun champ d'approvisionnement, aucune marge, aucun coût — la projection de carte n'y accède
 * pas et ne peut donc pas les exposer.
 */
export type CatalogueVehicleRow = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  description: string | null;
  brandId: string;
  brandName: string;
  modelId: string;
  modelName: string;
  year: number;
  condition: VehicleCondition;
  mileage: number | null;
  bodyTypeName: string;
  fuelTypeName: string;
  transmissionTypeName: string;
  exteriorColorName: string | null;
  logisticsLocation: LogisticsLocation;
  commercialStatus: VehicleCommercialStatus;
  eligibilityStatus: CatalogueEligibilityStatus;
  publishedAt: Date | null;
  media: CatalogueMediaRow[];
  prices: VehiclePriceRow[];
};

/** Ligne Prisma de la sélection publique (avant traduction : prix en `Decimal`, relations imbriquées). */
export type CatalogueVehicleDbRow = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  description: string | null;
  brandId: string;
  modelId: string;
  year: number;
  condition: VehicleCondition;
  mileage: number | null;
  bodyTypeId: string;
  fuelTypeId: string;
  transmissionTypeId: string;
  exteriorColorId: string | null;
  logisticsLocation: LogisticsLocation;
  commercialStatus: VehicleCommercialStatus;
  eligibilityStatus: CatalogueVehicleRow["eligibilityStatus"];
  isPublished: boolean;
  featured: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  brand: { id: string; name: string; slug: string };
  model: { id: string; name: string };
  bodyType: { id: string; name: string };
  fuelType: { id: string; name: string };
  transmissionType: { id: string; name: string };
  exteriorColor: { id: string; name: string; hexCode: string | null } | null;
  media: CatalogueMediaRow[];
  prices: VehiclePriceDbRow[];
};

/**
 * Traduction explicite ligne SQL → contrat du domaine (testable sans base) : les libellés de
 * référentiel sont aplatis, les `Decimal` de prix repassent par `toVehiclePriceRow` (chaînes, jamais
 * des flottants) et les colonnes non sélectionnées sont écartées.
 */
export function toCatalogueVehicleRow(row: CatalogueVehicleDbRow): CatalogueVehicleRow {
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    brandId: row.brandId,
    brandName: row.brand.name,
    modelId: row.modelId,
    modelName: row.model.name,
    year: row.year,
    condition: row.condition,
    mileage: row.mileage ?? null,
    bodyTypeName: row.bodyType.name,
    fuelTypeName: row.fuelType.name,
    transmissionTypeName: row.transmissionType.name,
    exteriorColorName: row.exteriorColor ? row.exteriorColor.name : null,
    logisticsLocation: row.logisticsLocation,
    commercialStatus: row.commercialStatus,
    eligibilityStatus: row.eligibilityStatus,
    publishedAt: row.publishedAt ?? null,
    media: row.media.map((item) => ({ ...item })),
    prices: row.prices.map(toVehiclePriceRow),
  };
}

/** Véhicule publié, non archivé et non vendu : socle commun des requêtes publiques. */
export const PUBLIC_VEHICLE_WHERE = {
  isPublished: true,
  archivedAt: null,
  commercialStatus: { not: "SOLD" },
} satisfies Prisma.VehicleWhereInput;

/** Construit le `where` public : publication, archivage, disponibilité et filtres bornés. */
export function toPublicCatalogueWhere(query: CatalogueListQuery): Prisma.VehicleWhereInput {
  const yearRange: Prisma.IntFilter = {
    ...(query.yearMin === null ? {} : { gte: query.yearMin }),
    ...(query.yearMax === null ? {} : { lte: query.yearMax }),
  };

  return {
    isPublished: true,
    archivedAt: null,
    ...(query.includeSold ? {} : { commercialStatus: { not: "SOLD" } }),
    ...(query.brandId === null ? {} : { brandId: query.brandId }),
    ...(query.modelId === null ? {} : { modelId: query.modelId }),
    ...(query.bodyTypeId === null ? {} : { bodyTypeId: query.bodyTypeId }),
    ...(query.fuelTypeId === null ? {} : { fuelTypeId: query.fuelTypeId }),
    ...(query.transmissionTypeId === null ? {} : { transmissionTypeId: query.transmissionTypeId }),
    ...(query.condition === null ? {} : { condition: query.condition }),
    ...(query.logisticsLocation === null ? {} : { logisticsLocation: query.logisticsLocation }),
    ...(query.yearMin === null && query.yearMax === null ? {} : { year: yearRange }),
    ...(query.search === null || query.search.length === 0
      ? {}
      : {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { reference: { contains: query.search, mode: "insensitive" } },
          ],
        }),
  };
}

/** Tri SQL déterministe : un tri secondaire stable sur `id` départage toujours les ex æquo. */
export function toCatalogueOrderBy(sort: CatalogueSort): Prisma.VehicleOrderByWithRelationInput[] {
  switch (sort) {
    case "year_desc":
      return [{ year: "desc" }, { id: "asc" }];
    case "mileage_asc":
      return [{ mileage: "asc" }, { id: "asc" }];
    default:
      // `price_asc` / `price_desc` sont retriés en mémoire : l'ordre initial reste « recent ».
      return [{ publishedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }];
  }
}

/**
 * Tri par prix SERVIS AU VISITEUR (prix STANDARD actif), jamais par prix revendeur ; les véhicules
 * sans prix servi passent en fin de liste quel que soit le sens (contrat §A.3).
 */
export function sortByStandardPrice(
  rows: readonly CatalogueVehicleRow[],
  sort: "price_asc" | "price_desc",
  now: Date,
): CatalogueVehicleRow[] {
  const direction = sort === "price_asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftAmount = standardAmountOf(left, now);
    const rightAmount = standardAmountOf(right, now);
    if (leftAmount === null && rightAmount === null) return 0;
    if (leftAmount === null) return 1;
    if (rightAmount === null) return -1;

    return messageCents(leftAmount) === messageCents(rightAmount)
      ? 0
      : (messageCents(leftAmount) < messageCents(rightAmount) ? -1 : 1) * direction;
  });
}

function standardAmountOf(row: CatalogueVehicleRow, now: Date): string | null {
  const resolved = resolveFromRows(row.prices, { kind: "visitor" }, now);
  return resolved ? resolved.amount : null;
}

function messageCents(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.split(".");
  const empty = BigInt(0);
  return BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2)) || empty;
}

export function createCatalogueRepository(
  client: Prisma.TransactionClient = prisma,
): CatalogueRepository {
  async function list(
    query: CatalogueListQuery,
  ): Promise<{ items: CatalogueVehicleRow[]; total: number }> {
    const where = toPublicCatalogueWhere(query);
    const total = await client.vehicle.count({ where });
    const skip = (query.page - 1) * query.pageSize;

    if (query.sort === "price_asc" || query.sort === "price_desc") {
      const rows = await client.vehicle.findMany({
        where,
        select: catalogueVehicleSelect,
        orderBy: toCatalogueOrderBy("recent"),
      });
      const sorted = sortByStandardPrice(rows.map(toCatalogueVehicleRow), query.sort, new Date());

      return { items: sorted.slice(skip, skip + query.pageSize), total };
    }

    const rows = await client.vehicle.findMany({
      where,
      select: catalogueVehicleSelect,
      orderBy: toCatalogueOrderBy(query.sort),
      skip,
      take: query.pageSize,
    });

    return { items: rows.map(toCatalogueVehicleRow), total };
  }

  async function findBySlug(slug: string): Promise<CatalogueVehicleRow | null> {
    const row = await client.vehicle.findFirst({
      where: { slug, isPublished: true, archivedAt: null },
      select: catalogueVehicleSelect,
    });

    return row ? toCatalogueVehicleRow(row) : null;
  }

  /**
   * Véhicules publics correspondant à des identifiants connus (lot 4, enrichissement des favoris).
   * Même règle que `findBySlug` : publié ET non archivé, `SOLD` INCLUS (un favori sur un véhicule
   * vendu reste affichable, exactement comme sa fiche — contrat §3.2). Un id inconnu, non publié ou
   * archivé est simplement absent du résultat, jamais une erreur.
   */
  async function findByIds(ids: string[]): Promise<CatalogueVehicleRow[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await client.vehicle.findMany({
      where: { id: { in: ids }, isPublished: true, archivedAt: null },
      select: catalogueVehicleSelect,
    });

    return rows.map(toCatalogueVehicleRow);
  }

  async function listSimilar(input: {
    excludeId: string;
    brandId: string;
    modelId: string;
    limit: number;
  }): Promise<CatalogueVehicleRow[]> {
    const rows = await client.vehicle.findMany({
      where: {
        ...PUBLIC_VEHICLE_WHERE,
        id: { not: input.excludeId },
        OR: [{ modelId: input.modelId }, { brandId: input.brandId }],
      },
      select: catalogueVehicleSelect,
      orderBy: toCatalogueOrderBy("recent"),
      take: input.limit * 3,
    });

    // Le même modèle passe avant la même marque, puis l'ordre « recent » est conservé.
    return rows
      .map((row, index) => ({ row: toCatalogueVehicleRow(row), index }))
      .sort((left, right) => {
        const rank =
          Number(left.row.modelId !== input.modelId) - Number(right.row.modelId !== input.modelId);
        return rank === 0 ? left.index - right.index : rank;
      })
      .slice(0, input.limit)
      .map((entry) => entry.row);
  }

  async function listFeatured(limit: number): Promise<CatalogueVehicleRow[]> {
    const rows = await client.vehicle.findMany({
      where: { ...PUBLIC_VEHICLE_WHERE, featured: true },
      select: catalogueVehicleSelect,
      orderBy: toCatalogueOrderBy("recent"),
      take: limit,
    });

    return rows.map(toCatalogueVehicleRow);
  }

  async function listFacets(): Promise<CatalogueFacets> {
    const [brands, models, bodyTypes, fuelTypes, transmissionTypes] = await Promise.all([
      client.brand.findMany({
        where: { isActive: true, vehicles: { some: PUBLIC_VEHICLE_WHERE } },
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      client.vehicleModel.findMany({
        where: { isActive: true, vehicles: { some: PUBLIC_VEHICLE_WHERE } },
        select: { id: true, name: true, brandId: true },
        orderBy: [{ brandId: "asc" }, { name: "asc" }, { id: "asc" }],
      }),
      client.bodyType.findMany({
        where: { vehicles: { some: PUBLIC_VEHICLE_WHERE } },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      client.fuelType.findMany({
        where: { vehicles: { some: PUBLIC_VEHICLE_WHERE } },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      client.transmissionType.findMany({
        where: { vehicles: { some: PUBLIC_VEHICLE_WHERE } },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    ]);

    return {
      brands: brands.map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
      models: models.map((row) => ({ id: row.id, name: row.name, brandId: row.brandId })),
      bodyTypes: bodyTypes.map((row) => ({ id: row.id, name: row.name })),
      fuelTypes: fuelTypes.map((row) => ({ id: row.id, name: row.name })),
      transmissionTypes: transmissionTypes.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  async function listPublishedSlugs(): Promise<{ slug: string; publishedAt: Date | null }[]> {
    const rows = await client.vehicle.findMany({
      where: PUBLIC_VEHICLE_WHERE,
      select: { slug: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    });

    return rows.map((row) => ({ slug: row.slug, publishedAt: row.publishedAt ?? null }));
  }

  /** Compte les documents NON publics : la fiche annonce « rapport disponible sur demande ». */
  async function countPrivateDocuments(vehicleId: string): Promise<number> {
    return client.vehicleDocument.count({
      where: { vehicleId, visibility: { not: "PUBLIC" } },
    });
  }

  return {
    list,
    findBySlug,
    findByIds,
    listSimilar,
    listFeatured,
    listFacets,
    listPublishedSlugs,
    countPrivateDocuments,
  };
}