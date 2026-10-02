import type { CatalogueFilters } from "@/services/catalogue.service";

/**
 * Lecture stricte des critères du catalogue depuis l'URL.
 *
 * Le décodage appartient à la couche interface : seules les clés connues sont transmises au service,
 * et une valeur d'énumération inconnue est refusée (jamais ignorée en silence). Les bornes et la
 * validation fine (`UUID`, `yearMin ≤ yearMax`, pagination) restent celles de
 * `parseCatalogueFilters` (surface gelée du service).
 */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type CatalogueFiltersRead =
  | { status: "ok"; filters: CatalogueFilters }
  | { status: "invalid" };

const AVAILABILITY_VALUES = ["available", "all"] as const;
const SORT_VALUES = ["recent", "price_asc", "price_desc", "year_desc", "mileage_asc"] as const;
const CONDITION_VALUES = ["NEW", "USED"] as const;
const LOCATION_VALUES = ["CHINA", "IN_TRANSIT", "SENEGAL"] as const;

function readString(params: SearchParamsRecord, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();

  return trimmed ? trimmed : undefined;
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((item) => item === value);
}

/** Entier positif simple ; `"invalid"` signale une saisie malformée. */
function readInteger(params: SearchParamsRecord, key: string): number | "invalid" | undefined {
  const raw = readString(params, key);

  if (raw === undefined) {
    return undefined;
  }

  if (!/^\d{1,6}$/.test(raw)) {
    return "invalid";
  }

  return Number(raw);
}

export function readCatalogueFilters(params: SearchParamsRecord): CatalogueFiltersRead {
  const filters: CatalogueFilters = {};

  const search = readString(params, "search");
  if (search !== undefined) {
    filters.search = search;
  }

  const idKeys = [
    "brandId",
    "modelId",
    "bodyTypeId",
    "fuelTypeId",
    "transmissionTypeId",
  ] as const;

  for (const key of idKeys) {
    const value = readString(params, key);
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  const condition = readString(params, "condition");
  if (condition !== undefined) {
    if (!isOneOf(condition, CONDITION_VALUES)) {
      return { status: "invalid" };
    }
    filters.condition = condition;
  }

  const location = readString(params, "logisticsLocation");
  if (location !== undefined) {
    if (!isOneOf(location, LOCATION_VALUES)) {
      return { status: "invalid" };
    }
    filters.logisticsLocation = location;
  }

  const availability = readString(params, "availability");
  if (availability !== undefined) {
    if (!isOneOf(availability, AVAILABILITY_VALUES)) {
      return { status: "invalid" };
    }
    filters.availability = availability;
  }

  const sort = readString(params, "sort");
  if (sort !== undefined) {
    if (!isOneOf(sort, SORT_VALUES)) {
      return { status: "invalid" };
    }
    filters.sort = sort;
  }

  const yearMin = readInteger(params, "yearMin");
  if (yearMin === "invalid") {
    return { status: "invalid" };
  }
  if (yearMin !== undefined) {
    filters.yearMin = yearMin;
  }

  const yearMax = readInteger(params, "yearMax");
  if (yearMax === "invalid") {
    return { status: "invalid" };
  }
  if (yearMax !== undefined) {
    filters.yearMax = yearMax;
  }

  const page = readInteger(params, "page");
  if (page === "invalid") {
    return { status: "invalid" };
  }
  if (page !== undefined) {
    filters.page = page;
  }

  const pageSize = readInteger(params, "pageSize");
  if (pageSize === "invalid") {
    return { status: "invalid" };
  }
  if (pageSize !== undefined) {
    filters.pageSize = pageSize;
  }

  return { status: "ok", filters };
}