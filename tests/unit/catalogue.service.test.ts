import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import {
  catalogueMediaSelect,
  catalogueVehicleSelect,
  createCatalogueRepository,
  PUBLIC_VEHICLE_WHERE,
  sortByStandardPrice,
  toCatalogueOrderBy,
  toCatalogueVehicleRow,
  toPublicCatalogueWhere,
  type CatalogueVehicleRow,
} from "@/repositories/catalogue.repository";
import { SENSITIVE_VEHICLE_FIELDS } from "@/repositories/vehicle.repository";
import {
  addDecimalAmounts,
  configureCatalogueDependencies,
  DEFAULT_CATALOGUE_PAGE_SIZE,
  getCatalogueVehicle,
  listCatalogue,
  listCatalogueFacets,
  listFeaturedVehicles,
  listPublishedSlugs,
  listSimilarVehicles,
  parseCatalogueFilters,
  resetCatalogueDependencies,
  resolvePublicMediaUrl,
  toCatalogueCard,
  toCatalogueListQuery,
  toCataloguePrice,
  toPricingActor,
  type CatalogueCard,
  type CatalogueFilters,
  type CatalogueListQuery,
} from "@/services/catalogue.service";
import { staffActor, visitorActor } from "@/tests/unit/support/actors";
import type { Actor } from "@/services/identity.service";
import {
  BODY_SUV,
  BRAND_BYD,
  catalogueDbRow,
  catalogueRow,
  createFakeCatalogueRepository,
  createFakePrismaClient,
  MODEL_SEAL,
  priceRow,
  VEHICLE_ONE,
  VEHICLE_TWO,
} from "@/tests/unit/support/catalogue.fixtures";

/** Revendeur APPROVED : seul acteur qui accède au tarif RESELLER (contrat §A.3). */
const CLIENT_APPROVED: Actor = {
  kind: "customer",
  profileId: "profile-approved",
  customerId: "customer-approved",
  status: "ACTIVE",
  resellerStatus: "APPROVED",
};

function baseQuery(overrides: Partial<CatalogueListQuery> = {}): CatalogueListQuery {
  return {
    search: null,
    brandId: null,
    modelId: null,
    bodyTypeId: null,
    fuelTypeId: null,
    transmissionTypeId: null,
    condition: null,
    logisticsLocation: null,
    yearMin: null,
    yearMax: null,
    includeSold: false,
    sort: "recent",
    page: 1,
    pageSize: DEFAULT_CATALOGUE_PAGE_SIZE,
    ...overrides,
  };
}

describe("parseCatalogueFilters (contrat §A.1)", () => {
  it("applique les valeurs par défaut imposées : disponible, page 1, 12 par page, tri récent", () => {
    expect(parseCatalogueFilters()).toEqual({
      availability: "available",
      page: 1,
      pageSize: 12,
      sort: "recent",
    });
  });

  it("refuse une clé inconnue (zod strict)", () => {
    const filters = { marque: "byd" } as unknown as CatalogueFilters;

    expect(() => parseCatalogueFilters(filters)).toThrowError(/catalogue invalides/i);
  });

  it("borne la pagination : page ≥ 1 et ≤ 10 000, pageSize ≥ 1 et ≤ 24", () => {
    expect(() => parseCatalogueFilters({ page: 0 })).toThrowError(AppError);
    expect(() => parseCatalogueFilters({ page: 10_001 })).toThrowError(AppError);
    expect(() => parseCatalogueFilters({ pageSize: 0 })).toThrowError(AppError);
    expect(() => parseCatalogueFilters({ pageSize: 25 })).toThrowError(AppError);
    expect(parseCatalogueFilters({ page: 3, pageSize: 24 })).toMatchObject({
      page: 3,
      pageSize: 24,
    });
  });

  it("refuse une recherche trop longue, un identifiant non UUID et un état inconnu", () => {
    expect(() => parseCatalogueFilters({ search: "a".repeat(121) })).toThrowError(AppError);
    expect(() => parseCatalogueFilters({ brandId: "pas-un-uuid" })).toThrowError(AppError);
    expect(() =>
      parseCatalogueFilters({ condition: "BROKEN" as unknown as "NEW" }),
    ).toThrowError(AppError);
  });

  it("refuse une année minimale supérieure à l'année maximale", () => {
    expect(() => parseCatalogueFilters({ yearMin: 2026, yearMax: 2020 })).toThrowError(
      /année minimale/i,
    );
  });

  it("convertit une recherche vide en absence de filtre", () => {
    expect(parseCatalogueFilters({ search: "   " })).not.toHaveProperty("search");
    expect(toCatalogueListQuery(parseCatalogueFilters({ search: "" })).search).toBeNull();
  });

  it("traduit availability \"all\" en inclusion des véhicules vendus", () => {
    expect(toCatalogueListQuery(parseCatalogueFilters({ availability: "all" })).includeSold).toBe(
      true,
    );
    expect(toCatalogueListQuery(parseCatalogueFilters()).includeSold).toBe(false);
  });
});

