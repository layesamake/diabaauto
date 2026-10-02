/**
 * Favoris visiteur (contrat lot 4 §Sous-agent A, T34, dev.md §Favoris).
 *
 * Stockage exclusivement côté client, clé versionnée `diaba-auto:favorites:v1` : tant qu'un visiteur
 * n'est pas connecté, aucune ligne n'est créée en base (invariant transversal §1 du contrat). Toutes
 * les fonctions sont pures/tolérantes : SSR (pas de `window`), navigation privée (accès bloqué),
 * quota dépassé ou contenu corrompu ne lèvent jamais — elles retombent sur une liste vide.
 */

export const FAVORITES_STORAGE_KEY = "diaba-auto:favorites:v1";

/** Même format que la validation serveur (`zod().uuid()`) : un identifiant de véhicule est un UUID. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidVehicleId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Accès défensif à `localStorage` : absent (SSR) ou inaccessible (navigation privée) -> `null`. */
function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeReadRaw(storage: Storage): unknown {
  try {
    const raw = storage.getItem(FAVORITES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function safeWrite(storage: Storage, ids: readonly string[]): void {
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Quota dépassé ou navigation privée : l'écriture échoue silencieusement, jamais d'exception.
  }
}

/** Liste dédupliquée des UUID de véhicules favoris du visiteur. Ne lève jamais. */
export function readLocalFavorites(): string[] {
  const storage = safeStorage();
  if (!storage) {
    return [];
  }

  const parsed = safeReadRaw(storage);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return [...new Set(parsed.filter(isValidVehicleId))];
}

/** Indique si un véhicule fait partie des favoris locaux. Ne lève jamais. */
export function isLocalFavorite(vehicleId: string): boolean {
  if (!isValidVehicleId(vehicleId)) {
    return false;
  }

  return readLocalFavorites().includes(vehicleId);
}

/** Ajoute un favori local (idempotent) ; retourne la liste résultante. Ne lève jamais. */
export function addLocalFavorite(vehicleId: string): string[] {
  if (!isValidVehicleId(vehicleId)) {
    return readLocalFavorites();
  }

  const storage = safeStorage();
  const current = readLocalFavorites();
  if (current.includes(vehicleId)) {
    return current;
  }

  const next = [...current, vehicleId];
  if (storage) {
    safeWrite(storage, next);
  }

  return next;
}

/** Retire un favori local (idempotent) ; retourne la liste résultante. Ne lève jamais. */
export function removeLocalFavorite(vehicleId: string): string[] {
  const storage = safeStorage();
  const next = readLocalFavorites().filter((id) => id !== vehicleId);

  if (storage) {
    safeWrite(storage, next);
  }

  return next;
}

/**
 * Vide les favoris locaux. Appelée à la déconnexion pour ne pas exposer les favoris d'un visiteur
 * au prochain utilisateur de l'appareil (dev.md §Favoris) — ne supprime jamais de favori serveur,
 * cette fonction ne touche que `localStorage`. Ne lève jamais.
 */
export function clearLocalFavorites(): void {
  const storage = safeStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(FAVORITES_STORAGE_KEY);
  } catch {
    // Tolérant : l'absence de suppression ne doit jamais interrompre l'appelant (ex. déconnexion).
  }
}
