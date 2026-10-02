"use client";

import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField, AdminTextField } from "@/components/admin/AdminFields";
import {
  PRICE_TYPES,
  PRICE_TYPE_LABELS,
  PRICING_PROFILES,
  PRICING_PROFILE_LABELS,
  EMPTY_LABEL,
  formatDate,
  type SelectOption,
} from "@/components/admin/admin-view";
import { setVehiclePriceAction } from "@/app/admin/actions";
import type { VehiclePriceRow } from "@/services/pricing.service";

/**
 * Panneau prix d'un véhicule (doc 03 §9, contrat L2 §2.3).
 *
 * Le back-office saisit des lignes `vehicle_prices` ; il n'applique ni règle Standard/Revendeur
 * complète, ni transport, ni change (lot L3). Le service valide et trace `vehicle.price.change`.
 */

const PROFILE_OPTIONS: SelectOption[] = PRICING_PROFILES.map((profile) => ({
  value: profile,
  label: PRICING_PROFILE_LABELS[profile],
}));
const PRICE_TYPE_OPTIONS: SelectOption[] = PRICE_TYPES.map((type) => ({
  value: type,
  label: PRICE_TYPE_LABELS[type],
}));

export function PricePanel({
  vehicleId,
  prices,
  canEdit,
}: {
  vehicleId: string;
  prices: VehiclePriceRow[];
  canEdit: boolean;
}) {
  return (
    <section aria-labelledby="price-panel" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="price-panel" className="text-lg font-semibold text-[#011D4F]">
        Prix
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {prices.length > 0
          ? `${prices.length} ligne(s) de prix enregistrée(s).`
          : "Aucun prix enregistré. La publication exige un prix actif Standard."}
      </p>

      {canEdit ? (
        <AdminForm
          action={setVehiclePriceAction}
          submitLabel="Enregistrer le prix"
          pendingLabel="Enregistrement…"
          resetOnSuccess
          className="mt-4 flex flex-col gap-4 border-t border-slate-200 pt-4"
        >
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminSelectField
              id="price-profile"
              name="pricingProfile"
              label="Profil de prix"
              required
              defaultValue="STANDARD"
              options={PROFILE_OPTIONS}
            />
            <AdminSelectField
              id="price-type"
              name="priceType"
              label="Type de prix"
              defaultValue="REGULAR"
              options={PRICE_TYPE_OPTIONS}
            />
            <AdminTextField
              id="price-base"
              name="baseAmount"
              label="Montant de base"
              required
              hint="Chiffres uniquement, point décimal, sans séparateur de milliers."
            />
            <AdminTextField
              id="price-transport"
              name="transportAmount"
              label="Montant du transport (facultatif)"
              hint="Le calcul de transport reste au lot L3."
            />
            <AdminTextField
              id="price-currency"
              name="currency"
              label="Devise"
              required
              defaultValue="XOF"
              hint="Trois lettres, ex. XOF."
            />
            <AdminTextField id="price-valid-from" name="validFrom" label="Valide du" type="date" />
            <AdminTextField id="price-valid-to" name="validTo" label="Valide au" type="date" />
          </div>
        </AdminForm>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          Votre compte ne porte pas la permission de modification des prix : les lignes sont affichées en lecture seule.
        </p>
      )}

      {prices.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Lignes de prix du véhicule</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-3">Profil</th>
                <th scope="col" className="py-2 pr-3">Type</th>
                <th scope="col" className="py-2 pr-3">Montant de base</th>
                <th scope="col" className="py-2 pr-3">Transport</th>
                <th scope="col" className="py-2 pr-3">Validité</th>
                <th scope="col" className="py-2">Actif</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((price, index) => (
                <tr key={`${price.pricingProfile}-${price.priceType}-${price.validFrom?.toString() ?? index}`} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{PRICING_PROFILE_LABELS[price.pricingProfile]}</td>
                  <td className="py-2 pr-3">{PRICE_TYPE_LABELS[price.priceType]}</td>
                  <td className="py-2 pr-3">
                    {price.baseAmount} {price.currency}
                  </td>
                  <td className="py-2 pr-3">{price.transportAmount ? `${price.transportAmount} ${price.currency}` : EMPTY_LABEL}</td>
                  <td className="py-2 pr-3">
                    {price.validFrom || price.validTo
                      ? `${formatDate(price.validFrom)} → ${formatDate(price.validTo)}`
                      : "Sans limite"}
                  </td>
                  <td className="py-2">{price.isActive ? "Oui" : "Non"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
