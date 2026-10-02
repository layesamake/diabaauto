import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { absoluteUrl, buildCatalogueMetadata } from "@/lib/seo";
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
import { VehicleGrid } from "@/components/public/VehicleGrid";
import { formatResultCount, fr } from "@/lib/i18n";
import {
  listCatalogue,
  listCatalogueFacets,
  parseCatalogueFilters,
  type CatalogueFilters,
} from "@/services/catalogue.service";

/**
 * Page marque (contrat §B.1) : en-tête marque + catalogue filtré sur la marque, en réutilisant les
 * composants du catalogue. La marque est résolue par son slug via les facettes du service.
 */
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ brand: string }>;
  searchParams: Promise<SearchParamsRecord>;
};

const loadFacets = cache(async () => loadPublicData(() => listCatalogueFacets()));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brand } = await params;
  const facets = await loadFacets();
  const name =
    facets.status === "ok"
      ? (facets.value.brands.find((item) => item.slug === brand)?.name ?? brand)
      : brand;

  const metadata = buildCatalogueMetadata({ page: 1, brandName: name, total: 0 });

  return {
    ...metadata,
    alternates: { canonical: absoluteUrl(`/marque/${encodeURIComponent(brand)}`) },
  };
}

export default async function BrandPage({ params, searchParams }: PageProps) {
  const { brand } = await params;
  const search = await searchParams;

  const facets = await loadFacets();

  if (facets.status !== "ok") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <DataUnavailable title={fr.common.unavailableTitle} body={fr.common.unavailableBody} />
      </main>
    );
  }

  const matched = facets.value.brands.find((item) => item.slug === brand);

  if (!matched) {
    notFound();
  }

  const read = readCatalogueFilters(search);
  const parsed =
    read.status === "ok"
      ? parsePublicInput(() => parseCatalogueFilters({ ...read.filters, brandId: matched.id }))
      : null;

  if (parsed === null || parsed.status !== "ok") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-[#011D4F]">{fr.brand.catalogueTitle(matched.name)}</h1>
          <p className="text-sm text-slate-600">{fr.brand.intro(matched.name)}</p>
        </header>
        <div className="mt-8">
          <DataUnavailable title={fr.common.invalidFiltersTitle} body={fr.common.invalidFiltersBody} />
        </div>
      </main>
    );
  }

  const filters: CatalogueFilters = parsed.value;
  const brandModels = facets.value.models.filter((model) => model.brandId === matched.id);

  const catalogue = await loadPublicData(async () => {
    const actor = await getCurrentActor();
    return listCatalogue(actor, filters);
  });
  const favoriteState = await loadFavoriteState(await getCurrentActor());

  const formInitial: CatalogueFilters = { ...filters, brandId: undefined };
  const basePath = `/marque/${encodeURIComponent(brand)}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-[#011D4F]">{fr.brand.catalogueTitle(matched.name)}</h1>
        <p className="text-sm text-slate-600">{fr.brand.intro(matched.name)}</p>
      </header>

      <div className="mt-6">
        <CatalogueFilterForm
          facets={{ ...facets.value, brands: [], models: brandModels }}
          initial={formInitial}
          basePath={basePath}
          idPrefix="marque"
          hideBrand
        />
      </div>

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
              basePath={basePath}
              query={toCatalogueQueryString(formInitial)}
              page={catalogue.value.page}
              pageCount={catalogue.value.pageCount}
            />
          </>
        )}
      </section>
    </main>
  );
}