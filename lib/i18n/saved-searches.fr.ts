/**
 * Libellés dédiés aux recherches enregistrées (contrat lot 4 §2 « Sous-agent B »).
 *
 * Fichier autonome : n'est PAS fusionné dans `lib/i18n/fr.ts`/`index.ts` par ce sous-agent
 * (hors périmètre, cf. contrat). L'orchestrateur l'intègre lors de l'intégration finale (§3).
 *
 * Décision T35 : `notificationsEnabled` est persisté mais AUCUNE notification n'est envoyée (aucune
 * infrastructure e-mail disponible) — `notificationsHint` ci-dessous le rappelle explicitement partout
 * où l'option est proposée à l'écran, pour ne jamais laisser croire à une alerte active.
 */
export const savedSearchesFr = {
  sectionTitle: "Recherches enregistrées",
  sectionIntro:
    "Retrouvez vos critères de recherche favoris et relancez-les en un clic depuis le catalogue.",

  saveButton: {
    label: "Enregistrer cette recherche",
    pending: "Enregistrement…",
    signInRequired: "Connectez-vous à My Diaba Auto pour enregistrer une recherche.",
    success: "Votre recherche a été enregistrée.",
    genericError: "L'enregistrement n'a pas pu aboutir. Réessayez.",
  },

  form: {
    nameLabel: "Nom de la recherche",
    nameHint: "80 caractères maximum, par exemple « Berlines Dakar 2022 ».",
    notificationsLabel: "Être averti des nouveaux véhicules correspondants",
    notificationsHint:
      "Aucune alerte n'est envoyée pour le moment : cette préférence est enregistrée pour une mise en place future.",
    submit: "Enregistrer",
    cancel: "Annuler",
  },

  list: {
    emptyTitle: "Aucune recherche enregistrée",
    emptyBody:
      "Enregistrez une recherche depuis le catalogue pour la retrouver ici et la relancer rapidement.",
    unavailableTitle: "Recherches enregistrées indisponibles",
    unavailableBody:
      "Vos recherches enregistrées n'ont pas pu être chargées pour le moment. Réessayez dans quelques instants.",
    createdOn: (date: string) => `Enregistrée le ${date}`,
    notificationsOn: "Alerte demandée (aucun envoi actif pour le moment)",
    notificationsOff: "Aucune alerte demandée",
    openSearch: "Voir les véhicules correspondants",
    remove: "Supprimer",
    removePending: "Suppression…",
    removeConfirm: "Supprimer cette recherche enregistrée ?",
    removeSuccess: "La recherche a été supprimée.",
    removeError: "La suppression n'a pas pu aboutir. Réessayez.",
  },
} as const;

export type SavedSearchesMessages = typeof savedSearchesFr;
