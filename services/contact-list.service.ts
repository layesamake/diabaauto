import { requireAuthenticated } from "@/services/access.service";
import { AppError } from "@/lib/errors";
import { hasPermission, type PermissionCode } from "@/services/permissions.service";
import { listCustomRequests, type CustomRequestView } from "@/services/custom-request.service";
import { toPermissionActor, type Actor } from "@/services/identity.service";
import { listLeads, type LeadView } from "@/services/lead.service";
import {
  listResellerApplications,
  type ResellerApplicationView,
} from "@/services/reseller-application.service";
import { listCustomers, type CustomerListItem } from "@/services/staff-customer.service";
import { leadMessages } from "@/lib/i18n/leads.fr";
import { staffRequestMessages } from "@/lib/i18n/staff-requests.fr";
import { resellerApplicationStatusLabel } from "@/lib/i18n/reseller.fr";
import { customerSegmentLabel } from "@/lib/i18n/staff-customers.fr";

/**
 * Liste unique des contacts du back-office.
 *
 * Prospects, demandes sur mesure, clients et demandes Revendeur sont les mêmes personnes à des
 * moments différents : le commercial n'a pas à savoir dans quelle table elles se trouvent. Ce module
 * les rassemble en lignes de même forme, triées pour que ce qui attend une réponse passe en premier.
 *
 * Il ne réécrit AUCUNE règle : chaque source est lue par son propre service, qui exige sa propre
 * permission. Un acteur qui ne peut pas lire une source ne la voit pas, sans que cela fasse échouer
 * les autres. Les actions (changer un statut, approuver un revendeur…) restent sur les écrans
 * existants, vers lesquels chaque ligne renvoie.
 *
 * Les règles « à traiter » sont celles de l'accueil (`admin-worklist.repository`) : la liste et le
 * compteur ne doivent jamais se contredire.
 */

export type ContactKind = "prospect" | "demande" | "client" | "revendeur";

export type ContactTab = "a-traiter" | "tous" | "prospects" | "demandes" | "clients" | "revendeurs";

export const CONTACT_TABS: readonly ContactTab[] = [
  "a-traiter",
  "tous",
  "prospects",
  "demandes",
  "clients",
  "revendeurs",
];

export type ContactRow = {
  /** Unique sur toute la liste : le genre préfixe l'identifiant d'origine. */
  key: string;
  kind: ContactKind;
  title: string;
  detail: string | null;
  statusLabel: string;
  /** Pourquoi cette ligne attend quelqu'un ; `null` si rien n'est à faire. */
  attention: string | null;
  /** Rang d'urgence (1 = le plus pressant) ; `null` quand `attention` l'est. */
  priority: number | null;
  date: Date;
  href: string;
  actionLabel: string;
};

export const CONTACT_KIND_LABELS: Readonly<Record<ContactKind, string>> = {
  prospect: "Prospect",
  demande: "Demande sur mesure",
  client: "Client",
  revendeur: "Revendeur",
};

/** Un prospect clos ne se relance pas (même liste que l'accueil). */
const OPEN_LEAD_STATUSES: readonly string[] = ["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATION"];

const DASH = " · ";

function joinDetail(parts: readonly (string | null | undefined)[]): string | null {
  const kept = parts.map((part) => part?.trim() ?? "").filter((part) => part.length > 0);
  return kept.length > 0 ? kept.join(DASH) : null;
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function leadToContact(lead: LeadView, now: Date): ContactRow {
  const followUpDue =
    lead.nextFollowUpAt !== null &&
    lead.nextFollowUpAt.getTime() <= now.getTime() &&
    OPEN_LEAD_STATUSES.includes(lead.status);
  const unassigned = lead.status === "NEW" && lead.assignedSalespersonId === null;

  let attention: string | null = null;
  let priority: number | null = null;
  if (followUpDue && lead.nextFollowUpAt) {
    attention = `À rappeler (relance du ${formatDay(lead.nextFollowUpAt)})`;
    priority = 2;
  } else if (unassigned) {
    attention = "Nouveau, personne ne le suit";
    priority = 3;
  }

  return {
    key: `prospect:${lead.id}`,
    kind: "prospect",
    title: lead.name,
    detail: joinDetail([lead.reference, lead.phone]),
    statusLabel: leadMessages.statusLabels[lead.status] ?? lead.status,
    attention,
    priority,
    date: lead.createdAt,
    href: `/admin/prospects/${lead.id}`,
    actionLabel: "Ouvrir",
  };
}

export function requestToContact(request: CustomRequestView): ContactRow {
  const { brand, model } = request.criteria;
  const received = request.status === "RECEIVED";

  return {
    key: `demande:${request.id}`,
    kind: "demande",
    title: joinDetail([brand, model]) ?? "Demande de véhicule",
    detail: request.criteria.notes ?? null,
    statusLabel: staffRequestMessages.statusLabels[request.status] ?? request.status,
    attention: received ? "Pas encore de réponse" : null,
    priority: received ? 1 : null,
    date: request.createdAt,
    href: `/admin/demandes?statut=${request.status}`,
    actionLabel: received ? "Répondre" : "Ouvrir",
  };
}

export function customerToContact(customer: CustomerListItem): ContactRow {
  return {
    key: `client:${customer.id}`,
    kind: "client",
    title: `${customer.firstName} ${customer.lastName}`.trim() || "Client",
    detail: joinDetail([customer.phone, customer.city, customerSegmentLabel(customer.segment)]),
    statusLabel: customer.pricingProfile === "RESELLER" ? "Revendeur approuvé" : "Client",
    attention: null,
    priority: null,
    date: customer.createdAt,
    href: `/admin/clients/${customer.id}`,
    actionLabel: "Ouvrir",
  };
}

export function applicationToContact(application: ResellerApplicationView): ContactRow {
  const pending = application.status === "PENDING";

  return {
    key: `revendeur:${application.id}`,
    kind: "revendeur",
    title: application.companyName,
    detail: joinDetail([application.businessType, application.estimatedVolume]),
    statusLabel: resellerApplicationStatusLabel(application.status),
    attention: pending ? "Décision attendue : le tarif revendeur ne s'applique pas encore" : null,
    priority: pending ? 4 : null,
    date: application.createdAt,
    href: `/admin/revendeurs?statut=${application.status}`,
    actionLabel: pending ? "Examiner" : "Ouvrir",
  };
}

/**
 * Ordre d'affichage : ce qui attend une réponse d'abord, le plus urgent puis le plus ancien ; le
 * reste ensuite, du plus récent au plus ancien. La clé départage deux dates identiques pour que
 * l'ordre soit stable d'un chargement à l'autre.
 */
export function sortContacts(rows: readonly ContactRow[]): ContactRow[] {
  return [...rows].sort((a, b) => {
    if (a.priority !== null && b.priority !== null) {
      return a.priority - b.priority || a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key);
    }
    if (a.priority !== null) return -1;
    if (b.priority !== null) return 1;

    return b.date.getTime() - a.date.getTime() || a.key.localeCompare(b.key);
  });
}

