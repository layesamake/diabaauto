"use client";

import { addLogisticsEventAction } from "@/app/admin/commandes/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField, AdminTextareaField, AdminTextField } from "@/components/admin/AdminFields";
import { formatDateTime, orEmpty, type SelectOption } from "@/components/admin/admin-view";
import {
  LOGISTICS_EVENT_TYPES,
  logisticsEventTypeLabel,
  staffOrdersFr as msg,
} from "@/lib/i18n/staff-orders.fr";
import type { LogisticsEventView } from "@/services/order.service";

/**
 * Panneau de suivi logistique du véhicule — contrat lot 6 §2.4, §5 et §6.
 *
 * Rend les événements `vehicle_logistics_events` du véhicule (distincts de `order_events`, qui
 * appartient à la commande) et propose l'ajout d'un événement. Le type est borné à la liste verbatim
 * du corpus (doc 03 §15) ; le créateur est l'acteur serveur, jamais une valeur du formulaire. La
 * permission `order.update` et la validité de la valeur sont revérifiées par
 * `services/order.service.ts` — ce panneau n'est qu'une aide.
 */

const EVENT_TYPE_OPTIONS: SelectOption[] = LOGISTICS_EVENT_TYPES.map((eventType) => ({
  value: eventType,
  label: logisticsEventTypeLabel(eventType),
}));

export function LogisticsPanel({
  vehicleId,
  events,
  canUpdate,
}: {
  vehicleId: string;
  events: LogisticsEventView[];
  canUpdate: boolean;
}) {
  return (
    <section aria-labelledby="order-logistics" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="order-logistics" className="text-lg font-semibold text-[#011D4F]">
        {msg.logistics.title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{msg.logistics.intro}</p>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{msg.logistics.empty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-slate-100 bg-[#f4f7fb] px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-[#011D4F]">{logisticsEventTypeLabel(event.eventType)}</span>
                <span className="text-xs text-slate-500">{formatDateTime(event.eventAt)}</span>
              </div>
              <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <div>
                  <dt className="inline">{msg.logistics.location} : </dt>
                  <dd className="inline">{orEmpty(event.location)}</dd>
                </div>
              </dl>
              {event.description ? <p className="mt-1 text-slate-700">{event.description}</p> : null}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-base font-semibold text-[#011D4F]">{msg.logistics.addTitle}</h3>
        {!canUpdate ? (
          <p className="mt-3 text-sm text-slate-600">{msg.logistics.readOnly}</p>
        ) : (
          <AdminForm
            action={addLogisticsEventAction}
            submitLabel={msg.logistics.submit}
            pendingLabel={msg.logistics.pending}
            fallbackError={msg.messages.genericError}
            resetOnSuccess
            className="mt-3 flex flex-col gap-3"
          >
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminSelectField
                id={`logistics-event-type-${vehicleId}`}
                name="eventType"
                label={msg.logistics.eventType}
                required
                options={EVENT_TYPE_OPTIONS}
              />
              <AdminTextField
                id={`logistics-event-at-${vehicleId}`}
                name="eventAt"
                type="date"
                label={msg.logistics.eventAt}
                hint={msg.logistics.eventAtHint}
              />
            </div>
            <AdminTextField
              id={`logistics-location-${vehicleId}`}
              name="location"
              label={msg.logistics.location}
              hint={msg.logistics.locationHint}
            />
            <AdminTextareaField
              id={`logistics-description-${vehicleId}`}
              name="description"
              label={msg.logistics.description}
              hint={msg.logistics.descriptionHint}
              rows={3}
            />
          </AdminForm>
        )}
      </div>
    </section>
  );
}
