/**
 * Libellés des écrans Prospects du back-office (lot 5 §4-§5, doc 03 §11).
 *
 * Fichier dédié : ne modifie ni `lib/i18n/fr.ts` ni `lib/i18n/index.ts` (fusion réalisée par
 * l'orchestrateur, même convention que `lib/i18n/custom-request.fr.ts`). Les pages et composants
 * importent ce module directement.
 *
 * Aucune donnée prospect n'est un libellé : ce fichier ne contient que des messages d'interface
 * (identifiants en anglais, valeurs en français).
 */
export const leadMessages = {
  list: {
    title: "Prospects",
    subtitle: "Suivi commercial des prospects : recherche, statut et affectation.",
    deniedSubtitle: "Accès réservé au personnel habilité.",
    searchLabel: "Recherche",
    searchPlaceholder: "Référence, nom, téléphone, e-mail",
    statusFilterLabel: "Statut",
    allStatuses: "Tous les statuts",
    filter: "Filtrer",
    reset: "Réinitialiser",
    count: (total: number): string => `${total} prospect(s).`,
    empty: "Aucun prospect ne correspond à ces critères.",
    unavailableTitle: "Liste indisponible",
    unavailableBody:
      "La liste des prospects n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez après rétablissement du service de données.",
    columns: {
      reference: "Référence",
      name: "Nom",
      phone: "Téléphone",
      source: "Source",
      status: "Statut",
      assignee: "Commercial",
      nextFollowUp: "Prochaine relance",
      open: "Fiche",
    } as Record<string, string>,
    open: "Ouvrir",
    notAssigned: "Non assigné",
  },

  detail: {
    title: "Fiche prospect",
    subtitle: (reference: string): string => `Référence ${reference}`,
    deniedSubtitle: "Accès réservé au personnel habilité.",
    notFoundTitle: "Prospect introuvable",
    notFoundBody:
      "Ce prospect n'existe pas ou n'est pas accessible. Aucune donnée n'est affichée.",
    backToList: "Retour à la liste des prospects",
    identityTitle: "Identité et coordonnées",
    identityIntro:
      "Données privées, visibles uniquement du personnel habilité. Un compte client n'y accède jamais.",
    fields: {
      reference: "Référence",
      name: "Nom",
      phone: "Téléphone",
      whatsapp: "WhatsApp",
      email: "E-mail",
      source: "Source",
      customer: "Compte client",
      vehicle: "Véhicule lié",
      budget: "Budget",
      assigned: "Commercial assigné",
      nextFollowUp: "Prochaine relance",
      createdAt: "Créé le",
      updatedAt: "Mis à jour le",
    } as Record<string, string>,
    budgetRange: (min: string | null, max: string | null): string => {
      if (min && max) return `${min} – ${max} XOF`;
      if (min) return `à partir de ${min} XOF`;
      if (max) return `jusqu'à ${max} XOF`;
      return "Non renseigné";
    },
  },

  status: {
    title: "Statut du prospect",
    current: "Statut actuel",
    newStatus: "Nouveau statut",
    submit: "Changer le statut",
    pending: "Mise à jour…",
    updated: "Statut du prospect mis à jour.",
    readOnly:
      "Votre compte ne porte pas la permission de modification des prospects : le statut est affiché en lecture seule.",
    terminal:
      "Ce prospect a atteint un statut terminal : aucune transition n'est proposée.",
    historyHint:
      "Machine à états imposée (doc 09 §4) : seules les transitions autorisées sont proposées, le service refuse toute autre valeur.",
  },

  assignment: {
    title: "Affectation commerciale",
    current: "Commercial assigné",
    self: (name: string): string => `${name} (vous)`,
    assignLabel: "Identifiant du commercial",
    assignHint:
      "Identifiant du profil commercial (staff_profiles). L'annuaire du personnel est géré dans un autre écran ; le service vérifie l'existence et la permission.",
    assignSubmit: "Assigner",
    assigning: "Assignation…",
    assignToSelf: "M'assigner ce prospect",
    assignToSelfPending: "Assignation…",
    unassign: "Désassigner",
    unassigning: "Désassignation…",
    readOnly:
      "Votre compte ne porte pas la permission d'assignation : l'affectation est affichée en lecture seule.",
  },

  notes: {
    title: "Notes privées",
    intro:
      "Journal privé (`lead_notes`), interne à Diaba Auto. Chaque note est horodatée et attribuée à son auteur.",
    empty: "Aucune note pour ce prospect.",
    addLabel: "Nouvelle note",
    addPlaceholder: "Compte rendu d'appel, contexte, préférences du prospect…",
    addHint: "2000 caractères maximum.",
    submit: "Ajouter la note",
    pending: "Enregistrement…",
    added: "Note ajoutée.",
    readOnly:
      "Votre compte ne porte pas la permission de modifier les prospects : le journal est affiché en lecture seule.",
  },

  activities: {
    title: "Historique d'activités",
    intro:
      "Journal des échanges et des changements de statut (`lead_activities`). Les changements de statut y sont inscrits automatiquement.",
    empty: "Aucune activité enregistrée pour ce prospect.",
    typeLabel: "Type d'activité",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Objet de l'échange, résumé, prochaine étape…",
    descriptionHint: "500 caractères maximum.",
    submit: "Ajouter l'activité",
    pending: "Enregistrement…",
    added: "Activité ajoutée.",
    readOnly:
      "Votre compte ne porte pas la permission de modifier les prospects : l'historique est affiché en lecture seule.",
  },

  fieldErrors: {
    status: "Le statut indiqué n'est pas valide.",
    noteContent: "Le contenu de la note est invalide.",
    activityType: "Le type d'activité est invalide.",
    activityDescription: "La description de l'activité est invalide.",
    staffId: "L'identifiant du commercial est invalide.",
  } as Record<string, string>,

  /** Libellés d'affichage des statuts (`LeadStatus`, doc 09 §4). */
  statusLabels: {
    NEW: "Nouveau",
    CONTACTED: "Contacté",
    QUALIFIED: "Qualifié",
    NEGOTIATION: "Négociation",
    ORDER_CONFIRMED: "Commande confirmée",
    COMPLETED: "Terminé",
    LOST: "Perdu",
  } as Record<string, string>,

  /** Libellés d'affichage des types d'activité (`LeadActivityType`, aucune valeur inventée). */
  activityLabels: {
    CALL: "Appel",
    WHATSAPP: "WhatsApp",
    EMAIL: "E-mail",
    MEETING: "Rendez-vous",
    STATUS_CHANGE: "Changement de statut",
  } as Record<string, string>,
} as const;

export type LeadMessages = typeof leadMessages;
