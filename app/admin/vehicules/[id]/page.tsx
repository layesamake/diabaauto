import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied, AdminNotFound } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MediaPanel } from "@/components/admin/MediaPanel";
import { PricePanel } from "@/components/admin/PricePanel";
import { VehicleForm } from "@/components/admin/VehicleForm";
import { VehiclePreviewCard } from "@/components/admin/VehiclePreviewCard";
import { VehicleStatusPanel } from "@/components/admin/VehicleStatusPanel";
import { VehicleSteps } from "@/components/admin/VehicleSteps";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { loadVehicleReferentialOptions } from "@/app/admin/catalog-options";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { toPricingActor } from "@/services/identity.service";
import { MAX_IMAGES_PER_VEHICLE } from "@/lib/media-constants";
import { resolveMediaThumbnails } from "@/services/media-preview.service";
import {
  buildVehicleJourney,
  isVehicleStepKey,
  PUBLICATION_CONDITIONS,
  type VehicleStepKey,
} from "@/services/vehicle-journey.service";
import { listMedia } from "@/services/media.service";
import { listVehiclePrices, resolveVehiclePrice } from "@/services/pricing.service";
import { getVehicle } from "@/services/vehicle.service";

/**
 * Fiche d'administration d'un véhicule, en QUATRE ÉTAPES : informations, photos, prix, mise en ligne.
 *
 * Les cinq panneaux s'empilaient sur une même page, avec une quarantaine de champs : rien n'y disait
 * où l'on en était ni ce qui empêchait de publier. Une seule étape est désormais ouverte à la fois,
 * et l'état de chacune se lit d'un coup.
 *
 * L'étape courante vient de l'URL (`?etape=`) : le lien est partageable, le rendu reste côté
 * serveur, et l'accueil peut envoyer directement sur l'étape qui bloque. Une valeur inconnue retombe
 * sur l'étape calculée — la première inachevée.
 *
 * L'aperçu client reste visible en permanence : c'est la seule façon de voir l'effet d'une
 * modification sans quitter l'écran.
 *
 * Garde serveur `vehicle.view` ; en cas de refus, aucune donnée n'est lue ni affichée. Les commandes
 * d'écriture ne sont proposées qu'aux porteurs de la permission correspondante, mais la garde réelle
 * reste appliquée par chaque service.
 */
export const dynamic = "force-dynamic";

/**
 * Conditions de publication, rattachées à l'étape qui les règle.
 *
 * Les clés `gaps` sont exactement celles que renvoie `publicationGaps` : un libellé changé là-bas
 * sans l'être ici ferait afficher « rempli » sur une condition manquante, d'où le test qui lie les
 * deux listes (`tests/unit/vehicle-journey.service.test.ts`).
 */
/** Chemin de la liste : le même que celui des actions d'administration. */
const VEHICLE_LIST = "/admin/vehicules";

export const metadata: Metadata = createAdminMetadata(
  "Fiche véhicule — Back-office Diaba Auto",
  "Édition, médias, prix et aperçu de la fiche.",
);

