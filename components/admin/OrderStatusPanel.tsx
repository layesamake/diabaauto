"use client";

import { updateOrderStatusAction } from "@/app/admin/commandes/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField, AdminTextField } from "@/components/admin/AdminFields";
import { type SelectOption } from "@/components/admin/admin-view";
import { orderStatusLabel, staffOrdersFr as msg } from "@/lib/i18n/staff-orders.fr";
import type { OrderStatus } from "@/services/order.service";

/**
 * Panneau de transition de statut d'une commande — contrat lot 6 §3.3 et §4.
 *
 * Les cibles proposées proviennent de `orderTransitions()` (machine à états, doc 09 §7), calculées
 * côté serveur et transmises ici : ce composant n'affiche que des cibles autorisées et n'importe
 * aucune logique serveur. Le service revérifie la transition et la permission `order.update` —
 * masquer une transition ne protège rien.
 *
 * Le panneau ne touche jamais aux prix convenus (BR-105) : la transition ne transmet que le statut,
 * une note facultative et une arrivée estimée facultative.
 */
export function OrderStatusPanel({
  orderId,
  currentStatus,
  transitions,
  canUpdate,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  transitions: readonly OrderStatus[];
  canUpdate: boolean;
}) {
  const options: SelectOption[] = transitions.map((status) => ({
    value: status,
    label: orderStatusLabel(status),
  }));

  return (
    <section aria-labelledby="order-status" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="order-status" className="text-lg font-semibold text-[#011D4F]">
        {msg.status.title}
      </h2>
      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">{msg.status.current}</dt>
          <dd className="font-medium text-[#011D4F]">{orderStatusLabel(currentStatus)}</dd>
        </div>
      </dl>

      {!canUpdate ? (
        <p className="mt-4 text-sm text-slate-600">{msg.status.readOnly}</p>
      ) : options.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{msg.status.terminal}</p>
      ) : (
        <AdminForm
          action={updateOrderStatusAction}
          submitLabel={msg.status.submit}
          pendingLabel={msg.status.pending}
          fallbackError={msg.messages.genericError}
          className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminSelectField
              id={`order-status-next-${orderId}`}
              name="status"
              label={msg.status.newStatus}
              required
              options={options}
            />
            <AdminTextField
              id={`order-status-arrival-${orderId}`}
              name="estimatedArrivalAt"
              type="date"
              label={msg.status.estimatedArrivalAt}
              hint={msg.status.estimatedArrivalHint}
            />
          </div>
          <AdminTextField
            id={`order-status-note-${orderId}`}
            name="note"
            label={msg.status.note}
            hint={msg.status.noteHint}
          />
          <p className="text-xs text-slate-600">{msg.status.historyHint}</p>
        </AdminForm>
      )}
    </section>
  );
}
