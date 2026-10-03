import type { Metadata } from "next";
import { cache } from "react";
import { getCurrentActor } from "@/lib/auth/session";
import { buildCatalogueMetadata } from "@/lib/seo";
import { loadPublicData, parsePublicInput } from "@/components/public/public-data";
import { loadFavoriteState } from "@/components/public/favorite-state";
import {
  readCatalogueFilters,
  type SearchParamsRecord,
} from "@/components/public/catalogue-params";
import { toCatalogueQueryString } from "@/components/public/catalogue-query";
import { CatalogueFilterForm } from "@/components/public/CatalogueFilterForm";
import { CataloguePagination } from "@/components/public/CataloguePagination";
import { CatalogueLink, EmptyState } from "@/components/public/EmptyState";
import { DataUnavailable } from "@/components/public/DataUnavailable";
import { SaveSearchButton } from "@/components/public/SaveSearchButton";
import { VehicleGrid } from "@/components/public/VehicleGrid";
import { formatResultCount, fr } from "@/lib/i18n";
import {
  listCatalogue,
  listCatalogueFacets,
  parseCatalogueFilters,
  type CatalogueFilters,
} from "@/services/catalogue.service";

/**
 * Catalogue public (doc 05 §2, contrat §B.1).
 *
 * Les filtres et la pagination vivent dans l'URL et sont lus côté serveur ; le formulaire pousse une
 * nouvelle URL sans dupliquer d'état de données. La page est dynamique : aucun prix (potentiellement
 * revendeur) n'est pré-rendu ni mis en cache partagé.
 */
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<SearchParamsRecord> };

/** Facettes mises en cache pour la durée de la requête (une seule lecture). */
const loadFacets = cache(async () => loadPublicData(() => listCatalogueFacets()));

/**
 * Clé stable d'un jeu de filtres : `cache` compare ses arguments par identité, et `parseCatalogueFilters`
 * renvoie un objet neuf à chaque appel. Sans cette clé primitive, `generateMetadata` et la page
 * seraient considérés comme deux appels distincts et rejoueraient la requête.
 */
function filtersKey(filters: CatalogueFilters): string {
  return JSON.stringify(filters, Object.keys(filters).sort());
}

/**
 * Catalogue chargé une seule fois par requête HTTP.
 *
 * `generateMetadata` (pour le nombre de résultats) et la page (pour la grille) demandent exactement
 * la même liste : sans cette déduplication, chaque affichage exécutait deux fois le comptage et la
 * recherche paginée, soit deux requêtes SQL inutiles.
 */
const loadCatalogue = cache(async (key: string) => {
  const filters = JSON.parse(key) as CatalogueFilters;
  const actor = await getCurrentActor();
  return loadPublicData(() => listCatalogue(actor, filters));
});

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const read = readCatalogueFilters(params);
  const page = read.status === "ok" && read.filters.page !== undefined ? read.filters.page : 1;
  let total = 0;

  if (read.status === "ok") {
    const parsed = parsePublicInput(() => parseCatalogueFilters(read.filters));

    if (parsed.status === "ok") {
      const result = await loadCatalogue(filtersKey(parsed.value));

      if (result.status === "ok") {
        total = result.value.total;
      }
    }
  }

  return buildCatalogueMetadata({ page, brandName: null, total });
}

function CatalogueHeader() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold text-[#011D4F]">{fr.catalogue.title}</h1>
      <p className="max-w-3xl text-sm text-slate-600">{fr.catalogue.intro}</p>
    </header>
  );
}

export default async function CataloguePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const read = readCatalogueFilters(params);
  const parsed = read.status === "ok" ? parsePublicInput(() => parseCatalogueFilters(read.filters)) : null;

  if (parsed === null || parsed.status !== "ok") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <CatalogueHeader />
        <div className="mt-8">
          <DataUnavailable title={fr.common.invalidFiltersTitle} body={fr.common.invalidFiltersBody} />
        </div>
      </main>
    );
  }

  const filters: CatalogueFilters = parsed.value;
  const facets = await loadFacets();

  const actor = await getCurrentActor();
  const [catalogue, favoriteState] = await Promise.all([
    loadCatalogue(filtersKey(filters)),
    loadFavoriteState(actor),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CatalogueHeader />

      {facets.status === "ok" ? (
        <div className="mt-6 flex flex-col gap-4">
          <CatalogueFilterForm
            facets={facets.value}
            initial={filters}
            resultCount={catalogue.status === "ok" ? catalogue.value.total : undefined}
          />
          <div className="flex justify-end">
            <SaveSearchButton filters={filters} isAuthenticated={favoriteState.isAuthenticated} />
          </div>
        </div>
      ) : null}

      <section className="mt-8">
        {catalogue.status === "unavailable" ? (
          <DataUnavailable title={fr.common.unavailableTitle} body={fr.common.unavailableBody} />
        ) : catalogue.status === "invalid" ? (
          <DataUnavailable title={fr.common.invalidFiltersTitle} body={fr.common.invalidFiltersBody} />
        ) : catalogue.value.items.length === 0 ? (
          <EmptyState
            title={fr.catalogue.emptyTitle}
            body={fr.catalogue.emptyBody}
            action={<CatalogueLink label={fr.common.seeCatalogue} />}
          />
        ) : (
          <>
            <p className="mb-4 text-sm font-medium text-slate-600">
              {formatResultCount(catalogue.value.total)}
            </p>
            <VehicleGrid vehicles={catalogue.value.items} favoriteState={favoriteState} />
            <CataloguePagination
              basePath="/voitures"
              query={toCatalogueQueryString(filters)}
              page={catalogue.value.page}
              pageCount={catalogue.value.pageCount}
            />
          </>
        )}
      </section>
    </main>
  );
}