export default async function AdminVehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await resolveAdminAccess("vehicle.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader permissions={[]} title="Fiche véhicule" subtitle="Accès réservé au personnel habilité." current="vehicules" />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const { id } = await params;
  const permissions = access.actor.permissions;
  const canEdit = permissions.includes("vehicle.edit");
  const canPrice = permissions.includes("vehicle.price_edit");

  let vehicle;
  try {
    vehicle = await getVehicle(access.actor, id);
  } catch {
    vehicle = undefined;
  }

  if (!vehicle) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader
          permissions={permissions}
          title="Fiche véhicule"
          subtitle="Édition, médias, prix et aperçu."
          current="vehicules"
          logout={<LogoutButton action={logoutAction} />}
        />
        <div className="mt-8">
          <AdminNotFound label="Véhicule introuvable" />
        </div>
      </main>
    );
  }

  const [media, prices, options] = await Promise.all([
    listMedia(access.actor, vehicle.id),
    listVehiclePrices(access.actor, vehicle.id),
    loadVehicleReferentialOptions(),
  ]);

  // Vignettes signées côté serveur : la route publique `/api/media` refuse les fiches non publiées,
  // or le back-office en affiche (brouillons, archives). Un seul appel au stockage pour toutes.
  const thumbnails = await resolveMediaThumbnails(access.actor, media);

  // Prix affiché par le service (aucune règle de prix n'est réimplémentée ici) : un membre du
  // personnel est traité comme un visiteur, donc il voit le prix Standard servi au public.
  const resolved = resolveVehiclePrice(
    { prices: prices.filter((price) => price.isActive) },
    toPricingActor(access.actor),
  );

  // Le parcours lit `publicationGaps` : l'écran ne redéfinit aucune condition de publication.
  const journey = buildVehicleJourney({
    vehicle,
    media,
    prices,
    imageCount: media.filter((item) => item.mediaType === "IMAGE").length,
    videoCount: media.filter((item) => item.mediaType === "VIDEO").length,
    maxImages: MAX_IMAGES_PER_VEHICLE,
  });

  const demandee = (await searchParams).etape;
  const step: VehicleStepKey = isVehicleStepKey(demandee) ? demandee : journey.defaultStep;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={vehicle.title}
        subtitle={`Référence ${vehicle.reference}`}
        current="vehicules"
        logout={<LogoutButton action={logoutAction} />}
      />

      <div className="mt-8 grid gap-6">
        <VehicleSteps steps={journey.steps} current={step} basePath={`${VEHICLE_LIST}/${vehicle.id}`} />

        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_480px] grid gap-6">
            {step === "informations" ? (
              <section aria-labelledby="vehicle-edit" className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 id="vehicle-edit" className="text-lg font-semibold text-[#011D4F]">
                  Informations du véhicule
                </h2>
                {canEdit ? (
                  <div className="mt-4">
                    <VehicleForm mode="edit" vehicle={vehicle} options={options} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Votre compte ne porte pas la permission d&apos;édition des véhicules : la fiche est
                    affichée en lecture seule.
                  </p>
                )}
              </section>
            ) : null}

            {step === "photos" ? (
              <MediaPanel vehicleId={vehicle.id} media={media} thumbnails={thumbnails} canEdit={canEdit} />
            ) : null}

            {step === "prix" ? (
              <PricePanel vehicleId={vehicle.id} prices={prices} canEdit={canPrice} />
            ) : null}

            {step === "mise-en-ligne" ? (
              <>
                <section
                  aria-labelledby="publication-conditions"
                  className={`rounded-xl border bg-white p-5 ${
                    journey.canPublish ? "border-[#BFE3CE]" : "border-[#F3D5A7]"
                  }`}
                >
                  <h2 id="publication-conditions" className="text-lg font-semibold text-[#011D4F]">
                    Conditions de publication
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Vérifiées par le serveur au moment de publier : cet écran les montre, il ne les
                    décide pas.
                  </p>

                  <ul className="mt-4 grid list-none gap-2.5 p-0">
                    {PUBLICATION_CONDITIONS.map((condition) => {
                      const manquant = journey.gaps.some((gap) => condition.gaps.includes(gap));

                      return (
                        <li key={condition.label} className="flex items-start gap-2.5 text-[15px]">
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 inline-flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full text-white ${
                              manquant ? "bg-[#8A5100]" : "bg-[#0F7B4F]"
                            }`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              {manquant ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M20 6 9 17l-5-5" />}
                            </svg>
                          </span>
                          <span className="text-[#011D4F]">
                            {condition.label}
                            <span className="sr-only">{manquant ? " — manquant" : " — rempli"}</span>
                            {manquant ? (
                              <>
                                {" "}
                                <Link href={`${VEHICLE_LIST}/${vehicle.id}?etape=${condition.step}`}>
                                  Compléter
                                </Link>
                              </>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <VehicleStatusPanel
                  vehicleId={vehicle.id}
                  commercialStatus={vehicle.commercialStatus}
                  isPublished={vehicle.isPublished}
                  permissions={permissions}
                />
              </>
            ) : null}
          </div>

          <div className="min-w-[280px] flex-[1_1_320px]">
            <VehiclePreviewCard
              vehicle={vehicle}
              media={media}
              thumbnails={thumbnails}
              price={resolved}
              names={{
                brands: options.brands,
                models: options.models,
                fuelTypes: options.fuelTypes,
                transmissionTypes: options.transmissionTypes,
                bodyTypes: options.bodyTypes,
                colors: options.colors,
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
