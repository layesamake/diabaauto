import Link from "next/link";
import { formatAmount, formatDateTime, orEmpty } from "@/components/admin/admin-view";
import {
  orderStatusLabel,
  staffOrdersFr as msg,
} from "@/lib/i18n/staff-orders.fr";
import type { OrderDetail, OrderStatus } from "@/services/order.service";

/**
 * Fiche commande (résumé et historique) — contrat lot 6 §5 et §6.
 *
 * Composant de présentation pur : il ne lit aucune donnée, ne valide rien et ne connaît ni Prisma ni
 * les permissions. Les prix convenus sont affichés tels que figés à la création (BR-105), jamais
 * recalculés. L'historique provient de `order_events` (transitions de la commande), distinct des
 * événements logistiques du véhicule rendus par `LogisticsPanel`.
 *
 * Les identifiants client et véhicule sont des projections du service : aucun nom n'est inventé. Un
 * lien vers la fiche correspondante n'est proposé que si l'acteur porte la permission de lecture
 * — ce n'est qu'une aide, la page cible applique sa propre garde.
 */

const STATUS_BADGE_CLASS: Readonly<Record<OrderStatus, string>> = {
  CONFIRMED: "bg-[#e8f4ff] text-[#0354A3]",
  PROCESSING: "bg-[#fdf6e6] text-[#7a5310]",
  IN_TRANSIT: "bg-[#fdf6e6] text-[#7a5310]",
  ARRIVED: "bg-[#effaf3] text-[#036b4b]",
  DELIVERED: "bg-[#effaf3] text-[#036b4b]",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export function OrderView({
  order,
  canViewCustomer,
  canViewVehicle,
}: {
  order: OrderDetail;
  canViewCustomer: boolean;
  canViewVehicle: boolean;
}) {
  return (
    <section aria-labelledby="order-summary" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="order-summary" className="text-lg font-semibold text-[#011D4F]">
        {msg.detail.summaryTitle}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{msg.detail.summaryIntro}</p>

      <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={msg.detail.fields.reference} value={order.reference} />
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{msg.detail.fields.status}</dt>
          <dd className="mt-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[order.status]}`}>
              {orderStatusLabel(order.status)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{msg.detail.fields.customer}</dt>
          <dd className="break-all font-medium text-[#071525]">
            {canViewCustomer ? (
              <Link
                href={`/admin/clients/${order.customerId}`}
                className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
              >
                {order.customerId}
              </Link>
            ) : (
              order.customerId
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{msg.detail.fields.vehicle}</dt>
          <dd className="break-all font-medium text-[#071525]">
            {canViewVehicle ? (
              <Link
                href={`/admin/vehicules/${order.vehicleId}`}
                className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
              >
                {order.vehicleId}
              </Link>
            ) : (
              order.vehicleId
            )}
          </dd>
        </div>
        <Fact label={msg.detail.fields.salesperson} value={orEmpty(order.salespersonId)} />
        <Fact label={msg.detail.fields.lead} value={orEmpty(order.leadId)} />
        <Fact label={msg.detail.fields.reservation} value={orEmpty(order.reservationId)} />
        <Fact
          label={msg.detail.fields.agreedVehiclePrice}
          value={formatAmount(order.agreedVehiclePrice, order.currency)}
        />
        <Fact
          label={msg.detail.fields.agreedTransportPrice}
          value={order.agreedTransportPrice === null ? "Non renseigné" : formatAmount(order.agreedTransportPrice, order.currency)}
        />
        <Fact label={msg.detail.fields.currency} value={order.currency} />
        <Fact label={msg.detail.fields.confirmedAt} value={formatDateTime(order.confirmedAt)} />
        <Fact label={msg.detail.fields.estimatedArrivalAt} value={formatDateTime(order.estimatedArrivalAt)} />
        <Fact label={msg.detail.fields.deliveredAt} value={formatDateTime(order.deliveredAt)} />
        <Fact label={msg.detail.fields.createdAt} value={formatDateTime(order.createdAt)} />
        <Fact label={msg.detail.fields.updatedAt} value={formatDateTime(order.updatedAt)} />
      </dl>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-base font-semibold text-[#011D4F]">{msg.detail.eventsTitle}</h3>
        <p className="mt-1 text-sm text-slate-600">{msg.detail.eventsIntro}</p>
        {order.events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{msg.detail.eventsEmpty}</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2">
            {order.events.map((event) => (
              <li key={event.id} className="rounded-lg border border-slate-100 bg-[#f4f7fb] px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-[#011D4F]">{orderStatusLabel(event.status)}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(event.occurredAt)}</span>
                </div>
                {event.note ? <p className="mt-1 text-slate-700">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/** Couple libellé / valeur de la fiche, en lecture seule. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words font-medium text-[#011D4F]">{value}</dd>
    </div>
  );
}
