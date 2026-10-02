import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/profile/LogoutButton";
import {
  StaffAreaNotice,
  SuspendedAccountNotice,
} from "@/components/profile/ProfileNotices";
import { getCurrentActor } from "@/lib/auth/session";
import { formatAmount } from "@/lib/i18n";
import { ordersFr as msg } from "@/lib/i18n/orders.fr";
import type { Actor } from "@/services/identity.service";
import { listVehiclesByIds, type CatalogueCard } from "@/services/catalogue.service";
import { listOwnOrders, type OrderView } from "@/services/order.service";
import { logoutAction } from "../actions";

/**
 * My Diaba Auto — « Mes commandes » (contrat lot 6 §6).
 *
 * La liste des commandes du client connecté (référence, véhicule, statut, prix convenu, dates) est
 * lue par `listOwnOrders`, dont la garde `requireCustomer` fixe **toujours** la portée à l'acteur
 * résolu côté serveur : un client ne voit jamais la commande d'un autre (doc 14 §4). Aucune donnée
 * privée n'est rendue à un visiteur (redirection) ni à un membre du personnel.
 *
 * `force-dynamic` : le contenu dépend de la session, aucune version privée n'est générée ni mise en
 * cache partagé (dev.md §9).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes commandes — My Diaba Auto",
  description: "Suivi des commandes confirmées du client connecté et des prix convenus.",
  // Doc 18 — les espaces privés sont exclus de l'indexation. Le contrôle d'accès reste la garde réelle.
  robots: { index: false, follow: false, nocache: true },
};

export default async function MyOrdersPage() {
  const actor = await getCurrentActor();

  if (actor.kind === "visitor") {
    // Aucune donnée privée n'est rendue pour un visiteur : redirection vers la connexion.
    redirect("/connexion?suivant=%2Fmy-diaba-auto%2Fcommandes");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#011D4F]">{msg.page.title}</h1>
          <p className="mt-2 text-slate-600">{msg.page.subtitle}</p>
        </div>
        <LogoutButton action={logoutAction} />
      </div>

      <div className="mt-8 grid gap-6">
        {actor.kind === "suspended" ? <SuspendedAccountNotice /> : null}
        {actor.kind === "staff" ? <StaffAreaNotice /> : null}
        {actor.kind === "customer" ? <OrdersSection /> : null}
      </div>

      <Link
        href="/my-diaba-auto"
        className="mt-8 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
      >
        {msg.page.backToAccount}
      </Link>
    </main>
  );
}

/** Commande enrichie du titre catalogue du véhicule — ou `null` si le véhicule n'est plus public. */
type OrderListItem = {
  order: OrderView;
  vehicle: { title: string; slug: string } | null;
};

/**
 * Section des commandes : le service porte la garde et la portée ; une erreur de lecture n'affiche
 * aucune donnée et retombe sur un message neutre. L'enrichissement catalogue (titre du véhicule) est
 * un appel distinct, toléré en échec : la commande reste affichée même si son véhicule n'est plus au
 * catalogue public (`listVehiclesByIds` ne sert que les véhicules publiés).
 */
async function OrdersSection() {
  const actor = await getCurrentActor();

  let items: OrderListItem[];
  try {
    const orders = await listOwnOrders(actor);
    items = await attachVehicles(actor, orders);
  } catch {
    return <OrdersUnavailable />;
  }

  return <OrdersList items={items} />;
}

/** Assemble la liste avec le titre du véhicule ; un échec catalogue laisse `vehicle: null`. */
async function attachVehicles(actor: Actor, orders: OrderView[]): Promise<OrderListItem[]> {
  const vehicleIds = [...new Set(orders.map((order) => order.vehicleId))];

  let vehicleById = new Map<string, CatalogueCard>();
  try {
    const vehicles = await listVehiclesByIds(actor, vehicleIds);
    vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  } catch {
    vehicleById = new Map();
  }

  return orders.map((order) => {
    const vehicle = vehicleById.get(order.vehicleId);
    return {
      order,
      vehicle: vehicle ? { title: vehicle.title, slug: vehicle.slug } : null,
    };
  });
}

function OrdersUnavailable() {
  return (
    <section role="alert" className="rounded-xl border border-[#f3cfcb] bg-[#fdf1f1] p-5">
      <h2 className="text-lg font-semibold text-[#95312a]">{msg.list.unavailableTitle}</h2>
      <p className="mt-2 text-sm text-[#95312a]">{msg.list.unavailableBody}</p>
    </section>
  );
}

function OrdersList({ items }: { items: OrderListItem[] }) {
  if (items.length === 0) {
    return (
      <section aria-labelledby="mes-commandes" className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 id="mes-commandes" className="text-lg font-semibold text-[#011D4F]">
          {msg.list.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{msg.list.emptyBody}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="mes-commandes" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="mes-commandes" className="text-lg font-semibold text-[#011D4F]">
        {msg.list.title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{msg.list.count(items.length)}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.list.caption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.list.columns.reference}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.vehicle}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.status}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.price}</th>
              <th scope="col" className="py-2">{msg.list.columns.dates}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ order, vehicle }) => (
              <tr key={order.id} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3 font-medium break-all text-[#011D4F]">{order.reference}</td>
                <td className="py-3 pr-3 text-slate-700">
                  {vehicle ? (
                    <Link
                      href={`/voitures/${vehicle.slug}`}
                      className="font-medium text-[#0063DF] hover:text-[#0354A3]"
                    >
                      {vehicle.title}
                    </Link>
                  ) : (
                    <span className="text-slate-500">{msg.list.unknownVehicle}</span>
                  )}
                </td>
                <td className="py-3 pr-3 font-medium text-[#011D4F]">{msg.status[order.status]}</td>
                <td className="py-3 pr-3 text-slate-700">
                  {/* Prix figé à la création (BR-105) : jamais recalculé, jamais remplacé par un prix catalogue. */}
                  <p>{formatAmount(order.agreedVehiclePrice, order.currency)}</p>
                  {order.agreedTransportPrice ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {msg.list.priceTransport} : {formatAmount(order.agreedTransportPrice, order.currency)}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 text-slate-700">
                  <ul className="flex flex-col gap-0.5 text-xs">
                    <li>{msg.list.orderedOn(formatOrderDate(order.createdAt))}</li>
                    {order.estimatedArrivalAt ? (
                      <li>{msg.list.estimatedArrivalOn(formatOrderDate(order.estimatedArrivalAt))}</li>
                    ) : null}
                    {order.deliveredAt ? (
                      <li>{msg.list.deliveredOn(formatOrderDate(order.deliveredAt))}</li>
                    ) : null}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Date au format français long ; la valeur vient du service (jamais d'une saisie). */
function formatOrderDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}
