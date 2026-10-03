import {
  DOCUMENT_VISIBILITY_LABELS,
  LOGISTICS_LOCATION_LABELS,
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
 * Aperçu de fiche : ce que le client verrait une fois le véhicule publié.
 *
 * La galerie affiche les vraies vignettes, signées côté serveur par
 * `services/media-preview.service.ts` — et non la route publique `/api/media`, qui refuse les
 * fiches non publiées, c'est-à-dire justement celles que cet aperçu sert à vérifier.
 *
 * Une image sans vignette disponible (stockage non configuré, fichier absent) laisse place à un
 * repli lisible : jamais d'image cassée. Les données internes d'approvisionnement ne sont jamais
 * reprises ici.
 */
export function VehiclePreviewCard({
  vehicle,
  media,
  thumbnails,
  price,
  names,
}: {
  vehicle: VehicleDetail;
  media: MediaRow[];
  /** URL de vignette par identifiant de média (`resolveMediaThumbnails`). */
  thumbnails?: Map<string, string>;
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
        Rendu indicatif réservé au back-office : la mise en page du site public peut différer.
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
            <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map((item) => {
                const thumbnail = thumbnails?.get(item.id);

                return (
                  <li
                    key={item.id}
                    className={`overflow-hidden rounded-lg border bg-white ${
                      item.isPrimary ? "border-[#0063DF] ring-1 ring-[#0063DF]" : "border-slate-200"
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-slate-100">
                      {thumbnail ? (
                        // URL signée de courte durée : `next/image` ne sait pas la servir (domaine
                        // non déclaré, et son cache survivrait à l'expiration du lien).
                        <img
                          src={thumbnail}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-slate-500">
                          Aperçu indisponible
                        </div>
                      )}

                      {item.isPrimary ? (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-[#0063DF] px-2 py-0.5 text-[10px] font-bold text-white shadow">
                          Principale
                        </span>
                      ) : null}
                    </div>
                    <p className="px-2 py-1.5 text-[11px] text-slate-500">
                      {DOCUMENT_VISIBILITY_LABELS[item.visibility]}
                    </p>
                  </li>
                );
              })}
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

        </div>
      </div>
    </section>
  );
}
