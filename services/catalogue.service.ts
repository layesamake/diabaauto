import { z } from "zod";
import { AppError } from "@/lib/errors";
import { DEFAULT_VEHICLE_IMAGE_BUCKET, readStorageConfig } from "@/lib/storage/vehicle-storage";
import { createCatalogueRepository } from "@/repositories/catalogue.repository";
import { resolveFromRows, type PricingActor } from "@/services/pricing.service";
import type { Actor } from "@/services/identity.service";
import type {
  CatalogueMediaRow,
  CatalogueVehicleRow,
} from "@/repositories/catalogue.repository";
import type { VehiclePriceRow } from "@/services/pricing.service";

/**
 * Catalogue public (doc 05 §2 et §3, contrat lot 3 §4 « Enfant A »).
 *
 * Invariants tenus par ce module :
 * - visibilité : seuls `isPublished = true` ET `archivedAt = null` sortent (liste, fiche, slugs) ;
 * - disponibilité : `SOLD` est exclu par défaut, `RESERVED` reste listé, `availability: "all"`
 *   réaffiche `SOLD` ; la fiche d'un véhicule vendu reste accessible (contrat §3.2) ;
 * - prix : jamais calculé en dur, toujours `resolveFromRows` sur les lignes ACTIVES ; un acteur non
 *   `customer` ou non APPROVED voit le STANDARD (contrat §A.3) ;
 * - transport séparé : `amount` (véhicule) et `transportAmount` (transport) sont deux lignes
 *   distinctes, le `total` n'existe que si le transport est présent (BR-006) ;
 * - champs interdits : `SENSITIVE_VEHICLE_FIELDS` n'apparaît dans aucune projection publique ;
 * - médias : `visibility !== "PUBLIC"` exclu, toute URL publique passe par `resolvePublicMediaUrl`.
 *
 * Le port `CatalogueRepository` est remplaçable (`configureCatalogueDependencies`) : les Server
 * Components n'ont aucun paramètre d'infrastructure et les tests restent unitaires, sans base.
 */

export type CatalogueSort = "recent" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";

export type CatalogueAvailability = "available" | "all";

export type CatalogueFilters = {
  search?: string;
  brandId?: string;
  modelId?: string;
  bodyTypeId?: string;
  fuelTypeId?: string;
  transmissionTypeId?: string;
  condition?: "NEW" | "USED";
  logisticsLocation?: "CHINA" | "IN_TRANSIT" | "SENEGAL";
  yearMin?: number;
  yearMax?: number;
  availability?: CatalogueAvailability; // défaut "available"
  page?: number; // défaut 1
  pageSize?: number; // défaut 12, max 24
  sort?: CatalogueSort; // défaut "recent"
};

export type CataloguePrice = {
  amount: string; // prix véhicule, chaîne décimale
  transportAmount: string | null;
  total: string | null; // somme des deux, null si transport absent
  currency: string;
  priceType: "STANDARD" | "RESELLER";
  anomaly?: "MISSING_RESELLER_PRICE";
};

export type CatalogueImage = { url: string; alt: string };

export type CatalogueCard = {
  id: string;
  reference: string;
  slug: string;
  title: string;
  /**
   * Identifiants de référentiel (marque, modèle) : nécessaires à l'appel `listSimilarVehicles`
   * depuis la fiche véhicule. Ce sont des UUID de référentiel public, jamais des données
   * d'approvisionnement (intégration lot 3, décision T30).
   */
  brandId: string;
  modelId: string;
  brandName: string;
  modelName: string;
  year: number;
  condition: "NEW" | "USED";
  mileage: number | null;
  bodyTypeName: string;
  fuelTypeName: string;
  transmissionTypeName: string;
  logisticsLocation: "CHINA" | "IN_TRANSIT" | "SENEGAL";
  commercialStatus: "DRAFT" | "AVAILABLE" | "RESERVED" | "SOLD" | "UNAVAILABLE" | "ARCHIVED";
  eligibilityStatus: "NOT_CHECKED" | "ELIGIBLE" | "NOT_ELIGIBLE" | "REVIEW_REQUIRED";
  price: CataloguePrice | null; // null = prix non disponible pour cet acteur
  primaryImage: CatalogueImage | null;
};

