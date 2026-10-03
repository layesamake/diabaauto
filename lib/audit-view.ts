import type { AuditAction } from "@/services/audit.service";

/**
 * Vocabulaire du journal d'activité : libellés, familles d'actions, périodes et lecture des
 * changements. Module pur, sans accès aux données : le service et la page s'y réfèrent.
 *
 * Un libellé inconnu retombe toujours sur un texte neutre, jamais sur une supposition : le journal
 * est une pièce de contrôle, il ne doit rien embellir.
 */

export const ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  "staff.role.assign": "Rôle attribué à un membre du personnel",
  "staff.role.revoke": "Rôle retiré à un membre du personnel",
  "staff.activate": "Compte du personnel activé",
  "staff.deactivate": "Compte du personnel désactivé",
  "account.status.change": "Statut d'un compte modifié",
  "reseller.status.change": "Demande Revendeur traitée",
  "vehicle.price.change": "Prix d'un véhicule modifié",
  "vehicle.publish": "Véhicule publié",
  "vehicle.withdraw": "Véhicule retiré du catalogue",
  "vehicle.reserve": "Véhicule réservé",
  "vehicle.sell": "Véhicule vendu",
  "order.status.change": "Statut d'une commande modifié",
  "settings.change": "Paramètre modifié",
  "content.change": "Page du site modifiée",
};

export function actionLabel(action: string): string {
  return (ACTION_LABELS as Readonly<Record<string, string>>)[action] ?? "Action inconnue";
}

export type AuditCategory = "personnel" | "revendeurs" | "vehicules" | "commandes" | "parametres";

export const AUDIT_CATEGORIES: readonly AuditCategory[] = [
  "personnel",
  "revendeurs",
  "vehicules",
  "commandes",
  "parametres",
];

export const AUDIT_CATEGORY_LABELS: Readonly<Record<AuditCategory, string>> = {
  personnel: "Équipe",
  revendeurs: "Revendeurs",
  vehicules: "Véhicules",
  commandes: "Commandes",
  parametres: "Paramètres",
};

/** Chaque action appartient à exactement une famille ; un test le vérifie dans les deux sens. */
export const ACTIONS_BY_CATEGORY: Readonly<Record<AuditCategory, readonly AuditAction[]>> = {
  personnel: ["staff.role.assign", "staff.role.revoke", "staff.activate", "staff.deactivate", "account.status.change"],
  revendeurs: ["reseller.status.change"],
  vehicules: ["vehicle.price.change", "vehicle.publish", "vehicle.withdraw", "vehicle.reserve", "vehicle.sell"],
  commandes: ["order.status.change"],
  parametres: ["settings.change", "content.change"],
};

export function categoryOfAction(action: string): AuditCategory | null {
  return AUDIT_CATEGORIES.find((category) => (ACTIONS_BY_CATEGORY[category] as readonly string[]).includes(action)) ?? null;
}

/** `null` pour « Tout » : aucune restriction d'action. */
export type AuditCategoryFilter = AuditCategory | "tout";

export function parseAuditCategory(value: unknown): AuditCategoryFilter {
  return typeof value === "string" && (AUDIT_CATEGORIES as readonly string[]).includes(value)
    ? (value as AuditCategory)
    : "tout";
}

export type AuditPeriod = "7j" | "30j" | "tout";

export const AUDIT_PERIODS: readonly AuditPeriod[] = ["7j", "30j", "tout"];

export const AUDIT_PERIOD_LABELS: Readonly<Record<AuditPeriod, string>> = {
  "7j": "7 derniers jours",
  "30j": "30 derniers jours",
  tout: "Tout l'historique",
};

/** Par défaut : 30 jours — assez pour un contrôle courant, sans charger tout l'historique. */
export function parseAuditPeriod(value: unknown): AuditPeriod {
  return typeof value === "string" && (AUDIT_PERIODS as readonly string[]).includes(value)
    ? (value as AuditPeriod)
    : "30j";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Début de la période, ou `null` pour tout l'historique. Calculé sur l'instant fourni (UTC). */
export function periodStart(period: AuditPeriod, now: Date): Date | null {
  if (period === "tout") return null;
  return new Date(now.getTime() - (period === "7j" ? 7 : 30) * DAY_MS);
}

export function auditHref(category: AuditCategoryFilter, period: AuditPeriod, page?: number): string {
  const query = new URLSearchParams();
  if (category !== "tout") query.set("famille", category);
  if (period !== "30j") query.set("periode", period);
  if (page && page > 1) query.set("page", String(page));
  const rendered = query.toString();

  return rendered ? `/admin/audit?${rendered}` : "/admin/audit";
}

/**
 * Écran qui permet de retrouver l'objet d'une entrée, quand il existe. `null` quand aucun écran ne
 * l'affiche (réservation, ligne de prix) : on ne fabrique jamais un lien qui mènerait à un refus.
 */
export function entityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  const id = encodeURIComponent(entityId);

  switch (entityType) {
    case "Vehicle":
      return `/admin/vehicules/${id}`;
    case "Order":
      return `/admin/commandes?commande=${id}`;
    case "CustomerProfile":
      return `/admin/clients/${id}`;
    case "SitePage":
      return `/admin/contenus/${id}`;
    default:
      return null;
  }
}

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  Vehicle: "Véhicule",
  VehiclePrice: "Prix de véhicule",
  Order: "Commande",
  SitePage: "Page du site",
  Reservation: "Réservation",
  ResellerApplication: "Demande Revendeur",
  CustomerProfile: "Client",
  staff_profile: "Membre du personnel",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export type AuditChange = { field: string; before: string | null; after: string | null };

function show(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Ce qui a changé, champ par champ. `reason` n'en fait pas partie : le motif s'affiche à part, il
 * est ce que l'on cherche en premier. Seuls les champs qui diffèrent sont listés.
 */
export function describeChanges(oldValues: unknown, newValues: unknown): AuditChange[] {
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  const before = asRecord(oldValues);
  const after = asRecord(newValues);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => field !== "reason");

  return fields
    .map((field) => ({ field, before: show(before[field]), after: show(after[field]) }))
    .filter((change) => change.before !== change.after);
}

/** Motif saisi lors d'une transition sensible : replié dans `new_values.reason` à l'écriture. */
export function reasonOf(newValues: unknown): string | null {
  if (newValues && typeof newValues === "object" && !Array.isArray(newValues)) {
    const reason = (newValues as Record<string, unknown>).reason;
    return typeof reason === "string" && reason.trim() ? reason : null;
  }

  return null;
}
