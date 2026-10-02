/**
 * Libellés des écrans « Revendeurs » du back-office (contrat lot 5 §1, §3, §4 et §5).
 *
 * Fichier dédié : il n'est PAS fusionné dans `lib/i18n/index.ts` par ce module (l'intégration est
 * réalisée par l'orchestrateur). Les écrans importent directement `resellerFr` depuis ce fichier,
 * comme `/commander` le fait avec `custom-request.fr`.
 *
 * Ce module ne contient AUCUNE règle métier : il ne fait que nommer les valeurs d'énumération
 * existantes du schéma figé (doc 09 §3) et porter les textes. Aucune valeur d'énumération, aucun
 * délai ni numéro n'est inventé.
 */
import type { ResellerApplicationStatus } from "@/services/transitions.service";

/** Statuts de la machine à états de la demande Revendeur (doc 09 §3) — aucune valeur inventée. */
export const RESELLER_APPLICATION_STATUSES: readonly ResellerApplicationStatus[] = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

export const resellerApplicationStatusLabels: Readonly<Record<ResellerApplicationStatus, string>> = {
  PENDING: "En attente",
  UNDER_REVIEW: "En cours d'examen",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
};

/** Libellé d'un statut ; une valeur inconnue retombe sur un texte neutre, jamais sur une supposition. */
export function resellerApplicationStatusLabel(status: ResellerApplicationStatus): string {
  return resellerApplicationStatusLabels[status] ?? "Statut inconnu";
}

export const resellerFr = {
  pageTitle: "Revendeurs",
  pageSubtitle: "Prise en charge, approbation et refus des demandes de statut professionnel.",
  accessDeniedSubtitle: "Accès réservé au personnel habilité.",
  tableCaption: "Demandes Revendeur",

  filter: {
    statusLabel: "Statut",
    allStatuses: "Tous les statuts",
    submit: "Filtrer",
    reset: "Réinitialiser",
  },

  countLabel: (count: number): string => `${count} demande(s).`,
  empty: "Aucune demande Revendeur ne correspond à ce filtre.",

  table: {
    companyName: "Raison sociale",
    businessType: "Type d'activité",
    estimatedVolume: "Volume estimé",
    status: "Statut",
    createdAt: "Déposée le",
    reviewedAt: "Revue le",
    rejectionReason: "Motif de refus",
    customer: "Fiche client",
    actions: "Actions",
  },

  actions: {
    startReview: "Prendre en charge",
    approve: "Approuver",
    reject: "Refuser",
    cancel: "Annuler la demande",
    rejectConfirm: "Confirmer le refus",
    rejectionReasonLabel: "Motif du refus",
    rejectionReasonHint: "Motif communiqué au client en cas de refus de la demande.",
    approveHint:
      "L'approbation accorde le statut Revendeur et le profil tarifaire professionnel dans la même opération.",
  },

  messages: {
    pending: "Opération…",
    startReviewSuccess: "Demande prise en charge.",
    approveSuccess: "Demande approuvée : statut Revendeur accordé.",
    rejectSuccess: "Demande refusée.",
    cancelSuccess: "Demande annulée.",
    genericError: "L'opération n'a pas pu aboutir. Réessayez.",
  },

  unavailable: {
    title: "Liste indisponible",
    body:
      "Les demandes Revendeur n'ont pas pu être chargées. Aucune donnée n'est affichée ; réessayez après " +
      "rétablissement du service de données.",
  },
} as const;

export type ResellerMessages = typeof resellerFr;
