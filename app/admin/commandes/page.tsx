import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LogisticsPanel } from "@/components/admin/LogisticsPanel";
import { OrderCreateForm } from "@/components/admin/OrderCreateForm";
import { OrderStatusPanel } from "@/components/admin/OrderStatusPanel";
import { OrderView } from "@/components/admin/OrderView";
import { ReservationPanel } from "@/components/admin/ReservationPanel";
import { formatAmount, formatDateTime } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import {
  ORDER_STATUSES,
  orderStatusLabel,
  staffOrdersFr as msg,
} from "@/lib/i18n/staff-orders.fr";
import {
  listLogisticsEvents,
  listOrders,
  orderTransitions,
  readOrder,
  type LogisticsEventView,
  type OrderDetail,
  type OrderFilters,
  type OrderListItem,
  type OrderStatus,
} from "@/services/order.service";
import { listReservations, type ReservationView } from "@/services/reservation.service";

/**
 * Écran « Commandes » du back-office (contrat lot 6 §3, §4, §5 et §6).
 *
 * Garde serveur `order.view` ; en cas de refus, AUCUNE donnée n'est lue ni affichée. Les filtres sont
 * passés en GET (partageables, aucun état client) : recherche libre sur la référence et statut.
 *
 * L'écran porte :
 * - la **liste** des commandes (`listOrders`) ;
 * - la **fiche** d'une commande sélectionnée par `?commande=<id>` (`readOrder`) : prix convenus,
 *   historique `order_events`, transitions autorisées et suivi logistique du véhicule ;
 * - la **création** d'une commande (vente, `order.create`) ;
 * - les **réservations** du véhicule, atteignables depuis la fiche ou via `?vehicule=<id>`
 *   (créer/confirmer/annuler/expirer, acompte externe — `vehicle.reserve`).
 *
 * Les actions d'écriture ne sont proposées qu'aux porteurs de la permission correspondante, mais ce
 * n'est qu'une aide : chaque service revérifie statut de compte, permission et machine à états.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Commandes — Back-office Diaba Auto",
  "Réservations, commandes, transitions et suivi logistique.",
);

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_BADGE_CLASS: Readonly<Record<OrderStatus, string>> = {
  CONFIRMED: "bg-[#e8f4ff] text-[#0354A3]",
  PROCESSING: "bg-[#fdf6e6] text-[#7a5310]",
  IN_TRANSIT: "bg-[#fdf6e6] text-[#7a5310]",
  ARRIVED: "bg-[#effaf3] text-[#036b4b]",
  DELIVERED: "bg-[#effaf3] text-[#036b4b]",
  CANCELLED: "bg-slate-100 text-slate-600",
};

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseFilters(params: SearchParams): OrderFilters {
  const filters: OrderFilters = {};

  const search = firstParam(params, "recherche").trim();
  if (search.length > 0) {
    filters.search = search;
  }

  const statusRaw = firstParam(params, "statut");
  const status = ORDER_STATUSES.find((value) => value === statusRaw);
  if (status) {
    filters.status = status;
  }

  return filters;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("order.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title={msg.listTitle}
          subtitle={msg.accessDeniedSubtitle}
          current="commandes"
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const permissions = access.actor.permissions;
  const canCreate = permissions.includes("order.create");
  const canUpdate = permissions.includes("order.update");
  const canReserve = permissions.includes("vehicle.reserve");
  const canViewCustomer = permissions.includes("customer.view");
  const canViewVehicle = permissions.includes("vehicle.view");
  const params = await searchParams;
  const filters = parseFilters(params);

  const listContent = await renderList(access.actor, filters);
  const fiche = await renderFiche(access.actor, firstParam(params, "commande").trim(), {
    canUpdate,
    canReserve,
    canViewCustomer,
    canViewVehicle,
  });
  const workspace = await renderWorkspace(access.actor, firstParam(params, "vehicule").trim(), canReserve);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={msg.listTitle}
        subtitle={msg.listSubtitle}
        current="commandes"
        logout={<LogoutButton action={logoutAction} />}
      />

      <form
        method="get"
        action="/admin/commandes"
        className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="filtre-recherche-commande" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.searchLabel}
          </label>
          <input
            id="filtre-recherche-commande"
            name="recherche"
            type="search"
            defaultValue={firstParam(params, "recherche")}
            placeholder={msg.filter.searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-statut-commande" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.statusLabel}
          </label>
          <select
            id="filtre-statut-commande"
            name="statut"
            defaultValue={firstParam(params, "statut")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">{msg.filter.allStatuses}</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 sm:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            {msg.filter.submit}
          </button>
          <Link
            href="/admin/commandes"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
          >
            {msg.filter.reset}
          </Link>
        </div>
      </form>

      {canCreate ? (
        <details className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-base font-semibold text-[#011D4F]">
            {msg.create.title}
          </summary>
          <p className="mt-2 text-sm text-slate-600">{msg.create.intro}</p>
          <div className="mt-4">
            <OrderCreateForm />
          </div>
        </details>
      ) : null}

      {workspace === null && canReserve ? (
        <form
          method="get"
          action="/admin/commandes"
          className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-[#011D4F]">{msg.workspace.title}</h2>
            <p className="text-sm text-slate-600">{msg.workspace.intro}</p>
            <label htmlFor="workspace-vehicule" className="mt-2 text-sm font-medium text-[#011D4F]">
              {msg.workspace.vehicleId}
            </label>
            <input
              id="workspace-vehicule"
              name="vehicule"
              type="text"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
          >
            {msg.workspace.submit}
          </button>
        </form>
      ) : null}

      {workspace}

      {fiche}

      <div className="mt-8">{listContent}</div>
    </main>
  );
}

/** Liste des commandes ; toute erreur de données donne un message neutre, jamais une donnée partielle. */
async function renderList(
  actor: Parameters<typeof listOrders>[0],
  filters: OrderFilters,
): Promise<React.ReactNode> {
  try {
    const rows = await listOrders(actor, filters);
    return <OrderTable rows={rows} />;
  } catch {
    return (
      <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.listTitle}</h2>
        <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.listBody}</p>
      </section>
    );
  }
}