describe("resolvePublicMediaUrl (contrat §3.7)", () => {
  it("ne produit jamais d'URL pour un média non public", () => {
    const base = { externalUrl: "https://cdn.example.test/a.jpg", storagePath: "a.jpg", mediaType: "IMAGE" } as const;

    expect(resolvePublicMediaUrl({ ...base, visibility: "PRIVATE" })).toBeNull();
    expect(resolvePublicMediaUrl({ ...base, visibility: "SHARE_ON_REQUEST" })).toBeNull();
  });

  it("donne la priorité à l'URL externe sur le chemin de stockage", () => {
    expect(
      resolvePublicMediaUrl(
        {
          externalUrl: "https://cdn.example.test/video.mp4",
          storagePath: "video/local.mp4",
          visibility: "PUBLIC",
          mediaType: "VIDEO",
        },
        { supabaseUrl: "https://projet.supabase.co", bucket: "vehicle-images" },
      ),
    ).toBe("https://cdn.example.test/video.mp4");
  });

  it("sert un fichier du bucket privé par la route serveur /api/media/<id>", () => {
    expect(
      resolvePublicMediaUrl(
        {
          id: "11111111-1111-4111-8111-111111111111",
          externalUrl: null,
          storagePath: "/byd/seal 1.jpg",
          visibility: "PUBLIC",
          mediaType: "IMAGE",
        },
        { supabaseUrl: "https://projet.supabase.co/", bucket: "vehicle-images" },
      ),
    ).toBe("/api/media/11111111-1111-4111-8111-111111111111");
  });

  it("désigne la vignette par ?v=thumb et ne révèle jamais l'adresse du stockage", () => {
    const url = resolvePublicMediaUrl(
      {
        id: "11111111-1111-4111-8111-111111111111",
        externalUrl: null,
        storagePath: "byd/seal-thumb.jpg",
        visibility: "PUBLIC",
        mediaType: "IMAGE",
        variant: "thumb",
      },
      { supabaseUrl: "https://projet.supabase.co" },
    );

    expect(url).toBe("/api/media/11111111-1111-4111-8111-111111111111?v=thumb");
    expect(url).not.toContain("supabase");
    expect(url).not.toContain("storage/v1/object/public");
  });

  it("retourne null sans identifiant de média ou sans configuration de stockage", () => {
    expect(
      resolvePublicMediaUrl(
        { externalUrl: null, storagePath: "byd/seal.jpg", visibility: "PUBLIC", mediaType: "IMAGE" },
        { supabaseUrl: "https://projet.supabase.co" },
      ),
    ).toBeNull();

    expect(
      resolvePublicMediaUrl(
        {
          id: "11111111-1111-4111-8111-111111111111",
          externalUrl: null,
          storagePath: "byd/seal.jpg",
          visibility: "PUBLIC",
          mediaType: "IMAGE",
        },
        { supabaseUrl: null, bucket: "vehicle-images" },
      ),
    ).toBeNull();
  });

  it("retourne null sans URL externe ni chemin de stockage", () => {
    expect(
      resolvePublicMediaUrl({
        externalUrl: null,
        storagePath: null,
        visibility: "PUBLIC",
        mediaType: "IMAGE",
      }),
    ).toBeNull();
  });
});

