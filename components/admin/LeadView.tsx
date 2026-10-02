import type { LeadActivityType, LeadStatus } from "@/services/lead.service";

/**
 * Descripteurs d'écran des prospects (lot 5 §4-§5).
 *
 * Ce module ne contient AUCUNE règle métier et n'importe des services que des TYPES (`import type`,
 * effacés à la compilation) : il est sûr côté serveur comme côté client. Il nomme les valeurs
 * d'énumération du schéma gelé — aucune valeur inventée — pour que les formulaires ne puissent pas
 * rendre une valeur que les services refuseraient, et inversement.
 */

/** Statuts d'un prospect, dans l'ordre de la machine à états (doc 09 §4). */
export const LEAD_STATUSES: readonly LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "NEGOTIATION",
  "ORDER_CONFIRMED",
  "LOST",
  "COMPLETED",
];

/** Types d'activité que le personnel peut saisir ; `STATUS_CHANGE` est produit par le service. */
export const LEAD_MANUAL_ACTIVITY_TYPES: readonly LeadActivityType[] = [
  "CALL",
  "WHATSAPP",
  "EMAIL",
  "MEETING",
];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadActivityType(value: unknown): value is LeadActivityType {
  return (
    typeof value === "string" &&
    (["CALL", "WHATSAPP", "EMAIL", "MEETING", "STATUS_CHANGE"] as readonly string[]).includes(value)
  );
}

/** Vrai uniquement pour un type saisissable manuellement (jamais `STATUS_CHANGE`). */
export function isManualLeadActivityType(value: unknown): value is LeadActivityType {
  return typeof value === "string" && (LEAD_MANUAL_ACTIVITY_TYPES as readonly string[]).includes(value);
}