/** Fiche commande (`?commande=<id>`) : résumé, transitions, suivi logistique et réservations. */
async function renderFiche(
  actor: Parameters<typeof readOrder>[0],
  orderId: string,
  flags: {
    canUpdate: boolean;
    canReserve: boolean;
    canViewCustomer: boolean;
    canViewVehicle: boolean;
  },
): Promise<React.ReactNode> {
  if (orderId.length === 0) {
    return null;
  }

  let order: OrderDetail | undefined;
  try {
    order = await readOrder(actor, orderId);
  } catch {
    order = undefined;
  }

  if (!order) {
    return (
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-[#011D4F]">{msg.detail.notFoundTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">{msg.detail.notFoundBody}</p>
        <Link
          href="/admin/commandes"
          className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
        >
          {msg.detail.backToList}
        </Link>
      </section>
    );
  }

  let logistics: LogisticsEventView[] = [];
  let logisticsError = false;
  try {
    logistics = await listLogisticsEvents(actor, order.vehicleId);
  } catch {
    logisticsError = true;
  }

  let reservations: ReservationView[] = [];
  let reservationsError = false;
  try {
    reservations = await listReservations(actor, { vehicleId: order.vehicleId });
  } catch {
    reservationsError = true;
  }

  return (
    <div className="mt-8 grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-[#011D4F]">{msg.detail.subtitle(order.reference)}</h2>
        <Link
          href="/admin/commandes"
          className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
        >
          {msg.detail.backToList}
        </Link>
      </div>

      <OrderView order={order} canViewCustomer={flags.canViewCustomer} canViewVehicle={flags.canViewVehicle} />

      <OrderStatusPanel
        orderId={order.id}
        currentStatus={order.status}
        transitions={orderTransitions(order.status)}
        canUpdate={flags.canUpdate}
      />

      {logisticsError ? (
        <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.logisticsTitle}</h2>
          <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.logisticsBody}</p>
        </section>
      ) : (
        <LogisticsPanel vehicleId={order.vehicleId} events={logistics} canUpdate={flags.canUpdate} />
      )}

      {reservationsError ? (
        <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.reservationsTitle}</h2>
          <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.reservationsBody}</p>
        </section>
      ) : (
        <ReservationPanel
          vehicleId={order.vehicleId}
          defaultCustomerId={order.customerId}
          reservations={reservations}
          canReserve={flags.canReserve}
        />
      )}
    </div>
  );
}

/** Espace « réservations d'un véhicule » (`?vehicule=<id>`), accessible avant toute commande. */
async function renderWorkspace(
  actor: Parameters<typeof listReservations>[0],
  vehicleId: string,
  canReserve: boolean,
): Promise<React.ReactNode> {
  if (vehicleId.length === 0) {
    return null;
  }

  let reservations: ReservationView[] = [];
  let error = false;
  try {
    reservations = await listReservations(actor, { vehicleId });
  } catch {
    error = true;
  }

  return (
    <div className="mt-8 grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-[#011D4F]">{msg.workspace.title}</h2>
        <Link
          href="/admin/commandes"
          className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
        >
          {msg.detail.backToList}
        </Link>
      </div>
      {error ? (
        <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.reservationsTitle}</h2>
          <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.reservationsBody}</p>
        </section>
      ) : (
        <ReservationPanel
          vehicleId={vehicleId}
          defaultCustomerId=""
          reservations={reservations}
          canReserve={canReserve}
        />
      )}
    </div>
  );
}

function OrderTable({ rows }: { rows: OrderListItem[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{msg.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{msg.countLabel(rows.length)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.tableCaption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.table.reference}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.customer}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.vehicle}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.status}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.agreedVehiclePrice}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.createdAt}</th>
              <th scope="col" className="py-2">{msg.table.sheet}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium text-[#011D4F]">{row.reference}</td>
                <td className="py-2 pr-3 break-all">{row.customerId}</td>
                <td className="py-2 pr-3 break-all">{row.vehicleId}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[row.status]}`}>
                    {orderStatusLabel(row.status)}
                  </span>
                </td>
                <td className="py-2 pr-3">{formatAmount(row.agreedVehiclePrice, row.currency)}</td>
                <td className="py-2 pr-3">{formatDateTime(row.createdAt)}</td>
                <td className="py-2">
                  <Link
                    href={`/admin/commandes?commande=${encodeURIComponent(row.id)}`}
                    className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
                  >
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
