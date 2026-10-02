/**
 * Libellés de l'interface des favoris (contrat lot 4 §Sous-agent A).
 *
 * Même convention que `lib/i18n/fr.ts` : les identifiants restent en anglais, seules les valeurs
 * sont en français. Ce fichier n'est PAS fusionné par ce sous-agent dans `lib/i18n/fr.ts` ni
 * `lib/i18n/index.ts` — l'orchestrateur réalise cette fusion après coup (contrat §3.1).
 */
export const favoritesFr = {
  button: {
    add: "Ajouter aux favoris",
    remove: "Retirer des favoris",
    pendingAdd: "Ajout en cours…",
    pendingRemove: "Retrait en cours…",
    genericError: "L'action sur les favoris n'a pas pu aboutir. Réessayez.",
  },

  list: {
    title: "Mes favoris",
    emptyTitle: "Aucun favori enregistré",
    emptyBody: "Ajoutez des véhicules à vos favoris depuis le catalogue pour les retrouver ici.",
    emptyCta: "Voir le catalogue",
    unavailableTitle: "Favoris indisponibles",
    unavailableBody:
      "Vos favoris n'ont pas pu être chargés pour le moment. Réessayez dans quelques instants.",
    removeAction: "Retirer",
    removedVehicleTitle: "Véhicule indisponible",
    removedVehicleBody: "Ce véhicule n'est plus publié au catalogue. Vous pouvez retirer ce favori.",
    addedOn: (date: string) => `Ajouté le ${date}`,
  },

  merge: {
    inProgress: "Synchronisation de vos favoris…",
    success: "Vos favoris ont été synchronisés avec votre compte.",
    error: "La synchronisation de vos favoris locaux n'a pas pu aboutir.",
  },
} as const;

export type FavoritesMessages = typeof favoritesFr;
