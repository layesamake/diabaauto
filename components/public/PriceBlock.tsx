import type { CataloguePrice } from "@/services/catalogue.service";
import { formatAmount, fr } from "@/lib/i18n";

/**
 * Bloc prix de la fiche véhicule (contrat §3.3 et §3.4, BR-006).
 *
 * - le prix du véhicule et le transport sont deux lignes distinctes ;
 * - le total n'est affiché que si le service fournit les deux montants (`total !== null`), et il est
 *   libellé « total indicatif » ;
 * - aucun prix n'est recalculé ici et aucun prix revendeur n'est présenté comme un prix public.
 */
export function PriceBlock({ price }: { price: CataloguePrice | null }) {
  if (!price) {
    return (
      <p className="text-2xl font-semibold text-[#011D4F]">{fr.common.priceOnRequest}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-slate-600">{fr.vehicle.priceVehicle}</dt>
          <dd className="text-xl font-semibold text-[#011D4F]">
            {formatAmount(price.amount, price.currency)}
          </dd>
        </div>

        {price.transportAmount !== null ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-slate-600">{fr.vehicle.priceTransport}</dt>
            <dd className="text-base font-medium text-[#011D4F]">
              {formatAmount(price.transportAmount, price.currency)}
            </dd>
          </div>
        ) : null}

        {price.total !== null ? (
          <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2">
            <dt className="text-sm font-medium text-slate-700">{fr.vehicle.priceTotal}</dt>
            <dd className="text-base font-semibold text-[#011D4F]">
              {formatAmount(price.total, price.currency)}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="text-xs text-slate-500">{fr.vehicle.priceNote}</p>

      {price.priceType === "RESELLER" ? (
        <p className="text-sm font-semibold text-[#0354A3]">{fr.labels.priceType.RESELLER}</p>
      ) : null}
    </div>
  );
}