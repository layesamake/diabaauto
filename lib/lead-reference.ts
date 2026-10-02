import { AppError } from "@/lib/errors";

/**
 * Référence prospect `LEAD-YYYY-NNNNNN` (contrat lot 5 §2.1, décision T41, calquée sur
 * `lib/vehicle-reference.ts` / `DBC-YYYY-NNNNNN`).
 *
 * Module partagé entre le service (validation, génération côté serveur) et le repository (lecture du
 * maximum existant) afin d'éviter tout import croisé entre les deux.
 */

export const LEAD_REFERENCE_PATTERN = /^LEAD-\d{4}-\d{6}$/;
export const MAX_LEAD_SEQUENCE = 999_999;

export function isValidLeadReference(reference: string): boolean {
  return LEAD_REFERENCE_PATTERN.test(reference);
}

/** Formate `LEAD-YYYY-NNNNNN` ; refuse une année ou une séquence hors bornes. */
export function formatLeadReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new AppError("VALIDATION", "Année de référence invalide.");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_LEAD_SEQUENCE) {
    throw new AppError("CONFLICT", "Séquence de référence prospect épuisée.");
  }

  return `LEAD-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Numéro suivant de l'année : maximum existant + 1 (contrat §2.1), 1 si aucun. */
export function nextLeadSequence(year: number, existingReferences: Iterable<string>): number {
  const prefix = `LEAD-${year}-`;
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

/** Référence suivante complète, au format `LEAD-YYYY-NNNNNN`. */
export function nextLeadReference(year: number, existingReferences: Iterable<string>): string {
  return formatLeadReference(year, nextLeadSequence(year, existingReferences));
}
