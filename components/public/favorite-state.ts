import { createFavoriteRepository } from "@/repositories/favorite.repository";
import { listOwnFavorites } from "@/services/favorite.service";
import type { Actor } from "@/services/identity.service";

/**
 * État favoris nécessaire au rendu des cartes publiques (intégration orchestrateur, contrat lot 4
 * §3.2). Un visiteur n'a par définition aucun favori serveur : `FavoriteButton` lit son propre état
 * depuis `localStorage` côté client, cette fonction renvoie alors un ensemble vide sans aucune
 * lecture base. Une erreur de lecture (base indisponible) ne doit jamais empêcher l'affichage du
 * catalogue : elle retombe sur un ensemble vide plutôt que de faire échouer toute la page.
 */
export type FavoriteState = {
  isAuthenticated: boolean;
  favoriteVehicleIds: ReadonlySet<string>;
};

export async function loadFavoriteState(actor: Actor): Promise<FavoriteState> {
  if (actor.kind !== "customer") {
    return { isAuthenticated: false, favoriteVehicleIds: new Set() };
  }

  try {
    const favorites = await listOwnFavorites(createFavoriteRepository(), actor);
    return { isAuthenticated: true, favoriteVehicleIds: new Set(favorites.map((item) => item.vehicleId)) };
  } catch {
    return { isAuthenticated: true, favoriteVehicleIds: new Set() };
  }
}
