import { Prisma } from "@prisma/client";
import type {
  CatalogueMediaRow,
  CatalogueVehicleDbRow,
  CatalogueVehicleRow,
} from "@/repositories/catalogue.repository";
import type { CatalogueFacets, CatalogueListQuery, CatalogueRepository } from "@/services/catalogue.service";
import type { VehiclePriceRow } from "@/services/pricing.service";

/**
 * Doubles du catalogue public — AUCUNE base n'est disponible : le service et le repository sont
 * éprouvés via leurs ports. Les identifiants sont stables et factices.
 */

export const BRAND_BYD = "11111111-1111-4111-8111-111111111111";
export const MODEL_SEAL = "22222222-2222-4222-8222-222222222222";
export const BODY_SUV = "33333333-3333-4333-8333-333333333333";
export const FUEL_ELECTRIC = "44444444-4444-4444-8444-444444444444";
export const TRANSMISSION_AUTO = "55555555-5555-4555-8555-555555555555";
export const VEHICLE_ONE = "66666666-6666-4666-8666-666666666666";
export const VEHICLE_TWO = "77777777-7777-4777-8777-777777777777";

export function priceRow(overrides: Partial<VehiclePriceRow> = {}): VehiclePriceRow {
  return {
    id: "price-1",
    pricingProfile: "STANDARD",
    priceType: "REGULAR",
    baseAmount: "12000000.00",
    transportAmount: "1500000.00",
    currency: "XOF",
    validFrom: null,
    validTo: null,
    isActive: true,
    ...overrides,
  };
}

export function catalogueMediaRow(overrides: Partial<CatalogueMediaRow> = {}): CatalogueMediaRow {
  return {
    id: "media-1",
    vehicleId: VEHICLE_ONE,
    mediaType: "IMAGE",
    storagePath: null,
    externalUrl: "https://cdn.example.test/byd-seal-1.jpg",
    thumbnailPath: null,
    displayOrder: 0,
    isPrimary: true,
    visibility: "PUBLIC",
    ...overrides,
  };
}

export function catalogueRow(overrides: Partial<CatalogueVehicleRow> = {}): CatalogueVehicleRow {
  return {
    id: VEHICLE_ONE,
    reference: "DBC-2026-000001",
    slug: "byd-seal-2026-000001",
    title: "BYD Seal 2026",
    description: "Berline électrique disponible.",
    brandId: BRAND_BYD,
    brandName: "BYD",
    modelId: MODEL_SEAL,
    modelName: "Seal",
    year: 2026,
    condition: "NEW",
    mileage: null,
    bodyTypeName: "Berline",
    fuelTypeName: "Électrique",
    transmissionTypeName: "Automatique",
    exteriorColorName: "Blanc",
    logisticsLocation: "SENEGAL",
    commercialStatus: "AVAILABLE",
    eligibilityStatus: "ELIGIBLE",
    publishedAt: new Date("2026-09-01T10:00:00.000Z"),
    media: [catalogueMediaRow()],
    prices: [priceRow()],
    ...overrides,
  };
}