describe("prix servis (contrat §A.3 et BR-006)", () => {
  it("sert le STANDARD au visiteur, à l'acteur suspendu et au personnel", () => {
    const prices = [priceRow()];

    expect(toCataloguePrice(prices, visitorActor)).toMatchObject({
      amount: "12000000.00",
      priceType: "STANDARD",
    });
    expect(toCataloguePrice(prices, staffActor())).toMatchObject({ priceType: "STANDARD" });
    expect(toPricingActor({ kind: "suspended", profileId: "p", userType: "STAFF" })).toEqual({
      kind: "visitor",
    });
  });

  it("sert le RESELLER au Revendeur approuvé, et le STANDARD au Revendeur non approuvé", () => {
    const prices = [
      priceRow(),
      priceRow({ id: "price-2", pricingProfile: "RESELLER", baseAmount: "11000000.00" }),
    ];

    expect(toCataloguePrice(prices, CLIENT_APPROVED)).toMatchObject({
      amount: "11000000.00",
      priceType: "RESELLER",
    });
    expect(
      toCataloguePrice(prices, {
        kind: "customer",
        profileId: "profile-1",
        customerId: "customer-1",
        status: "ACTIVE",
        resellerStatus: "PENDING",
      }),
    ).toMatchObject({ amount: "12000000.00", priceType: "STANDARD" });
  });

  it("reprend le transport de la ligne retenue et n'expose un total que s'il existe", () => {
    const withTransport = toCataloguePrice([priceRow()], visitorActor);
    expect(withTransport).toMatchObject({
      amount: "12000000.00",
      transportAmount: "1500000.00",
      total: "13500000.00",
    });

    const withoutTransport = toCataloguePrice(
      [priceRow({ transportAmount: null })],
      visitorActor,
    );
    expect(withoutTransport).toMatchObject({ transportAmount: null, total: null });

    expect(addDecimalAmounts("9999999999999999.99", "0.02")).toBe("10000000000000000.01");
  });

  it("retourne null (et non un prix inventé) lorsqu'aucune ligne n'est serviable", () => {
    expect(toCataloguePrice([], visitorActor)).toBeNull();
    expect(
      toCataloguePrice([priceRow({ pricingProfile: "RESELLER" })], visitorActor),
    ).toBeNull();
    expect(toCataloguePrice([priceRow({ isActive: false })], visitorActor)).toBeNull();
  });
});

describe("toCatalogueCard — projection publique sans champ sensible", () => {
  it("expose exactement les champs du contrat §A.1", () => {
    const card = toCatalogueCard(catalogueRow(), visitorActor);

    expect(Object.keys(card).sort()).toEqual(
      [
        "bodyTypeName",
        "brandId",
        "brandName",
        "commercialStatus",
        "condition",
        "eligibilityStatus",
        "fuelTypeName",
        "id",
        "logisticsLocation",
        "mileage",
        "modelId",
        "modelName",
        "price",
        "primaryImage",
        "reference",
        "slug",
        "title",
        "transmissionTypeName",
        "year",
      ].sort(),
    );
  });

  it("ne laisse fuiter aucun champ d'approvisionnement, même si la ligne en porte", () => {
    const leaked = {
      ...catalogueRow(),
      supplierReference: "SUP-1",
      supplierName: "Fournisseur X",
      sourceType: "IMPORT",
      sourceUrl: "https://fournisseur.test/offre",
    } as unknown as CatalogueVehicleRow;

    const serialized = JSON.stringify(toCatalogueCard(leaked, visitorActor));

    for (const field of SENSITIVE_VEHICLE_FIELDS) {
      expect(serialized).not.toContain(field);
    }
    expect(serialized).not.toContain("Fournisseur X");
  });

  it("sélectionne l'image publique principale et ignore les médias privés", () => {
    const row = catalogueRow({
      media: [
        {
          id: "media-private",
          vehicleId: VEHICLE_ONE,
          mediaType: "IMAGE",
          storagePath: null,
          externalUrl: "https://cdn.example.test/prive.jpg",
          thumbnailPath: null,
          displayOrder: 0,
          isPrimary: true,
          visibility: "PRIVATE",
        },
        {
          id: "media-public",
          vehicleId: VEHICLE_ONE,
          mediaType: "IMAGE",
          storagePath: null,
          externalUrl: "https://cdn.example.test/public.jpg",
          thumbnailPath: null,
          displayOrder: 1,
          isPrimary: false,
          visibility: "PUBLIC",
        },
      ],
    });

    expect(toCatalogueCard(row, visitorActor).primaryImage?.url).toBe(
      "https://cdn.example.test/public.jpg",
    );
  });

  it("retourne primaryImage null quand aucune URL publique n'est constructible", () => {
    const row = catalogueRow({
      media: [
        {
          id: "media-1",
          vehicleId: VEHICLE_ONE,
          mediaType: "IMAGE",
          storagePath: "byd/seal.jpg",
          externalUrl: null,
          thumbnailPath: null,
          displayOrder: 0,
          isPrimary: true,
          visibility: "PUBLIC",
        },
      ],
    });

    expect(toCatalogueCard(row, visitorActor, { mediaConfig: { supabaseUrl: null } }).primaryImage).toBeNull();
  });
});

