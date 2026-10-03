/**
 * Libellés de la demande personnalisée (`/commander`, contrat lot 4 §2 Sous-agent C).
 *
 * Fichier dédié : ne modifie ni `lib/i18n/fr.ts` ni `lib/i18n/index.ts` (fusionnés par
 * l'orchestrateur, cf. contrat §3.1). Aucune promesse commerciale ni numéro inventé (CLAUDE.md §8).
 */
export const customRequestMessages = {
  pageTitle: "Demande personnalisée",
  pageIntro:
    "Décrivez le véhicule que vous recherchez : Diaba Auto vous recontacte pour vous proposer une offre adaptée.",
  disclaimer:
    "Cette demande ne vaut ni réservation, ni commande confirmée, ni vente. Diaba Auto vous recontacte pour la suite.",

  criteriaTitle: "Votre recherche",
  brandLabel: "Marque souhaitée",
  modelLabel: "Modèle souhaité",
  notesLabel: "Précisions utiles",
  notesHint: "État, année, équipements, localisation souhaitée… tout ce qui aide à cibler votre recherche.",
  budgetMinLabel: "Budget minimum (XOF)",
  budgetMaxLabel: "Budget maximum (XOF)",

  contactTitle: "Vos coordonnées",
  contactIntro: "Nécessaires pour vous recontacter : aucun compte n'est requis pour envoyer cette demande.",
  contactConnectedNotice: "Vos coordonnées enregistrées sur votre compte seront utilisées pour cette demande.",
  contactNameLabel: "Nom complet",
  contactPhoneLabel: "Téléphone (WhatsApp accepté)",

  submit: "Envoyer la demande",
  submitting: "Envoi en cours…",
  submitSuccess: "Votre demande a été envoyée. Diaba Auto vous recontacte prochainement.",
  submitGenericError: "La demande n'a pas pu être envoyée. Réessayez.",

  fieldErrors: {
    criteria: "Indiquez au moins un critère (marque, modèle ou précision).",
    brand: "La marque indiquée n'est pas valide.",
    model: "Le modèle indiqué n'est pas valide.",
    notes: "Les précisions saisies ne sont pas valides (500 caractères maximum).",
    budgetMin: "Le budget minimum n'est pas valide.",
    budgetMax: "Le budget maximum n'est pas valide (il doit être supérieur ou égal au budget minimum).",
    contactName: "Indiquez votre nom complet.",
    contactPhone: "Indiquez un numéro de téléphone valide.",
  } as Record<string, string>,

  list: {
    title: "Mes demandes personnalisées",
    empty: "Vous n'avez envoyé aucune demande personnalisée pour le moment.",
    unavailable: "Vos demandes ne peuvent pas être affichées pour le moment.",
    budgetRange: (min: string | null, max: string | null): string => {
      if (min && max) return `Budget : ${min} – ${max} XOF`;
      if (min) return `Budget à partir de ${min} XOF`;
      if (max) return `Budget jusqu'à ${max} XOF`;
      return "Budget non précisé";
    },
    status: {
      RECEIVED: "Reçue",
      QUALIFIED: "En cours de qualification",
      SEARCHING: "Recherche en cours",
      PROPOSED: "Proposition envoyée",
      CLOSED: "Clôturée",
    } as Record<string, string>,
  },
} as const;

export type CustomRequestMessages = typeof customRequestMessages;
