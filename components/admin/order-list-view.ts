import { orderStatusLabel } from "@/lib/i18n/staff-orders.fr";
import { orderTransitions, type OrderStatus } from "@/services/transitions.service";

/**
 * Onglets de la liste des commandes : le vocabulaire de l'URL et de l'écran, rien d'autre.
 *
 * Une commande est « en cours » tant qu'elle n'est ni livrée ni annulée : c'est ce que le commercial
 * suit au quotidien. Les phases sont dérivées du statut — aucune règle métier n'est ajoutée ; la
 * machine à états reste celle de `transitions.service`.
 */

export type OrderTab = "en-cours" | "livrees" | "annulees" | "toutes";

export const ORDER_TABS: readonly OrderTab[] = ["en-cours", "livrees", "annulees", "toutes"];

export const ORDER_TAB_LABELS: Readonly<Record<OrderTab, string>> = {
  "en-cours": "En cours",
  livrees: "Livrées",
  annulees: "Annulées",
  toutes: "Toutes",
};

export const ORDER_TAB_EMPTY: Readonly<Record<OrderTab, string>> = {
  "en-cours": "Aucune commande en cours.",
  livrees: "Aucune commande livrée.",
  annulees: "Aucune commande annulée.",
  toutes: "Aucune commande enregistrée.",
};

export function parseOrderTab(value: unknown): OrderTab {
  return typeof value === "string" && (ORDER_TABS as readonly string[]).includes(value)
    ? (value as OrderTab)
    : "en-cours";
}

export function tabOfStatus(status: OrderStatus): Exclude<OrderTab, "toutes"> {
  if (status === "DELIVERED") return "livrees";
  if (status === "CANCELLED") return "annulees";
  return "en-cours";
}

export function filterOrdersByTab<T extends { status: OrderStatus }>(rows: readonly T[], tab: OrderTab): T[] {
  return tab === "toutes" ? [...rows] : rows.filter((row) => tabOfStatus(row.status) === tab);
}

export function countOrdersByTab(rows: readonly { status: OrderStatus }[]): Record<OrderTab, number> {
  return {
    "en-cours": filterOrdersByTab(rows, "en-cours").length,
    livrees: filterOrdersByTab(rows, "livrees").length,
    annulees: filterOrdersByTab(rows, "annulees").length,
    toutes: rows.length,
  };
}

/**
 * Prochaine étape normale d'une commande, dite avec le nom du statut visé : « Passer en transit ».
 * L'annulation n'est jamais « la suite » ; une commande terminée n'en a pas (`null`).
 */
export function nextStepOf(status: OrderStatus): { to: OrderStatus; label: string } | null {
  const to = orderTransitions(status).find((target) => target !== "CANCELLED");
  return to ? { to, label: `Passer en « ${orderStatusLabel(to).toLowerCase()} »` } : null;
}

/** Lien d'un onglet, en gardant la recherche. L'onglet par défaut (« En cours ») donne l'adresse nue. */
export function orderTabHref(tab: OrderTab, search: string): string {
  const query = new URLSearchParams();
  if (tab !== "en-cours") query.set("etat", tab);
  if (search) query.set("recherche", search);
  const rendered = query.toString();

  return rendered ? `/admin/commandes?${rendered}` : "/admin/commandes";
}
