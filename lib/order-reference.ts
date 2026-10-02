import { AppError } from "@/lib/errors";

/**
 * Référence commande `CMD-YYYY-NNNNNN` (contrat lot 6 §5, décision T44, calquée sur
 * `lib/vehicle-reference.ts` / `DBC-YYYY-NNNNNN` et `lib/lead-reference.ts` / `LEAD-YYYY-NNNNNN`).
 *
 * Module partagé entre le service (validation, génération côté serveur) et le repository (lecture du
 * maximum existant) afin d'éviter tout import croisé entre les deux. L'unicité reste garantie par la
 * contrainte de base (`orders.reference`), pas seulement par le service.
 */

export const ORDER_REFERENCE_PATTERN = /^CMD-\d{4}-\d{6}$/;
export const MAX_ORDER_SEQUENCE = 999_999;

export function isValidOrderReference(reference: string): boolean {
  return ORDER_REFERENCE_PATTERN.test(reference);
}

/** Formate `CMD-YYYY-NNNNNN` ; refuse une année ou une séquence hors bornes. */
export function formatOrderReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new AppError("VALIDATION", "Année de référence invalide.");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_ORDER_SEQUENCE) {
    throw new AppError("CONFLICT", "Séquence de référence commande épuisée.");
  }

  return `CMD-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Numéro suivant de l'année : maximum existant + 1, 1 si aucun. */
export function nextOrderSequence(year: number, existingReferences: Iterable<string>): number {
  const prefix = `CMD-${year}-`;
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

/** Référence suivante complète, au format `CMD-YYYY-NNNNNN`. */
export function nextOrderReference(year: number, existingReferences: Iterable<string>): string {
  return formatOrderReference(year, nextOrderSequence(year, existingReferences));
}
