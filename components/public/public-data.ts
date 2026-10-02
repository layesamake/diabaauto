import { isAppError } from "@/lib/errors";

/**
 * Chargement tolérant des données publiques.
 *
 * Le catalogue dépend de la base de données : quand elle est indisponible, une page publique ne doit
 * jamais rendre une trace serveur non gérée. `loadPublicData` transforme l'échec en état affichable.
 *
 * - `ok` : la lecture a abouti ;
 * - `invalid` : l'entrée (filtres d'URL) a été refusée par le service (`AppError VALIDATION`) ;
 * - `unavailable` : dépendance indisponible (base de données, réseau) ou erreur inattendue.
 *
 * Le détail de l'erreur n'est jamais exposé à l'écran (dev.md §6).
 */
export type PublicData<T> =
  | { status: "ok"; value: T }
  | { status: "invalid" }
  | { status: "unavailable" };

export async function loadPublicData<T>(load: () => Promise<T>): Promise<PublicData<T>> {
  try {
    return { status: "ok", value: await load() };
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION") {
      return { status: "invalid" };
    }

    return { status: "unavailable" };
  }
}

/** Exécution synchrone d'une validation de service : `invalid` reproduit l'état « filtres refusés ». */
export function parsePublicInput<T>(parse: () => T): PublicData<T> {
  try {
    return { status: "ok", value: parse() };
  } catch {
    return { status: "invalid" };
  }
}