/** Ligne Prisma (prix en `Decimal`, relations imbriquées) pour éprouver la traduction. */
export function catalogueDbRow(overrides: Partial<CatalogueVehicleDbRow> = {}): CatalogueVehicleDbRow {
  return {
    id: VEHICLE_ONE,
    reference: "DBC-2026-000001",
    slug: "byd-seal-2026-000001",
    title: "BYD Seal 2026",
    description: null,
    brandId: BRAND_BYD,
    modelId: MODEL_SEAL,
    year: 2026,
    condition: "NEW",
    mileage: 15000,
    bodyTypeId: BODY_SUV,
    fuelTypeId: FUEL_ELECTRIC,
    transmissionTypeId: TRANSMISSION_AUTO,
    exteriorColorId: null,
    logisticsLocation: "SENEGAL",
    commercialStatus: "AVAILABLE",
    eligibilityStatus: "NOT_CHECKED",
    isPublished: true,
    featured: false,
    publishedAt: new Date("2026-09-01T10:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    brand: { id: BRAND_BYD, name: "BYD", slug: "byd" },
    model: { id: MODEL_SEAL, name: "Seal" },
    bodyType: { id: BODY_SUV, name: "SUV" },
    fuelType: { id: FUEL_ELECTRIC, name: "Électrique" },
    transmissionType: { id: TRANSMISSION_AUTO, name: "Automatique" },
    exteriorColor: null,
    media: [catalogueMediaRow({ storagePath: "byd/seal-1.jpg", externalUrl: null })],
    prices: [
      {
        id: "price-1",
        pricingProfile: "STANDARD",
        priceType: "REGULAR",
        baseAmount: new Prisma.Decimal("12000000.00"),
        transportAmount: new Prisma.Decimal("1500000.00"),
        currency: "XOF",
        validFrom: null,
        validTo: null,
        isActive: true,
      },
    ],
    ...overrides,
  };
}

export function catalogueFacets(overrides: Partial<CatalogueFacets> = {}): CatalogueFacets {
  return {
    brands: [{ id: BRAND_BYD, name: "BYD", slug: "byd" }],
    models: [{ id: MODEL_SEAL, name: "Seal", brandId: BRAND_BYD }],
    bodyTypes: [{ id: BODY_SUV, name: "SUV" }],
    fuelTypes: [{ id: FUEL_ELECTRIC, name: "Électrique" }],
    transmissionTypes: [{ id: TRANSMISSION_AUTO, name: "Automatique" }],
    ...overrides,
  };
}

export type FakeCatalogueRepository = CatalogueRepository & {
  readonly listQueries: CatalogueListQuery[];
  readonly slugQueries: string[];
  readonly privateDocumentQueries: string[];
};

/** Dépôt factice : il applique les mêmes règles publiques que la couche Prisma (SOLD, pagination). */
export function createFakeCatalogueRepository(
  input: {
    rows?: CatalogueVehicleRow[];
    slugs?: { slug: string; publishedAt: Date | null }[];
    facets?: CatalogueFacets;
    privateDocuments?: Record<string, number>;
  } = {},
): FakeCatalogueRepository {
  const rows = input.rows ?? [catalogueRow()];
  const listQueries: CatalogueListQuery[] = [];
  const slugQueries: string[] = [];
  const privateDocumentQueries: string[] = [];

  return {
    listQueries,
    slugQueries,
    privateDocumentQueries,

    async list(query) {
      listQueries.push(query);
      const visible = rows.filter((row) => query.includeSold || row.commercialStatus !== "SOLD");
      const filtered = query.brandId
        ? visible.filter((row) => row.brandId === query.brandId)
        : visible;
      const ordered = [...filtered].sort((left, right) => {
        const leftAt = left.publishedAt?.getTime() ?? 0;
        const rightAt = right.publishedAt?.getTime() ?? 0;
        if (leftAt !== rightAt) return rightAt - leftAt;
        return left.id.localeCompare(right.id);
      });
      const skip = (query.page - 1) * query.pageSize;

      return { items: ordered.slice(skip, skip + query.pageSize), total: ordered.length };
    },

    async findBySlug(slug) {
      slugQueries.push(slug);
      return rows.find((row) => row.slug === slug) ?? null;
    },

    /** Même règle que la couche Prisma (`findByIds`, lot 4) : publié, non archivé, `SOLD` inclus. */
    async findByIds(ids) {
      return rows.filter((row) => ids.includes(row.id));
    },

    async listSimilar(options) {
      return rows
        .filter(
          (row) =>
            row.id !== options.excludeId &&
            row.commercialStatus !== "SOLD" &&
            (row.modelId === options.modelId || row.brandId === options.brandId),
        )
        .slice(0, options.limit);
    },

    async listFeatured(limit) {
      return rows.filter((row) => row.commercialStatus !== "SOLD").slice(0, limit);
    },
    async listRecent(limit) {
      return rows.filter((row) => row.commercialStatus !== "SOLD").slice(0, limit);
    },

    async listFacets() {
      return input.facets ?? catalogueFacets();
    },

    async listPublishedSlugs() {
      return (
        input.slugs ?? rows.map((row) => ({ slug: row.slug, publishedAt: row.publishedAt }))
      );
    },

    async countPrivateDocuments(vehicleId) {
      privateDocumentQueries.push(vehicleId);
      return input.privateDocuments?.[vehicleId] ?? 0;
    },
  };
}

/** Enregistre les arguments réellement transmis à Prisma : aucune base n'est interrogée. */
export function createFakePrismaClient(rows: CatalogueVehicleDbRow[] = []) {
  const vehicleFindMany: Record<string, unknown>[] = [];
  const vehicleCount: Record<string, unknown>[] = [];
  const vehicleFindFirst: Record<string, unknown>[] = [];
  const documentCount: Record<string, unknown>[] = [];

  const client = {
    vehicle: {
      async findMany(args: Record<string, unknown>) {
        vehicleFindMany.push(args);
        return rows;
      },
      async count(args: Record<string, unknown>) {
        vehicleCount.push(args);
        return rows.length;
      },
      async findFirst(args: Record<string, unknown>) {
        vehicleFindFirst.push(args);
        return rows[0] ?? null;
      },
    },
    brand: { async findMany() { return []; } },
    vehicleModel: { async findMany() { return []; } },
    bodyType: { async findMany() { return []; } },
    fuelType: { async findMany() { return []; } },
    transmissionType: { async findMany() { return []; } },
    vehicleDocument: {
      async count(args: Record<string, unknown>) {
        documentCount.push(args);
        return 0;
      },
    },
  };

  return { client, vehicleFindMany, vehicleCount, vehicleFindFirst, documentCount };
}