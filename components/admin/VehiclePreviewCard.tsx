import {
  DOCUMENT_VISIBILITY_LABELS,
  LOGISTICS_LOCATION_LABELS,
  MEDIA_TYPE_LABELS,
  VEHICLE_CONDITION_LABELS,
  formatDate,
  labelFor,
  orEmpty,
  type SelectOption,
} from "@/components/admin/admin-view";
import type { MediaRow } from "@/services/media.service";
import type { ResolvedPrice } from "@/services/pricing.service";
import type { VehicleDetail } from "@/services/vehicle.service";

/**
 * Aperçu de fiche (« fiche démo » du lot L2) : ce que le client verrait une fois le véhicule publié.
 *
 * Aucun identifiant Supabase n'étant configuré (D15), aucun fichier n'est réellement servi : la
 * galerie affiche les références de stockage enregistrées, et non des images chargées. Les données
 * internes d'approvisionnement ne sont jamais reprises ici.
 */
export function VehiclePreviewCard({
  vehicle,
  media,
  price,
  names,
}: {
  vehicle: VehicleDetail;
  media: MediaRow[];
  price: ResolvedPrice | null;
  names: {
    brands: SelectOption[];
    models: SelectOption[];
    fuelTypes: SelectOption[];
    transmissionTypes: SelectOption[];
    bodyTypes: SelectOption[];
    colors: SelectOption[];
  };
}) {
  const label = (options: SelectOption[], id: string | null): string =>
    options.find((option) => option.value === id)?.label ?? orEmpty(null);

  const gallery = media
    .filter((item) => item.mediaType === "IMAGE" && item.visibility === "PUBLIC")
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.displayOrder - right.displayOrder);
  const primary = gallery.find((item) => item.isPrimary) ?? null;
  const videos = media.filter((item) => item.mediaType === "VIDEO" && item.visibility === "PUBLIC");

  const specs: { label: string; value: string }[] = [
    { label: "Référence", value: vehicle.reference },
    { label: "Marque", value: label(names.brands, vehicle.brandId) },
    { label: "Modèle", value: label(names.models, vehicle.modelId) },
    { label: "Année", value: String(vehicle.year) },
    { label: "État", value: labelFor(VEHICLE_CONDITION_LABELS, vehicle.condition) },
    { label: "Kilométrage", value: vehicle.mileage === null ? orEmpty(null) : `${vehicle.mileage} km` },
    { label: "Énergie", value: label(names.fuelTypes, vehicle.fuelTypeId) },
    { label: "Boîte de vitesses", value: label(names.transmissionTypes, vehicle.transmissionTypeId) },
    { label: "Carrosserie", value: label(names.bodyTypes, vehicle.bodyTypeId) },
    { label: "Couleur extérieure", value: label(names.colors, vehicle.exteriorColorId) },
    { label: "Localisation", value: labelFor(LOGISTICS_LOCATION_LABELS, vehicle.logisticsLocation) },
    {
      label: "Première mise en circulation",
      value: vehicle.firstRegistrationDate ? formatDate(vehicle.firstRegistrationDate) : orEmpty(null),
    },
  ];

  return (
    <section aria-labelledby="vehicle-preview" className="rounded-xl border border-[#b8ddff] bg-[#f7fbff] p-5">
      <h2 id="vehicle-preview" className="text-lg font-semibold text-[#0354A3]">
        Aperçu de la fiche
      </h2>
      <p className="mt-2 text-sm text-[#0354A3]">
        Rendu indicatif réservé au back-office : aucun fichier média n&apos;est servi tant qu&apos;aucun stockage
        n&apos;est configuré.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xl font-bold text-[#011D4F]">{vehicle.title}</h3>
          <p className="mt-1 text-sm text-slate-600">Référence {vehicle.reference}</p>
          <p className="mt-3 text-base font-semibold text-[#011D4F]">
            {price ? `${price.amount} ${price.currency}` : "Prix non défini"}
          </p>
          {vehicle.description ? (
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{vehicle.description}</p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Aucune description enregistrée.</p>
          )}

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {specs.map((spec) => (
              <div key={spec.label}>
                <dt className="text-slate-500">{spec.label}</dt>
                <dd className="text-[#071525]">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[#011D4F]">Galerie</h3>
          {gallery.length > 0 ? (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {gallery.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border p-3 text-xs ${
                    item.isPrimary ? "border-[#0063DF] bg-white" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className="font-semibold text-[#011D4F]">
                    {MEDIA_TYPE_LABELS[item.mediaType]}
                    {item.isPrimary ? " — principale" : ""}
                  </p>
                  <p className="mt-1 break-all text-slate-600">{orEmpty(item.storagePath)}</p>
                  <p className="mt-1 text-slate-500">{DOCUMENT_VISIBILITY_LABELS[item.visibility]}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Aucune image publique : la fiche ne peut pas être publiée en l&apos;état.
            </p>
          )}

          {videos.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-[#011D4F]">Vidéos</h3>
              <ul className="mt-2 grid gap-2 text-xs">
                {videos.map((item) => (
                  <li key={item.id} className="break-all">
                    <a
                      href={item.externalUrl ?? "#"}
                      className="text-[#0063DF] underline hover:text-[#0354A3]"
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {orEmpty(item.externalUrl)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {primary ? (
            <p className="mt-4 text-xs text-slate-500">
              Image principale enregistrée : <span className="break-all">{orEmpty(primary.storagePath)}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
