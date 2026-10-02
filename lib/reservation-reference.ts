import { AppError } from "@/lib/errors";

/**
 * Référence de réservation `RES-YYYY-NNNNNN` (contrat lot 6 §5, décision T43), calquée sur
 * `lib/vehicle-reference.ts` (`DBC-YYYY-NNNNNN`) et `lib/lead-reference.ts` (`LEAD-YYYY-NNNNNN`).
 *
 * Module partagé entre le service (validation, génération côté serveur) et le repository (lecture du
 * maximum existant) afin d'éviter tout import croisé entre les deux : la référence n'est **jamais**
 * générée par le navigateur.
 */

export const RESERVATION_REFERENCE_PATTERN = /^RES-\d{4}-\d{6}$/;
export const MAX_RESERVATION_SEQUENCE = 999_999;

export function isValidReservationReference(reference: string): boolean {
  return RESERVATION_REFERENCE_PATTERN.test(reference);
}

/** Formate `RES-YYYY-NNNNNN` ; refuse une année ou une séquence hors bornes. */
export function formatReservationReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new AppError("VALIDATION", "Année de référence invalide.");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_RESERVATION_SEQUENCE) {
    throw new AppError("CONFLICT", "Séquence de référence réservation épuisée.");
  }

  return `RES-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Numéro suivant de l'année : maximum existant + 1 (contrat §2.1), 1 si aucun. */
export function nextReservationSequence(year: number, existingReferences: Iterable<string>): number {
  const prefix = `RES-${year}-`;
  let max = 0;

  for (const reference of existingReferences) {
    if (!reference.startsWith(prefix)) continue;
    const suffix = Number.parseInt(reference.slice(prefix.length), 10);
    if (Number.isInteger(suffix) && suffix > max) {
      max = suffix;
    }
  }

  return max + 1;
}

/** Référence suivante complète, au format `RES-YYYY-NNNNNN`. */
export function nextReservationReference(year: number, existingReferences: Iterable<string>): string {
  return formatReservationReference(year, nextReservationSequence(year, existingReferences));
}
