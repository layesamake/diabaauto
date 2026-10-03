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
import { formatAmount, formatDate } from "@/components/admin/admin-view";
import {
  ORDER_TABS,
  ORDER_TAB_EMPTY,
  ORDER_TAB_LABELS,
  countOrdersByTab,
  filterOrdersByTab,
  nextStepOf,
  orderTabHref,
  parseOrderTab,
  type OrderTab,
} from "@/components/admin/order-list-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { orderStatusLabel, staffOrdersFr as msg } from "@/lib/i18n/staff-orders.fr";
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
import { resolveOrderLabels, type OrderLabels } from "@/services/order-labels.service";
import { listReservations, type ReservationView } from "@/services/reservation.service";

/**
 * Écran « Commandes » du back-office (contrat lot 6 §3, §4, §5 et §6).
 *
 * Garde serveur `order.view` ; en cas de refus, AUCUNE donnée n'est lue ni affichée. Les filtres sont
 * dans l'URL (partageables, aucun état client) : recherche sur la référence et onglet de phase
 * (`?etat=` : en cours par défaut, livrées, annulées, toutes) avec leurs effectifs. Les commandes
 * s'affichent avec le nom du client et le titre du véhicule, dans la limite des permissions de l'acteur.
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

function parseQuery(params: SearchParams): { filters: OrderFilters; tab: OrderTab; search: string } {
  const search = firstParam(params, "recherche").trim().slice(0, 60);
  const filters: OrderFilters = search.length > 0 ? { search } : {};

  return { filters, tab: parseOrderTab(firstParam(params, "etat")), search };
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
  const { filters, tab, search } = parseQuery(params);

  const listContent = await renderList(access.actor, filters, tab, search);
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

      {/* Les onglets sont dans le contenu de la liste : leurs effectifs viennent des données chargées. */}
      <form method="get" action="/admin/commandes" role="search" className="mt-8 flex flex-wrap items-end gap-3">
        {tab !== "en-cours" ? <input type="hidden" name="etat" value={tab} /> : null}
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor="filtre-recherche-commande" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.searchLabel}
          </label>
          <input
            id="filtre-recherche-commande"
            name="recherche"
            type="search"
            defaultValue={search}
            maxLength={60}
            placeholder={msg.filter.searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
        >
          {msg.filter.submit}
        </button>
        {search ? (
          <Link
            href={orderTabHref(tab, "")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
          >
            {msg.filter.reset}
          </Link>
        ) : null}
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
        <details className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-base font-semibold text-[#011D4F]">{msg.workspace.title}</summary>
          <form
            method="get"
            action="/admin/commandes"
            className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <div className="flex flex-col gap-1">
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
        </details>
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
  tab: OrderTab,
  search: string,
): Promise<React.ReactNode> {
  try {
    // La recherche s'applique avant les onglets : leurs effectifs décrivent tout ce qu'elle a trouvé.
    const all = await listOrders(actor, filters);
    const rows = filterOrdersByTab(all, tab);
    const counts = countOrdersByTab(all);
    const labels = await resolveOrderLabels(actor, rows);

    return (
      <>
        <nav aria-label="Filtrer les commandes" className="mb-5 flex flex-wrap gap-2">
          {ORDER_TABS.map((item) => {
            const active = item === tab;
            return (
              <Link
                key={item}
                href={orderTabHref(item, search)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm no-underline ${
                  active
                    ? "border-[#0063DF] bg-[#0063DF] font-semibold text-white"
                    : "border-slate-300 bg-white font-medium text-[#011D4F] hover:bg-[#f4f7fb]"
                }`}
              >
                {ORDER_TAB_LABELS[item]}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {counts[item]}
                </span>
              </Link>
            );
          })}
        </nav>
        <OrderTable rows={rows} labels={labels} tab={tab} search={search} />
      </>
    );
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

function OrderTable({
  rows,
  labels,
  tab,
  search,
}: {
  rows: OrderListItem[];
  labels: OrderLabels;
  tab: OrderTab;
  search: string;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          {search ? `Aucune commande ne correspond à « ${search} » dans cet onglet.` : ORDER_TAB_EMPTY[tab]}
        </p>
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
              <th scope="col" className="py-2 pr-3">Commande</th>
              <th scope="col" className="py-2 pr-3">{msg.table.customer}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.vehicle}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.status}</th>
              <th scope="col" className="py-2 pr-3">Prochaine étape</th>
              <th scope="col" className="py-2 pr-3">{msg.table.agreedVehiclePrice}</th>
              <th scope="col" className="py-2"><span className="sr-only">{msg.table.sheet}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const customer = labels.customers.get(row.customerId);
              const vehicle = labels.vehicles.get(row.vehicleId);
              const next = nextStepOf(row.status);
              const href = `/admin/commandes?commande=${encodeURIComponent(row.id)}`;

              return (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3">
                    <span className="block font-medium text-[#011D4F]">{row.reference}</span>
                    <span className="block text-xs text-slate-600">{formatDate(row.createdAt)}</span>
                  </td>
                  <td className="py-3 pr-3">{customer ?? <span className="text-slate-500">Non affiché</span>}</td>
                  <td className="py-3 pr-3">
                    {vehicle ? (
                      <>
                        <span className="block">{vehicle.title}</span>
                        <span className="block text-xs text-slate-600">{vehicle.reference}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">Non affiché</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[row.status]}`}>
                      {orderStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    {next ? (
                      <Link href={href} className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
                        {next.label}
                        <span className="sr-only"> — {row.reference}</span>
                      </Link>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">{formatAmount(row.agreedVehiclePrice, row.currency)}</td>
                  <td className="py-3">
                    <Link href={href} className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
                      Ouvrir
                      <span className="sr-only"> — {row.reference}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
