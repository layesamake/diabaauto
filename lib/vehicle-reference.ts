import { AppError } from "@/lib/errors";

/**
 * Référence véhicule `DBC-YYYY-NNNNNN` (doc 03 §6.1, contrat L2 §2.1).
 *
 * Module partagé entre le service (validation, génération côté serveur) et le repository (lecture du
 * maximum existant) afin d'éviter tout import croisé entre les deux.
 */

export const VEHICLE_REFERENCE_PATTERN = /^DBC-\d{4}-\d{6}$/;
export const MAX_VEHICLE_SEQUENCE = 999_999;

export function isValidVehicleReference(reference: string): boolean {
  return VEHICLE_REFERENCE_PATTERN.test(reference);
}

/** Formate `DBC-YYYY-NNNNNN` ; refuse une année ou une séquence hors bornes. */
export function formatVehicleReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new AppError("VALIDATION", "Année de référence invalide.");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_VEHICLE_SEQUENCE) {
    throw new AppError("CONFLICT", "Séquence de référence véhicule épuisée.");
  }

  return `DBC-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Numéro suivant de l'année : maximum existant + 1 (contrat §2.1), 1 si aucun. */
export function nextVehicleSequence(year: number, existingReferences: Iterable<string>): number {
  const prefix = `DBC-${year}-`;
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

/** Référence suivante complète, au format `DBC-YYYY-NNNNNN`. */
export function nextVehicleReference(year: number, existingReferences: Iterable<string>): string {
  return formatVehicleReference(year, nextVehicleSequence(year, existingReferences));
}