import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCurrentActor } from "@/lib/auth/session";
import { absoluteUrl, buildVehicleJsonLd, buildVehicleMetadata, jsonLdScriptProps } from "@/lib/seo";
import { loadPublicData } from "@/components/public/public-data";
import { loadFavoriteState } from "@/components/public/favorite-state";
import { DataUnavailable } from "@/components/public/DataUnavailable";
import { FavoriteButton } from "@/components/public/FavoriteButton";
import { PriceBlock } from "@/components/public/PriceBlock";
import { ShareButton } from "@/components/public/ShareButton";
import { StatusBadges, detailBadges } from "@/components/public/StatusBadges";
import { VehicleGallery } from "@/components/public/VehicleGallery";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { VehicleWhatsAppCta } from "@/components/public/VehicleWhatsAppCta";
import { VehicleGrid } from "@/components/public/VehicleGrid";
import { formatAmount, formatMileage, formatPublishedDate, fr } from "@/lib/i18n";
import {
  getCatalogueVehicle,
  listSimilarVehicles,
  type CatalogueDetail,
} from "@/services/catalogue.service";

/**
 * Fiche véhicule publique (doc 05 §3, contrat §B.1).
 *
 * Ordre imposé : galerie, titre + année + référence + badges, prix véhicule puis transport séparé,
 * CTA WhatsApp + partage, résumé technique, éligibilité import Sénégal, caractéristiques, rapport
 * d'inspection « disponible sur demande », véhicules similaires.
 *
 * Aucune donnée sensible : seuls les champs de `CatalogueDetail` sont affichés. Les médias publics
 * proviennent exclusivement de `resolvePublicMediaUrl` (côté service).
 */
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

/** Chargement mis en cache pour la requête : `generateMetadata` et la page ne lisent qu'une fois. */
const loadVehicle = cache(async (slug: string) => {
  const actor = await getCurrentActor();
  return loadPublicData(() => getCatalogueVehicle(actor, slug));
});

/** Prix public affiché (STANDARD uniquement) : sert aux métadonnées et au JSON-LD. */
function publicPriceLabel(vehicle: CatalogueDetail): string | null {
  if (!vehicle.price || vehicle.price.priceType !== "STANDARD") {
    return null;
  }

  return formatAmount(vehicle.price.amount, vehicle.price.currency);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadVehicle(slug);

  if (loaded.status !== "ok" || loaded.value === null) {
    return {};
  }

  const vehicle = loaded.value;

  return buildVehicleMetadata({
    title: vehicle.title,
    year: vehicle.year,
    description: vehicle.description,
    slug: vehicle.slug,
    imageUrl: vehicle.primaryImage?.url ?? null,
    standardPriceLabel: publicPriceLabel(vehicle),
    isSold: vehicle.commercialStatus === "SOLD",
  });
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-sm font-medium text-[#011D4F]">{value}</dd>
    </div>
  );
}

