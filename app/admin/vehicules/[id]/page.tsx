import type { Metadata } from "next";
import { AdminAccessDenied, AdminNotFound } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MediaPanel } from "@/components/admin/MediaPanel";
import { PricePanel } from "@/components/admin/PricePanel";
import { VehicleForm } from "@/components/admin/VehicleForm";
import { VehiclePreviewCard } from "@/components/admin/VehiclePreviewCard";
import { VehicleStatusPanel } from "@/components/admin/VehicleStatusPanel";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { loadVehicleReferentialOptions } from "@/app/admin/catalog-options";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { toPricingActor } from "@/services/identity.service";
import { resolveMediaThumbnails } from "@/services/media-preview.service";
import { listMedia } from "@/services/media.service";
import { listVehiclePrices, resolveVehiclePrice } from "@/services/pricing.service";
import { getVehicle } from "@/services/vehicle.service";

/**
 * Fiche d'administration d'un véhicule : édition, médias, prix, statut et APERÇU DE LA FICHE
 * (« fiche démo » du lot L2).
 *
 * Garde serveur `vehicle.view` ; en cas de refus, aucune donnée n'est lue ni affichée. Les commandes
 * d'écriture ne sont proposées qu'aux porteurs de la permission correspondante, mais la garde réelle
 * reste appliquée par chaque service.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Fiche véhicule — Back-office Diaba Auto",
  "Édition, médias, prix et aperçu de la fiche.",
);

export default async function AdminVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={vehicle.title}
        subtitle={`Référence ${vehicle.reference}`}
        current="vehicules"
        logout={<LogoutButton action={logoutAction} />}
      />

      <div className="mt-8 grid gap-6">
        <VehicleStatusPanel
          vehicleId={vehicle.id}
          commercialStatus={vehicle.commercialStatus}
          isPublished={vehicle.isPublished}
          permissions={permissions}
        />

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

        <MediaPanel vehicleId={vehicle.id} media={media} thumbnails={thumbnails} canEdit={canEdit} />

        <PricePanel vehicleId={vehicle.id} prices={prices} canEdit={canPrice} />

        <section aria-labelledby="vehicle-edit" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="vehicle-edit" className="text-lg font-semibold text-[#011D4F]">
            Caractéristiques du véhicule
          </h2>
          {canEdit ? (
            <div className="mt-4">
              <VehicleForm mode="edit" vehicle={vehicle} options={options} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Votre compte ne porte pas la permission d&apos;édition des véhicules : la fiche est affichée en lecture
              seule.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
