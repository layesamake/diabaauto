import type { CatalogueFilters } from "@/services/catalogue.service";

/**
 * Sérialisation des filtres du catalogue dans l'URL (source unique côté serveur).
 *
 * Les valeurs par défaut du service (`sort = recent`, `availability = available`) ne sont pas écrites
 * afin de garder des URL stables. La pagination ajoute elle-même `page`.
 */
export function toCatalogueQueryString(filters: CatalogueFilters): string {
  const params = new URLSearchParams();

  const append = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) {
      params.set(key, trimmed);
    }
  };

  append("search", filters.search);
  append("brandId", filters.brandId);
  append("modelId", filters.modelId);
  append("bodyTypeId", filters.bodyTypeId);
  append("fuelTypeId", filters.fuelTypeId);
  append("transmissionTypeId", filters.transmissionTypeId);
  append("condition", filters.condition);
  append("logisticsLocation", filters.logisticsLocation);
  append("yearMin", filters.yearMin !== undefined ? String(filters.yearMin) : undefined);
  append("yearMax", filters.yearMax !== undefined ? String(filters.yearMax) : undefined);

  if (filters.availability === "all") {
    params.set("availability", "all");
  }

  if (filters.sort !== undefined && filters.sort !== "recent") {
    params.set("sort", filters.sort);
  }

  if (filters.pageSize !== undefined) {
    params.set("pageSize", String(filters.pageSize));
  }

  return params.toString();
}

/** Construit une URL de liste (catalogue ou page marque) en conservant les filtres actifs. */
export function buildListHref(basePath: string, query: string, page: number): string {
  const params = new URLSearchParams(query);

  if (page <= 1) {
    params.delete("page");
  } else {
    params.set("page", String(page));
  }

  const serialized = params.toString();

  return serialized === "" ? basePath : `${basePath}?${serialized}`;
}