export default async function VehiclePage({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadVehicle(slug);

  if (loaded.status !== "ok") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <DataUnavailable title={fr.common.unavailableTitle} body={fr.common.unavailableBody} />
      </main>
    );
  }

  if (loaded.value === null) {
    notFound();
  }

  const vehicle = loaded.value;
  const priceLabel = publicPriceLabel(vehicle);
  const canonical = absoluteUrl(`/voitures/${vehicle.slug}`);

  const imageUrls = vehicle.media
    .filter((media) => media.mediaType === "IMAGE")
    .map((media) => media.url);

  const jsonLd = buildVehicleJsonLd({
    title: vehicle.title,
    brandName: vehicle.brandName,
    modelName: vehicle.modelName,
    year: vehicle.year,
    slug: vehicle.slug,
    description: vehicle.description,
    imageUrls,
    priceLabel,
    currency: vehicle.price?.currency ?? null,
    mileage: vehicle.mileage,
    condition: vehicle.condition,
  });

  const similarInput = { id: vehicle.id, brandId: vehicle.brandId, modelId: vehicle.modelId };
  const actor = await getCurrentActor();
  const [similar, favoriteState] = await Promise.all([
    loadPublicData(() => listSimilarVehicles(actor, similarInput, 4)),
    loadFavoriteState(actor),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <TrackOnMount
        event="vehicle_view"
        params={{ vehicle_reference: vehicle.reference, location: vehicle.logisticsLocation }}
      />
      <script {...jsonLdScriptProps(jsonLd)} />

      <nav aria-label={fr.common.backToCatalogue} className="mb-4 text-sm">
        <Link href="/voitures" className="text-[#0063DF]">
          {fr.common.backToCatalogue}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <VehicleGallery items={vehicle.media} title={vehicle.title} />

        <div className="flex flex-col gap-5">
          <StatusBadges badges={detailBadges(vehicle)} />

          <h1 className="text-2xl font-bold text-[#011D4F] md:text-3xl">{vehicle.title}</h1>

          <p className="text-sm text-slate-600">
            {vehicle.brandName} · {vehicle.modelName} · {fr.common.year} {vehicle.year}
          </p>

          <p className="text-sm text-slate-600">
            {fr.common.reference} : <span className="font-medium text-[#011D4F]">{vehicle.reference}</span>
          </p>

          {vehicle.publishedAt ? (
            <p className="text-xs text-slate-500">
              {fr.vehicle.publishedOn(formatPublishedDate(vehicle.publishedAt))}
            </p>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <PriceBlock price={vehicle.price} />
          </div>

          <div className="flex flex-col gap-3">
            <VehicleWhatsAppCta
              title={vehicle.title}
              reference={vehicle.reference}
              slug={vehicle.slug}
              priceLabel={priceLabel}
            />
            <div className="flex flex-wrap gap-3">
              <FavoriteButton
                vehicleId={vehicle.id}
                isAuthenticated={favoriteState.isAuthenticated}
                initialIsFavorite={favoriteState.favoriteVehicleIds.has(vehicle.id)}
              />
              <ShareButton url={canonical} title={vehicle.title} />
            </div>
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold text-[#011D4F]">{fr.vehicle.summaryTitle}</h2>
        <dl className="mt-4">
          <SummaryRow label={fr.catalogue.brandLabel} value={vehicle.brandName} />
          <SummaryRow label={fr.catalogue.modelLabel} value={vehicle.modelName} />
          <SummaryRow label={fr.common.year} value={String(vehicle.year)} />
          <SummaryRow label={fr.catalogue.conditionLabel} value={fr.labels.condition[vehicle.condition]} />
          {vehicle.mileage !== null ? (
            <SummaryRow label={fr.common.mileage} value={formatMileage(vehicle.mileage)} />
          ) : null}
          <SummaryRow label={fr.catalogue.bodyLabel} value={vehicle.bodyTypeName} />
          <SummaryRow label={fr.catalogue.fuelLabel} value={vehicle.fuelTypeName} />
          <SummaryRow label={fr.catalogue.transmissionLabel} value={vehicle.transmissionTypeName} />
          <SummaryRow
            label={fr.catalogue.locationLabel}
            value={fr.labels.logisticsLocation[vehicle.logisticsLocation]}
          />
        </dl>

        {vehicle.description ? (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-[#011D4F]">{fr.vehicle.descriptionTitle}</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{vehicle.description}</p>
          </div>
        ) : null}
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold text-[#011D4F]">{fr.vehicle.eligibilityTitle}</h2>
        <p className="mt-3 text-sm text-slate-600">
          {fr.labels.eligibilityStatus[vehicle.eligibilityStatus]}
        </p>
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold text-[#011D4F]">{fr.vehicle.specsTitle}</h2>
        {vehicle.specs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{fr.vehicle.specsEmpty}</p>
        ) : (
          <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {vehicle.specs.map((spec) => (
              <SummaryRow key={`${spec.label}-${spec.value}`} label={spec.label} value={spec.value} />
            ))}
          </dl>
        )}
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold text-[#011D4F]">{fr.vehicle.inspectionTitle}</h2>
        {vehicle.inspectionOnRequest ? (
          <p className="mt-3 text-sm text-slate-600">{fr.vehicle.inspectionBody}</p>
        ) : null}
      </section>

      {similar.status === "ok" && similar.value.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-[#011D4F]">{fr.vehicle.similarTitle}</h2>
          <div className="mt-6">
            <VehicleGrid vehicles={similar.value} favoriteState={favoriteState} />
          </div>
        </section>
      ) : null}
    </main>
  );
}