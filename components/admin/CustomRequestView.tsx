import type { CustomRequestStatus } from "@/services/custom-request.service";

/**
 * Descripteurs d'écran des demandes sur mesure (lot 5 §4-§5).
 *
 * Ce module n'importe du service que des TYPES (`import type`, effacés à la compilation) : il est sûr
 * côté serveur comme côté client. `RequestStatus` est hors corpus (écart E28) : les valeurs sont
 * reprises telles quelles, aucune n'est inventée.
 */

/** Statuts d'une demande sur mesure, tels que conservés au lot 5 (E28). */
export const CUSTOM_REQUEST_STATUSES: readonly CustomRequestStatus[] = [
  "RECEIVED",
  "QUALIFIED",
  "SEARCHING",
  "PROPOSED",
  "CLOSED",
  "ABANDONED",
];

export function isCustomRequestStatus(value: unknown): value is CustomRequestStatus {
  return typeof value === "string" && (CUSTOM_REQUEST_STATUSES as readonly string[]).includes(value);
}