describe("listCatalogue (visibilité, disponibilité, pagination)", () => {
  it("exclut SOLD par défaut et conserve RESERVED avec son badge", async () => {
    const fake = createFakeCatalogueRepository({
      rows: [
        catalogueRow({ id: VEHICLE_ONE, slug: "byd-seal", commercialStatus: "AVAILABLE" }),
        catalogueRow({ id: VEHICLE_TWO, slug: "byd-dolphin", commercialStatus: "SOLD" }),
        catalogueRow({ id: "88888888-8888-4888-8888-888888888888", slug: "byd-atto", commercialStatus: "RESERVED" }),
      ],
    });
    configureCatalogueDependencies({ repository: fake });

    const page = await listCatalogue(visitorActor);

    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.slug)).toEqual(["byd-seal", "byd-atto"]);
    expect(page.items.map((item) => item.commercialStatus)).toEqual(["AVAILABLE", "RESERVED"]);
    resetCatalogueDependencies();
  });

  it("réaffiche SOLD avec availability \"all\"", async () => {
    const fake = createFakeCatalogueRepository({
      rows: [
        catalogueRow({ id: VEHICLE_ONE, slug: "byd-seal", commercialStatus: "AVAILABLE" }),
        catalogueRow({ id: VEHICLE_TWO, slug: "byd-dolphin", commercialStatus: "SOLD" }),
      ],
    });
    configureCatalogueDependencies({ repository: fake });

    const page = await listCatalogue(visitorActor, { availability: "all" });

    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.commercialStatus)).toContain("SOLD");
    expect(fake.listQueries[0].includeSold).toBe(true);
    resetCatalogueDependencies();
  });

  it("pagine côté serveur : total, page, pageSize et pageCount restent bornés", async () => {
    const rows = Array.from({ length: 30 }, (_value, index) =>
      catalogueRow({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        slug: `vehicule-${index}`,
        publishedAt: new Date(2026, 0, 1 + index),
      }),
    );
    const fake = createFakeCatalogueRepository({ rows });
    configureCatalogueDependencies({ repository: fake });

    const first = await listCatalogue(visitorActor);
    expect(first).toMatchObject({ total: 30, page: 1, pageSize: 12, pageCount: 3 });
    expect(first.items).toHaveLength(12);

    const last = await listCatalogue(visitorActor, { page: 3 });
    expect(last.page).toBe(3);
    expect(last.items).toHaveLength(6);
    expect(fake.listQueries[1]).toMatchObject({ page: 3, pageSize: 12 });
    resetCatalogueDependencies();
  });

  it("propage un refus VALIDATION sans repli silencieux", async () => {
    configureCatalogueDependencies({ repository: createFakeCatalogueRepository() });

    await expect(listCatalogue(visitorActor, { pageSize: 25 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      listCatalogue(visitorActor, { brandId: "inconnu" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    resetCatalogueDependencies();
  });

  it("transmet les filtres bornés au repository", async () => {
    const fake = createFakeCatalogueRepository();
    configureCatalogueDependencies({ repository: fake });

    await listCatalogue(visitorActor, {
      search: "seal",
      brandId: BRAND_BYD,
      modelId: MODEL_SEAL,
      bodyTypeId: BODY_SUV,
      condition: "NEW",
      logisticsLocation: "SENEGAL",
      yearMin: 2020,
      yearMax: 2026,
      sort: "price_asc",
    });

    expect(fake.listQueries[0]).toMatchObject({
      search: "seal",
      brandId: BRAND_BYD,
      modelId: MODEL_SEAL,
      bodyTypeId: BODY_SUV,
      condition: "NEW",
      logisticsLocation: "SENEGAL",
      yearMin: 2020,
      yearMax: 2026,
      sort: "price_asc",
    });
    resetCatalogueDependencies();
  });
});

describe("getCatalogueVehicle, similaires et nouveautés", () => {
  it("retourne null — jamais FORBIDDEN — pour un slug inexploitable ou absent", async () => {
    const fake = createFakeCatalogueRepository();
    configureCatalogueDependencies({ repository: fake });

    await expect(getCatalogueVehicle(visitorActor, "Slug Invalide !")).resolves.toBeNull();
    expect(fake.slugQueries).toHaveLength(0);

    await expect(getCatalogueVehicle(visitorActor, "vehicule-absent")).resolves.toBeNull();
    expect(fake.slugQueries).toEqual(["vehicule-absent"]);
    resetCatalogueDependencies();
  });

  it("compose la fiche : galerie publique, résumé technique et rapport sur demande", async () => {
    const fake = createFakeCatalogueRepository({
      rows: [
        catalogueRow({
          media: [
            {
              id: "media-public",
              vehicleId: VEHICLE_ONE,
              mediaType: "VIDEO",
              storagePath: null,
              externalUrl: "https://cdn.example.test/seal.mp4",
              thumbnailPath: null,
              displayOrder: 0,
              isPrimary: false,
              visibility: "PUBLIC",
            },
            {
              id: "media-private",
              vehicleId: VEHICLE_ONE,
              mediaType: "IMAGE",
              storagePath: null,
              externalUrl: "https://cdn.example.test/prive.jpg",
              thumbnailPath: null,
              displayOrder: 1,
              isPrimary: false,
              visibility: "PRIVATE",
            },
          ],
        }),
      ],
      privateDocuments: { [VEHICLE_ONE]: 2 },
    });
    configureCatalogueDependencies({ repository: fake });

    const detail = await getCatalogueVehicle(visitorActor, "byd-seal-2026-000001");

    expect(detail?.media.map((item) => item.id)).toEqual(["media-public"]);
    expect(detail?.specs).toContainEqual({ label: "État", value: "Neuf" });
    expect(detail?.specs).toContainEqual({ label: "Localisation", value: "Sénégal" });
    expect(detail?.inspectionOnRequest).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("prive.jpg");
    resetCatalogueDependencies();
  });

  it("borne les limites : similaires (4 par défaut, max 8) et nouveautés (6 par défaut, max 12)", async () => {
    const rows = Array.from({ length: 20 }, (_value, index) =>
      catalogueRow({
        id: `00000000-0000-4000-9000-${index.toString().padStart(12, "0")}`,
        slug: `vehicule-${index}`,
      }),
    );
    configureCatalogueDependencies({ repository: createFakeCatalogueRepository({ rows }) });

    const similar = await listSimilarVehicles(visitorActor, {
      id: "00000000-0000-4000-9000-000000000099",
      brandId: BRAND_BYD,
      modelId: MODEL_SEAL,
    });
    expect(similar).toHaveLength(4);

    const featured = await listFeaturedVehicles(visitorActor);
    expect(featured).toHaveLength(6);

    await expect(
      listSimilarVehicles(visitorActor, { id: VEHICLE_ONE, brandId: BRAND_BYD, modelId: MODEL_SEAL }, 9),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(listFeaturedVehicles(visitorActor, 13)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    resetCatalogueDependencies();
  });

  it("expose les facettes et les slugs publiés sans jamais vendre un véhicule SOLD", async () => {
    const fake = createFakeCatalogueRepository({
      slugs: [{ slug: "byd-seal", publishedAt: new Date("2026-09-01T00:00:00.000Z") }],
    });
    configureCatalogueDependencies({ repository: fake });

    const facets = await listCatalogueFacets();
    expect(facets.brands).toEqual([{ id: BRAND_BYD, name: "BYD", slug: "byd" }]);
    expect(facets.models).toEqual([{ id: MODEL_SEAL, name: "Seal", brandId: BRAND_BYD }]);

    await expect(listPublishedSlugs()).resolves.toEqual([
      { slug: "byd-seal", publishedAt: new Date("2026-09-01T00:00:00.000Z") },
    ]);
    resetCatalogueDependencies();
  });
});

describe("repository catalogue — défense en profondeur", () => {
  it("ne sélectionne jamais un champ d'approvisionnement", () => {
    for (const field of SENSITIVE_VEHICLE_FIELDS) {
      expect(catalogueVehicleSelect).not.toHaveProperty(field);
      expect(catalogueMediaSelect).not.toHaveProperty(field);
    }
    expect(Object.keys(catalogueVehicleSelect).filter((key) => key.includes("supplier"))).toEqual([]);
    expect(Object.keys(catalogueVehicleSelect)).toContain("eligibilityStatus");
  });

  it("filtre isPublished et archivedAt dans toutes les requêtes publiques", () => {
    expect(toPublicCatalogueWhere(baseQuery())).toMatchObject({
      isPublished: true,
      archivedAt: null,
    });
    expect(PUBLIC_VEHICLE_WHERE).toMatchObject({ isPublished: true, archivedAt: null });

    const repository = createCatalogueRepository(
      createFakePrismaClient().client as unknown as Prisma.TransactionClient,
    );

    return expect(repository.findBySlug("byd-seal")).resolves.toBeNull();
  });

  it("exclut SOLD par défaut et le réintègre uniquement avec includeSold", () => {
    expect(toPublicCatalogueWhere(baseQuery()).commercialStatus).toEqual({ not: "SOLD" });
    expect(toPublicCatalogueWhere(baseQuery({ includeSold: true }))).not.toHaveProperty(
      "commercialStatus",
    );
  });

  it("compte le total avec le MÊME where que la liste et pagine par skip/take", async () => {
    const { client, vehicleCount, vehicleFindMany } = createFakePrismaClient([]);
    const repository = createCatalogueRepository(client as unknown as Prisma.TransactionClient);

    const result = await repository.list(baseQuery({ page: 2, pageSize: 12 }));

    expect(result).toEqual({ items: [], total: 0 });
    expect(vehicleCount[0].where).toEqual(vehicleFindMany[0].where);
    expect(vehicleFindMany[0]).toMatchObject({ skip: 12, take: 12 });
  });

  it("applique un tri déterministe terminé par l'identifiant", () => {
    for (const sort of ["recent", "price_asc", "price_desc", "year_desc", "mileage_asc"] as const) {
      const orderBy = toCatalogueOrderBy(sort);
      expect(orderBy.at(-1)).toEqual({ id: "asc" });
    }
    expect(toCatalogueOrderBy("recent")[0]).toEqual({ publishedAt: "desc" });
    expect(toCatalogueOrderBy("year_desc")[0]).toEqual({ year: "desc" });
    expect(toCatalogueOrderBy("mileage_asc")[0]).toEqual({ mileage: "asc" });
  });

  it("trie par prix STANDARD servi au visiteur, véhicules sans prix en fin de liste", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const rows = [
      catalogueRow({ id: "a", prices: [priceRow({ baseAmount: "12000000.00" })] }),
      catalogueRow({ id: "b", prices: [priceRow({ baseAmount: "9000000.00" })] }),
      catalogueRow({
        id: "c",
        prices: [
          priceRow({ id: "reseller", pricingProfile: "RESELLER", baseAmount: "1000000.00" }),
        ],
      }),
      catalogueRow({ id: "d", prices: [] }),
    ];

    expect(sortByStandardPrice(rows, "price_asc", now).map((row) => row.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(sortByStandardPrice(rows, "price_desc", now).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("traduit la ligne Prisma en ligne publique (Decimal → chaîne, libellés aplatis)", () => {
    const row = toCatalogueVehicleRow(catalogueDbRow());

    expect(row.brandName).toBe("BYD");
    expect(row.bodyTypeName).toBe("SUV");
    expect(row.mileage).toBe(15000);
    expect(row.prices[0]).toMatchObject({
      baseAmount: "12000000.00",
      transportAmount: "1500000.00",
    });
    expect(Object.keys(row)).not.toContain("supplierReference");
  });

  it("compte les documents non publics d'un véhicule pour « rapport sur demande »", async () => {
    const { client, documentCount } = createFakePrismaClient([]);
    const repository = createCatalogueRepository(client as unknown as Prisma.TransactionClient);

    await expect(repository.countPrivateDocuments(VEHICLE_ONE)).resolves.toBe(0);
    expect(documentCount[0]).toEqual({
      where: { vehicleId: VEHICLE_ONE, visibility: { not: "PUBLIC" } },
    });
  });

  it("projette une fiche sans prix en « prix sur demande » (price null, jamais inventé)", () => {
    const card: CatalogueCard = toCatalogueCard(catalogueRow({ prices: [] }), visitorActor);

    expect(card.price).toBeNull();
  });
});