const TAB_KIND: Readonly<Record<Exclude<ContactTab, "a-traiter" | "tous">, ContactKind>> = {
  prospects: "prospect",
  demandes: "demande",
  clients: "client",
  revendeurs: "revendeur",
};

/** Lignes d'un onglet. « À traiter » = celles qui portent un motif d'attente. */
export function filterByTab(rows: readonly ContactRow[], tab: ContactTab): ContactRow[] {
  if (tab === "tous") return [...rows];
  if (tab === "a-traiter") return rows.filter((row) => row.attention !== null);

  return rows.filter((row) => row.kind === TAB_KIND[tab]);
}

export function countByTab(rows: readonly ContactRow[]): Record<ContactTab, number> {
  return Object.fromEntries(CONTACT_TABS.map((tab) => [tab, filterByTab(rows, tab).length])) as Record<
    ContactTab,
    number
  >;
}

export function isContactTab(value: unknown): value is ContactTab {
  return typeof value === "string" && (CONTACT_TABS as readonly string[]).includes(value);
}

/** Onglets que l'acteur peut réellement alimenter : un onglet vide par manque de droit n'est pas proposé. */
export function visibleTabs(kinds: readonly ContactKind[]): ContactTab[] {
  return CONTACT_TABS.filter(
    (tab) => tab === "a-traiter" || tab === "tous" || kinds.includes(TAB_KIND[tab]),
  );
}

function matches(row: ContactRow, search: string): boolean {
  const haystack = `${row.title} ${row.detail ?? ""}`.toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export type ContactList = {
  rows: ContactRow[];
  /** Genres que l'acteur a le droit de lire. */
  kinds: ContactKind[];
  counts: Record<ContactTab, number>;
};

/**
 * Rassemble les contacts que l'acteur peut lire.
 *
 * `search` est transmis aux sources qui savent chercher (prospects, clients) ; les demandes et les
 * demandes Revendeur, qui n'exposent ni coordonnées ni recherche, sont filtrées sur ce qui est affiché.
 * Les compteurs portent sur l'ensemble filtré par la recherche, avant le choix de l'onglet.
 */
export async function listContacts(
  actor: Actor,
  options: { tab?: ContactTab; search?: string } = {},
  now: Date = new Date(),
): Promise<ContactList> {
  const authenticated = requireAuthenticated(actor);
  if (authenticated.kind !== "staff") {
    throw new AppError("FORBIDDEN", "Accès refusé.");
  }
  const staff = authenticated;
  const search = options.search?.trim() ?? "";
  const can = (permission: PermissionCode) => hasPermission(toPermissionActor(staff), permission);

  const kinds: ContactKind[] = [];
  const tasks: Promise<ContactRow[]>[] = [];

  if (can("lead.view")) {
    kinds.push("prospect", "demande");
    tasks.push(
      listLeads(staff, search ? { search } : undefined).then((leads) =>
        leads.map((lead) => leadToContact(lead, now)),
      ),
      listCustomRequests(staff).then((requests) => {
        const rows = requests.map(requestToContact);
        return search ? rows.filter((row) => matches(row, search)) : rows;
      }),
    );
  }

  if (can("customer.view")) {
    kinds.push("client");
    tasks.push(
      listCustomers(staff, search ? { search } : undefined).then((customers) =>
        customers.map(customerToContact),
      ),
    );
  }

  if (can("reseller.view")) {
    kinds.push("revendeur");
    tasks.push(
      listResellerApplications(staff).then((applications) => {
        const rows = applications.map(applicationToContact);
        return search ? rows.filter((row) => matches(row, search)) : rows;
      }),
    );
  }

  // Aucune des trois permissions de lecture : l'écran n'a rien à montrer, et ne doit pas faire croire à une liste vide.
  if (kinds.length === 0) {
    throw new AppError("FORBIDDEN", "Accès refusé.");
  }

  const rows = sortContacts((await Promise.all(tasks)).flat());

  return {
    rows: filterByTab(rows, options.tab ?? "a-traiter"),
    kinds,
    counts: countByTab(rows),
  };
}
