/**
 * Libellés de l'écran Demandes sur mesure du back-office (lot 5 §4-§5, doc 03 §11).
 *
 * Fichier dédié : ne modifie ni `lib/i18n/fr.ts` ni `lib/i18n/index.ts` (fusion réalisée par
 * l'orchestrateur, même convention que `lib/i18n/custom-request.fr.ts`). L'écran personnel importe
 * ce module directement ; les libellés client de `lib/i18n/custom-request.fr.ts` restent réservés au
 * parcours public.
 *
 * Aucune donnée de contact ni identifiant de client n'y figure : la vue personnel ne les projette
 * jamais (`services/custom-request.service.ts`).
 */
export const staffRequestMessages = {
  list: {
    title: "Demandes sur mesure",
    subtitle: "Qualification commerciale des demandes de véhicules personnalisés.",
    deniedSubtitle: "Accès réservé au personnel habilité.",
    statusFilterLabel: "Statut",
    allStatuses: "Tous les statuts",
    filter: "Filtrer",
    reset: "Réinitialiser",
    count: (total: number): string => `${total} demande(s).`,
    empty: "Aucune demande ne correspond à ces critères.",
    unavailableTitle: "Liste indisponible",
    unavailableBody:
      "La liste des demandes n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez après rétablissement du service de données.",
    columns: {
      reference: "Demande",
      criteria: "Recherche",
      budget: "Budget",
      status: "Statut",
      createdAt: "Reçue le",
      action: "Statut",
    } as Record<string, string>,
    brandPrefix: "Marque",
    modelPrefix: "Modèle",
    notesPrefix: "Précisions",
    noCriteria: "Aucun critère précisé.",
    budgetRange: (min: string | null, max: string | null): string => {
      if (min && max) return `${min} – ${max} XOF`;
      if (min) return `à partir de ${min} XOF`;
      if (max) return `jusqu'à ${max} XOF`;
      return "Budget non précisé";
    },
  },

  status: {
    current: "Statut actuel",
    newStatus: "Nouveau statut",
    submit: "Changer le statut",
    pending: "Mise à jour…",
    updated: "Statut de la demande mis à jour.",
    readOnly: "Lecture seule : votre compte ne porte pas la permission de modification.",
    onlyStatus: "Aucun autre statut n'est disponible pour cette demande.",
    hint:
      "Le corpus n'impose pas de machine à états pour les demandes sur mesure : tout statut listé est proposé, le service valide la valeur transmise.",
  },

  fieldErrors: {
    status: "Le statut indiqué n'est pas valide.",
    id: "L'identifiant de la demande est invalide.",
  } as Record<string, string>,

  /** Libellés d'affichage des statuts (`RequestStatus`, E28 : valeurs conservées, aucune inventée). */
  statusLabels: {
    RECEIVED: "Reçue",
    QUALIFIED: "Qualifiée",
    SEARCHING: "Recherche en cours",
    PROPOSED: "Proposition envoyée",
    CLOSED: "Clôturée",
    ABANDONED: "Abandonnée",
  } as Record<string, string>,
} as const;

export type StaffRequestMessages = typeof staffRequestMessages;