export type CataloguePage = {
  items: CatalogueCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CatalogueMediaItem = CatalogueImage & {
  id: string;
  mediaType: "IMAGE" | "VIDEO";
  thumbnailUrl: string | null;
};

export type CatalogueDetail = CatalogueCard & {
  description: string | null;
  publishedAt: Date | null;
  media: CatalogueMediaItem[];
  specs: { label: string; value: string }[];
  inspectionOnRequest: boolean;
};

export type CatalogueBrand = { id: string; name: string; slug: string };

/** État d'éligibilité d'import : aucune règle n'est recalculée ici, la valeur vient de la base. */
export type CatalogueEligibilityStatus =
  | "NOT_CHECKED"
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "REVIEW_REQUIRED";

/** Filtres bornés transmis au repository (aucune valeur par défaut implicite au-delà de `parse`). */
export type CatalogueListQuery = {
  search: string | null;
  brandId: string | null;
  modelId: string | null;
  bodyTypeId: string | null;
  fuelTypeId: string | null;
  transmissionTypeId: string | null;
  condition: "NEW" | "USED" | null;
  logisticsLocation: "CHINA" | "IN_TRANSIT" | "SENEGAL" | null;
  yearMin: number | null;
  yearMax: number | null;
  includeSold: boolean;
  sort: CatalogueSort;
  page: number;
  pageSize: number;
};

export type CatalogueFacets = {
  brands: CatalogueBrand[];
  models: { id: string; name: string; brandId: string }[];
  bodyTypes: { id: string; name: string }[];
  fuelTypes: { id: string; name: string }[];
  transmissionTypes: { id: string; name: string }[];
};

/**
 * Port d'accès aux données publiques. Le service ne connaît ni Prisma ni le nom des tables : le
 * repository traduit les lignes et applique une `select` explicite sans champ d'approvisionnement.
 */
export type CatalogueRepository = {
  list(query: CatalogueListQuery): Promise<{ items: CatalogueVehicleRow[]; total: number }>;
  /** `null` si le véhicule n'existe pas ou n'est pas public (jamais d'erreur d'autorisation). */
  findBySlug(slug: string): Promise<CatalogueVehicleRow | null>;
  /** Véhicules publics correspondant à des identifiants connus (lot 4, enrichissement des favoris). */
  findByIds(ids: string[]): Promise<CatalogueVehicleRow[]>;
  listSimilar(input: {
    excludeId: string;
    brandId: string;
    modelId: string;
    limit: number;
  }): Promise<CatalogueVehicleRow[]>;
  listFeatured(limit: number): Promise<CatalogueVehicleRow[]>;
  listFacets(): Promise<CatalogueFacets>;
  listPublishedSlugs(): Promise<{ slug: string; publishedAt: Date | null }[]>;
  /** Nombre de documents non publics du véhicule (`PRIVATE` / `SHARE_ON_REQUEST`). */
  countPrivateDocuments(vehicleId: string): Promise<number>;
};

export type CatalogueDependencies = { repository: CatalogueRepository };

let dependencies: CatalogueDependencies = { repository: createCatalogueRepository() };

/** Remplace le repository (tests unitaires, ou composition serveur). */
export function configureCatalogueDependencies(next: Partial<CatalogueDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit le repository Prisma par défaut. */
export function resetCatalogueDependencies(): void {
  dependencies = { repository: createCatalogueRepository() };
}

export const DEFAULT_CATALOGUE_PAGE_SIZE = 12;
export const MAX_CATALOGUE_PAGE_SIZE = 24;
export const MAX_CATALOGUE_PAGE = 10_000;
export const MAX_CATALOGUE_SEARCH_LENGTH = 120;
export const MAX_SIMILAR_LIMIT = 8;
export const DEFAULT_SIMILAR_LIMIT = 4;
export const MAX_FEATURED_LIMIT = 12;
export const DEFAULT_FEATURED_LIMIT = 6;

// ---------------------------------------------------------------------------
// Analyse des filtres
// ---------------------------------------------------------------------------

const idField = z.string().trim().uuid();
const slugField = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const yearField = z.number().int().min(1900).max(2100);

const catalogueFiltersSchema = z
  .object({
    search: z.string().trim().max(MAX_CATALOGUE_SEARCH_LENGTH).optional(),
    brandId: idField.optional(),
    modelId: idField.optional(),
    bodyTypeId: idField.optional(),
    fuelTypeId: idField.optional(),
    transmissionTypeId: idField.optional(),
    condition: z.enum(["NEW", "USED"]).optional(),
    logisticsLocation: z.enum(["CHINA", "IN_TRANSIT", "SENEGAL"]).optional(),
    yearMin: yearField.optional(),
    yearMax: yearField.optional(),
    availability: z.enum(["available", "all"]).optional(),
    page: z.number().int().min(1).max(MAX_CATALOGUE_PAGE).optional(),
    pageSize: z.number().int().min(1).max(MAX_CATALOGUE_PAGE_SIZE).optional(),
    sort: z.enum(["recent", "price_asc", "price_desc", "year_desc", "mileage_asc"]).optional(),
  })
  .strict();

/**
 * Valide et normalise les filtres publics : clé inconnue refusée, identifiants UUID, recherche
 * bornée, pagination bornée, `yearMin ≤ yearMax`. Une entrée malformée lève `VALIDATION` — jamais
 * de repli silencieux (contrat §A.1).
 */
export function parseCatalogueFilters(filters?: CatalogueFilters): CatalogueFilters {
  const result = catalogueFiltersSchema.safeParse(filters ?? {});
  if (!result.success) {
    throw new AppError("VALIDATION", "Filtres de catalogue invalides.");
  }

  const data = result.data;
  if (data.yearMin !== undefined && data.yearMax !== undefined && data.yearMin > data.yearMax) {
    throw new AppError("VALIDATION", "L'année minimale dépasse l'année maximale.");
  }

  const search = data.search?.trim();

  return {
    ...(search ? { search } : {}),
    ...(data.brandId === undefined ? {} : { brandId: data.brandId }),
    ...(data.modelId === undefined ? {} : { modelId: data.modelId }),
    ...(data.bodyTypeId === undefined ? {} : { bodyTypeId: data.bodyTypeId }),
    ...(data.fuelTypeId === undefined ? {} : { fuelTypeId: data.fuelTypeId }),
    ...(data.transmissionTypeId === undefined ? {} : { transmissionTypeId: data.transmissionTypeId }),
    ...(data.condition === undefined ? {} : { condition: data.condition }),
    ...(data.logisticsLocation === undefined ? {} : { logisticsLocation: data.logisticsLocation }),
    ...(data.yearMin === undefined ? {} : { yearMin: data.yearMin }),
    ...(data.yearMax === undefined ? {} : { yearMax: data.yearMax }),
    availability: data.availability ?? "available",
    page: data.page ?? 1,
    pageSize: data.pageSize ?? DEFAULT_CATALOGUE_PAGE_SIZE,
    sort: data.sort ?? "recent",
  };
}

/** Traduit les filtres normalisés en requête de repository (nuls explicites, jamais d'implicite). */
export function toCatalogueListQuery(filters: CatalogueFilters): CatalogueListQuery {
  return {
    search: filters.search && filters.search.length > 0 ? filters.search : null,
    brandId: filters.brandId ?? null,
    modelId: filters.modelId ?? null,
    bodyTypeId: filters.bodyTypeId ?? null,
    fuelTypeId: filters.fuelTypeId ?? null,
    transmissionTypeId: filters.transmissionTypeId ?? null,
    condition: filters.condition ?? null,
    logisticsLocation: filters.logisticsLocation ?? null,
    yearMin: filters.yearMin ?? null,
    yearMax: filters.yearMax ?? null,
    includeSold: filters.availability === "all",
    sort: filters.sort ?? "recent",
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? DEFAULT_CATALOGUE_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Médias publics
// ---------------------------------------------------------------------------

/**
 * URL publique d'un média (contrat §3.7). UNE seule fonction construit une URL publique :
 * `externalUrl` prime, sinon URL publique du bucket de stockage, sinon `null`. Un média non PUBLIC
 * ne produit JAMAIS d'URL.
 */
export function resolvePublicMediaUrl(
  media: {
    externalUrl: string | null;
    storagePath: string | null;
    visibility: "PUBLIC" | "PRIVATE" | "SHARE_ON_REQUEST";
    mediaType: "IMAGE" | "VIDEO";
  },
  config?: { supabaseUrl?: string | null; bucket?: string },
): string | null {
  if (media.visibility !== "PUBLIC") {
    return null;
  }

  const external = media.externalUrl?.trim();
  if (external) {
    return external;
  }

  const path = media.storagePath?.trim();
  if (!path) {
    return null;
  }

  const resolved = config ?? defaultMediaConfig();
  const base = resolved.supabaseUrl?.trim();
  if (!base) {
    return null;
  }

  const bucket = resolved.bucket?.trim() || DEFAULT_VEHICLE_IMAGE_BUCKET;
  const encoded = path
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${encoded}`;
}

function defaultMediaConfig(): { supabaseUrl: string | null; bucket: string } {
  const storage = readStorageConfig();
  return { supabaseUrl: storage.supabaseUrl, bucket: storage.bucket };
}

/** Vignette d'un média : même fonction d'URL, appliquée au chemin de vignette. */
function toThumbnailUrl(media: CatalogueMediaRow, config: MediaConfig): string | null {
  if (!media.thumbnailPath) return null;
  return resolvePublicMediaUrl(
    {
      externalUrl: null,
      storagePath: media.thumbnailPath,
      visibility: media.visibility,
      mediaType: media.mediaType,
    },
    config,
  );
}

type MediaConfig = { supabaseUrl?: string | null; bucket?: string };

/** Une image de carte : libellé alternatif construit sur l'identité du véhicule, jamais inventé. */
function imageAlt(row: CatalogueVehicleRow): string {
  const parts = [row.brandName, row.modelName, String(row.year)].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" ") : row.title;
}

/** Média principal : premier média IMAGE public, le principal en tête (ordre garanti par le SQL). */
export function toPrimaryImage(
  row: CatalogueVehicleRow,
  config?: MediaConfig,
): CatalogueImage | null {
  for (const media of row.media) {
    if (!media.isPrimary || media.mediaType !== "IMAGE" || media.visibility !== "PUBLIC") continue;
    const url = resolvePublicMediaUrl(media, config);
    if (url) return { url, alt: imageAlt(row) };
  }

  for (const media of row.media) {
    if (media.mediaType !== "IMAGE" || media.visibility !== "PUBLIC") continue;
    const url = resolvePublicMediaUrl(media, config);
    if (url) return { url, alt: imageAlt(row) };
  }

  return null;
}

/** Galerie publique : seuls les médias PUBLICS dont une URL publique existe sont servis. */
export function toCatalogueMedia(
  row: CatalogueVehicleRow,
  config?: MediaConfig,
): CatalogueMediaItem[] {
  const items: CatalogueMediaItem[] = [];

  for (const media of row.media) {
    const url = resolvePublicMediaUrl(media, config);
    if (!url) continue;

    items.push({
      id: media.id,
      mediaType: media.mediaType,
      url,
      alt: imageAlt(row),
      thumbnailUrl: toThumbnailUrl(media, config ?? defaultMediaConfig()),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Prix servis
// ---------------------------------------------------------------------------

/**
 * Mappe l'acteur applicatif vers l'acteur de prix (contrat §A.3) : seul un client APPROVED accède au
 * tarif RESELLER, tout le reste (visiteur, client standard, personnel) voit le STANDARD.
 */
export function toPricingActor(actor: Actor): PricingActor {
  if (actor.kind === "customer" && actor.resellerStatus === "APPROVED") {
    return { kind: "customer", resellerStatus: "APPROVED" };
  }

  return { kind: "visitor" };
}

/** Prix public servi ; `null` quand aucune ligne ne peut être servie (mode « prix sur demande »). */
export function toCataloguePrice(
  prices: readonly VehiclePriceRow[],
  actor: Actor,
  now: Date = new Date(),
): CataloguePrice | null {
  const resolved = resolveFromRows(prices, toPricingActor(actor), now);
  if (!resolved) {
    return null;
  }

  const transportAmount = resolved.transportAmount;
  return {
    amount: resolved.amount,
    transportAmount,
    total: transportAmount === null ? null : addDecimalAmounts(resolved.amount, transportAmount),
    currency: resolved.currency,
    priceType: resolved.priceType,
    ...(resolved.anomaly === undefined ? {} : { anomaly: resolved.anomaly }),
  };
}

/** Somme de deux chaînes décimales sans passer par un flottant (centimes en `BigInt`). */
export function addDecimalAmounts(left: string, right: string): string {
  const sum = toCents(left) + toCents(right);
  const negative = sum < BigInt(0);
  const absolute = negative ? -sum : sum;
  const whole = absolute / BigInt(100);
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function toCents(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.trim().split(".");
  return BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

const CONDITION_LABELS: Readonly<Record<"NEW" | "USED", string>> = {
  NEW: "Neuf",
  USED: "Occasion",
};

const LOCATION_LABELS: Readonly<Record<"CHINA" | "IN_TRANSIT" | "SENEGAL", string>> = {
  CHINA: "Chine",
  IN_TRANSIT: "En transit",
  SENEGAL: "Sénégal",
};

/**
 * Projection publique d'une ligne de catalogue : aucune donnée d'approvisionnement, aucune marge,
 * aucun coût — seuls les champs du contrat §A.1 sortent.
 */
export function toCatalogueCard(
  row: CatalogueVehicleRow,
  actor: Actor,
  options: { now?: Date; mediaConfig?: MediaConfig } = {},
): CatalogueCard {
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    title: row.title,
    brandId: row.brandId,
    modelId: row.modelId,
    brandName: row.brandName,
    modelName: row.modelName,
    year: row.year,
    condition: row.condition,
    mileage: row.mileage,
    bodyTypeName: row.bodyTypeName,
    fuelTypeName: row.fuelTypeName,
    transmissionTypeName: row.transmissionTypeName,
    logisticsLocation: row.logisticsLocation,
    commercialStatus: row.commercialStatus,
    eligibilityStatus: row.eligibilityStatus,
    price: toCataloguePrice(row.prices, actor, options.now ?? new Date()),
    primaryImage: toPrimaryImage(row, options.mediaConfig),
  };
}

/** Résumé technique de la fiche : libellés en français, aucune donnée d'approvisionnement. */
export function buildCatalogueSpecs(row: CatalogueVehicleRow): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = [
    { label: "État", value: CONDITION_LABELS[row.condition] },
    { label: "Année", value: String(row.year) },
  ];

  if (row.mileage !== null) {
    specs.push({ label: "Kilométrage", value: `${row.mileage.toLocaleString("fr-FR")} km` });
  }
  specs.push(
    { label: "Carrosserie", value: row.bodyTypeName },
    { label: "Énergie", value: row.fuelTypeName },
    { label: "Boîte de vitesses", value: row.transmissionTypeName },
    { label: "Localisation", value: LOCATION_LABELS[row.logisticsLocation] },
  );

  if (row.exteriorColorName) {
    specs.push({ label: "Couleur extérieure", value: row.exteriorColorName });
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Lecture publique
// ---------------------------------------------------------------------------

/** Liste paginée du catalogue public. `SOLD` exclu par défaut (contrat §3.2). */
export async function listCatalogue(
  actor: Actor,
  filters?: CatalogueFilters,
): Promise<CataloguePage> {
  const parsed = parseCatalogueFilters(filters);
  const query = toCatalogueListQuery(parsed);
  const result = await dependencies.repository.list(query);
  const now = new Date();
  const mediaConfig = defaultMediaConfig();

  return {
    items: result.items.map((row) => toCatalogueCard(row, actor, { now, mediaConfig })),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: pageCountOf(result.total, query.pageSize),
  };
}

/**
 * Fiche publique. Retourne `null` — jamais `FORBIDDEN` — si le véhicule n'existe pas, n'est pas
 * publié, ou si le slug est inexploitable (contrat §A.1).
 */
export async function getCatalogueVehicle(
  actor: Actor,
  slug: string,
): Promise<CatalogueDetail | null> {
  const parsed = slugField.safeParse(slug);
  if (!parsed.success) {
    return null;
  }

  const row = await dependencies.repository.findBySlug(parsed.data);
  if (!row) {
    return null;
  }

  const now = new Date();
  const mediaConfig = defaultMediaConfig();
  const card = toCatalogueCard(row, actor, { now, mediaConfig });
  const privateDocuments = await dependencies.repository.countPrivateDocuments(row.id);

  return {
    ...card,
    description: row.description,
    publishedAt: row.publishedAt,
    media: toCatalogueMedia(row, mediaConfig),
    specs: buildCatalogueSpecs(row),
    inspectionOnRequest: privateDocuments > 0,
  };
}

/** Véhicules similaires : même modèle d'abord, puis même marque (défaut 4, max 8). */
export async function listSimilarVehicles(
  actor: Actor,
  vehicle: { id: string; brandId: string; modelId: string },
  limit: number = DEFAULT_SIMILAR_LIMIT,
): Promise<CatalogueCard[]> {
  const bounded = parseLimit(limit, DEFAULT_SIMILAR_LIMIT, MAX_SIMILAR_LIMIT, "Limite de véhicules similaires invalide.");
  const rows = await dependencies.repository.listSimilar({
    excludeId: idOf(vehicle.id, "Identifiant de véhicule invalide."),
    brandId: idOf(vehicle.brandId, "Identifiant de marque invalide."),
    modelId: idOf(vehicle.modelId, "Identifiant de modèle invalide."),
    limit: bounded,
  });
  const now = new Date();
  const mediaConfig = defaultMediaConfig();

  return rows.map((row) => toCatalogueCard(row, actor, { now, mediaConfig }));
}

/** Facettes de filtrage : référentiels actifs et rattachés à au moins un véhicule public. */
export async function listCatalogueFacets(): Promise<CatalogueFacets> {
  return dependencies.repository.listFacets();
}

/** Slugs publiés pour le sitemap : non publiés, archivés et `SOLD` sont exclus (contrat §6). */
export async function listPublishedSlugs(): Promise<{ slug: string; publishedAt: Date | null }[]> {
  return dependencies.repository.listPublishedSlugs();
}

/** « Nouveautés » de la vitrine (défaut 6, max 12), `SOLD` exclu. */
export async function listFeaturedVehicles(
  actor: Actor,
  limit: number = DEFAULT_FEATURED_LIMIT,
): Promise<CatalogueCard[]> {
  const bounded = parseLimit(limit, DEFAULT_FEATURED_LIMIT, MAX_FEATURED_LIMIT, "Limite de nouveautés invalide.");
  const rows = await dependencies.repository.listFeatured(bounded);
  const now = new Date();
  const mediaConfig = defaultMediaConfig();

  return rows.map((row) => toCatalogueCard(row, actor, { now, mediaConfig }));
}

/**
 * Véhicules publics correspondant à des identifiants connus (lot 4, enrichissement des favoris dans
 * My Diaba Auto). Un id invalide est ignoré plutôt que de faire échouer tout l'appel — contrairement
 * aux filtres publics, ces identifiants ne viennent jamais directement d'une entrée utilisateur non
 * contrôlée (ils proviennent de `favorite_vehicles`, déjà des UUID valides).
 */
export async function listVehiclesByIds(actor: Actor, ids: string[]): Promise<CatalogueCard[]> {
  const validIds = [...new Set(ids.filter((id) => idField.safeParse(id).success))];
  if (validIds.length === 0) {
    return [];
  }

  const rows = await dependencies.repository.findByIds(validIds);
  const now = new Date();
  const mediaConfig = defaultMediaConfig();

  return rows.map((row) => toCatalogueCard(row, actor, { now, mediaConfig }));
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function pageCountOf(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}

function parseLimit(limit: number, fallback: number, max: number, message: string): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new AppError("VALIDATION", message);
  }

  return limit;
}

function idOf(value: string, message: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", message);
  }

  return result.data;
}