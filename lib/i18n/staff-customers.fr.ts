/**
 * Libellés des écrans « Clients » du back-office (contrat lot 5 §4 et §5).
 *
 * Fichier dédié : il n'est PAS fusionné dans `lib/i18n/index.ts` par ce module (l'intégration est
 * réalisée par l'orchestrateur). Les écrans importent directement `staffCustomersFr` depuis ce
 * fichier.
 *
 * Ce module ne contient AUCUNE règle métier : il ne fait que nommer les valeurs d'énumération
 * existantes du schéma figé (segment, statut Revendeur, profil tarifaire) et porter les textes.
 * Aucune valeur d'énumération n'est inventée.
 */
import type { ResellerStatus } from "@/services/pricing.service";
import type { CustomerSegment } from "@/services/staff-customer.service";

/** Segments du schéma figé (`CustomerSegment`, doc 03 §3) — aucune valeur inventée. */
export const CUSTOMER_SEGMENTS: readonly CustomerSegment[] = ["INDIVIDUAL", "FLEET", "GARAGE", "OTHER"];

export const customerSegmentLabels: Readonly<Record<CustomerSegment, string>> = {
  INDIVIDUAL: "Particulier",
  FLEET: "Flotte",
  GARAGE: "Garage",
  OTHER: "Autre",
};

export function customerSegmentLabel(segment: CustomerSegment): string {
  return customerSegmentLabels[segment] ?? "Segment inconnu";
}

/** Statuts Revendeur du schéma figé (`ResellerStatus`, doc 03 §9) — aucune valeur inventée. */
export const RESELLER_STATUSES: readonly ResellerStatus[] = [
  "NOT_APPLICABLE",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

export const resellerStatusLabels: Readonly<Record<ResellerStatus, string>> = {
  NOT_APPLICABLE: "Non concerné",
  PENDING: "En attente",
  APPROVED: "Approuvé",
  REJECTED: "Refusé",
  SUSPENDED: "Suspendu",
};

export function resellerStatusLabel(status: ResellerStatus): string {
  return resellerStatusLabels[status] ?? "Statut inconnu";
}

/** Profils tarifaires du schéma figé (`PricingProfile`, doc 03 §9). */
export const PRICING_PROFILE_LABELS: Readonly<Record<string, string>> = {
  STANDARD: "Standard",
  RESELLER: "Revendeur",
};

export const staffCustomersFr = {
  listTitle: "Clients",
  listSubtitle: "Consultation et suivi des clients ; modification du segment, des coordonnées et du statut Revendeur.",
  detailTitle: "Fiche client",
  accessDeniedSubtitle: "Accès réservé au personnel habilité.",
  tableCaption: "Clients enregistrés",

  filter: {
    searchLabel: "Recherche",
    searchPlaceholder: "Nom, téléphone, ville ou raison sociale",
    segmentLabel: "Segment",
    allSegments: "Tous les segments",
    resellerLabel: "Statut Revendeur",
    allResellerStatuses: "Tous les statuts",
    submit: "Filtrer",
    reset: "Réinitialiser",
  },

  countLabel: (count: number): string => `${count} client(s).`,
  empty: "Aucun client ne correspond à ces critères.",

  table: {
    name: "Nom",
    phone: "Téléphone",
    city: "Ville",
    country: "Pays",
    segment: "Segment",
    pricingProfile: "Profil tarifaire",
    resellerStatus: "Statut Revendeur",
    createdAt: "Créé le",
    sheet: "Fiche",
  },

  detail: {
    identity: "Identité",
    contact: "Coordonnées",
    segmentation: "Segmentation",
    reseller: "Statut Revendeur",
    firstName: "Prénom",
    lastName: "Nom",
    phone: "Téléphone",
    whatsapp: "WhatsApp",
    city: "Ville",
    country: "Pays",
    companyName: "Raison sociale",
    segment: "Segment",
    pricingProfile: "Profil tarifaire",
    resellerStatus: "Statut Revendeur",
    createdAt: "Créé le",
    updatedAt: "Mis à jour le",
    editTitle: "Modifier la fiche",
    editHint: "Le statut Revendeur et le profil tarifaire ne se modifient pas ici.",
    resellerTitle: "Statut Revendeur",
    resellerHint:
      "Ce réglage change uniquement le statut Revendeur. Le profil tarifaire professionnel est accordé " +
      "exclusivement par l'approbation d'une demande Revendeur.",
    readonlyNotice:
      "Votre compte ne porte pas la permission de modification des clients : la fiche est affichée en lecture seule.",
  },

  form: {
    editSubmit: "Enregistrer la fiche",
    editPending: "Enregistrement…",
    resellerSubmit: "Enregistrer le statut",
    resellerPending: "Enregistrement…",
    optionalHint: "Laissé vide, ce champ est effacé.",
  },

  messages: {
    updateSuccess: "Fiche client enregistrée.",
    resellerStatusSuccess: "Statut Revendeur enregistré.",
    genericError: "L'opération n'a pas pu aboutir. Réessayez.",
  },

  unavailable: {
    listTitle: "Liste indisponible",
    listBody:
      "La liste des clients n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez après " +
      "rétablissement du service de données.",
    detailTitle: "Fiche indisponible",
    detailBody:
      "La fiche client n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez après " +
      "rétablissement du service de données.",
    notFoundTitle: "Client introuvable",
    notFoundBody: "Ce client n'existe pas ou n'est pas accessible. Aucune donnée n'est affichée.",
  },
} as const;

export type StaffCustomersMessages = typeof staffCustomersFr;
