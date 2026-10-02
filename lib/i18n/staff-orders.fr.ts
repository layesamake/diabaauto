/**
 * Libellés de l'écran « Commandes » du back-office (contrat lot 6 §3, §4, §5 et §6).
 *
 * Fichier dédié : il n'est PAS fusionné dans `lib/i18n/index.ts` par ce module (l'intégration est
 * réalisée par l'orchestrateur), comme `staff-customers.fr.ts` et `reseller.fr.ts`. Les écrans
 * importent directement `staffOrdersFr` depuis ce fichier.
 *
 * Ce module ne contient AUCUNE règle métier et n'importe des services que des TYPES (`import type`,
 * effacés à la compilation) : il est sûr côté serveur comme côté client. Il ne fait que nommer les
 * valeurs d'énumération du schéma gelé (statuts de commande, de réservation, d'acompte et types
 * d'événement logistique) — aucune valeur n'est inventée.
 */
import type { LogisticsEventType, OrderStatus } from "@/services/order.service";
import type { DepositStatus, ReservationStatus } from "@/services/reservation.service";

/** Statuts d'une commande (`OrderStatus`, doc 09 §7) — aucune valeur inventée. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "CANCELLED",
];

export const orderStatusLabels: Readonly<Record<OrderStatus, string>> = {
  CONFIRMED: "Confirmée",
  PROCESSING: "En préparation",
  IN_TRANSIT: "En transit",
  ARRIVED: "Arrivée",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};

/** Libellé d'un statut ; une valeur inconnue retombe sur un texte neutre, jamais sur une supposition. */
export function orderStatusLabel(status: OrderStatus): string {
  return orderStatusLabels[status] ?? "Statut inconnu";
}

/** Statuts d'une réservation (`ReservationStatus`, doc 09 §5 et doc 12) — aucune valeur inventée. */
export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "CONVERTED",
];

export const reservationStatusLabels: Readonly<Record<ReservationStatus, string>> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
  CONVERTED: "Convertie",
};

export function reservationStatusLabel(status: ReservationStatus): string {
  return reservationStatusLabels[status] ?? "Statut inconnu";
}

/** Statuts de l'acompte externe (`DepositStatus`, doc 09 §6) — aucun encaissement (BR-101/BR-102). */
export const DEPOSIT_STATUSES: readonly DepositStatus[] = [
  "NOT_REQUIRED",
  "REQUESTED",
  "REPORTED",
  "VERIFIED",
  "REJECTED",
];

export const depositStatusLabels: Readonly<Record<DepositStatus, string>> = {
  NOT_REQUIRED: "Non requise",
  REQUESTED: "Demandée",
  REPORTED: "Déclarée",
  VERIFIED: "Vérifiée",
  REJECTED: "Refusée",
};

export function depositStatusLabel(status: DepositStatus): string {
  return depositStatusLabels[status] ?? "Statut inconnu";
}

/** Types d'événement logistique du véhicule (`LogisticsEventType`, doc 03 §15) — liste verbatim. */
export const LOGISTICS_EVENT_TYPES: readonly LogisticsEventType[] = [
  "SUPPLIER",
  "INSPECTION",
  "PURCHASE_CONFIRMED",
  "PORT_CHINA",
  "SHIPPED",
  "AT_SEA",
  "ARRIVED_SENEGAL",
  "CUSTOMS",
  "AVAILABLE_SENEGAL",
  "DELIVERED",
];

export const logisticsEventTypeLabels: Readonly<Record<LogisticsEventType, string>> = {
  SUPPLIER: "Fournisseur",
  INSPECTION: "Inspection",
  PURCHASE_CONFIRMED: "Achat confirmé",
  PORT_CHINA: "Port (Chine)",
  SHIPPED: "Expédié",
  AT_SEA: "En mer",
  ARRIVED_SENEGAL: "Arrivé au Sénégal",
  CUSTOMS: "Douane",
  AVAILABLE_SENEGAL: "Disponible au Sénégal",
  DELIVERED: "Livré",
};

export function logisticsEventTypeLabel(eventType: LogisticsEventType): string {
  return logisticsEventTypeLabels[eventType] ?? "Événement inconnu";
}

export const staffOrdersFr = {
  listTitle: "Commandes",
  listSubtitle:
    "Réservations et commandes : prix convenus figés, transitions, historique et suivi logistique du véhicule.",
  accessDeniedSubtitle: "Accès réservé au personnel habilité.",
  tableCaption: "Commandes enregistrées",

  filter: {
    searchLabel: "Recherche",
    searchPlaceholder: "Référence de commande (CMD-…)",
    statusLabel: "Statut",
    allStatuses: "Tous les statuts",
    submit: "Filtrer",
    reset: "Réinitialiser",
  },

  countLabel: (count: number): string => `${count} commande(s).`,
  empty: "Aucune commande ne correspond à ces critères.",

  table: {
    reference: "Référence",
    customer: "Client",
    vehicle: "Véhicule",
    status: "Statut",
    agreedVehiclePrice: "Prix convenu",
    currency: "Devise",
    createdAt: "Créée le",
    sheet: "Fiche",
  },

  detail: {
    title: "Fiche commande",
    subtitle: (reference: string): string => `Référence ${reference}`,
    backToList: "Retour à la liste des commandes",
    notFoundTitle: "Commande introuvable",
    notFoundBody:
      "Cette commande n'existe pas ou n'est pas accessible. Aucune donnée n'est affichée.",
    summaryTitle: "Commande",
    summaryIntro:
      "Prix convenus figés à la création (BR-105) : ils ne sont jamais recalculés par une transition.",
    eventsTitle: "Historique des transitions",
    eventsIntro:
      "Journal `order_events` de la commande, distinct des événements logistiques du véhicule.",
    eventsEmpty: "Aucune transition enregistrée pour cette commande.",
    openCustomer: "Ouvrir la fiche client",
    openVehicle: "Ouvrir la fiche véhicule",
    fields: {
      reference: "Référence",
      status: "Statut",
      customer: "Client",
      vehicle: "Véhicule",
      salesperson: "Commercial",
      lead: "Prospect rattaché",
      reservation: "Réservation rattachée",
      agreedVehiclePrice: "Prix convenu du véhicule",
      agreedTransportPrice: "Prix convenu du transport",
      currency: "Devise",
      confirmedAt: "Confirmée le",
      estimatedArrivalAt: "Arrivée estimée",
      deliveredAt: "Livrée le",
      createdAt: "Créée le",
      updatedAt: "Mise à jour le",
    },
  },

  create: {
    title: "Nouvelle commande (vente)",
    intro:
      "La vente est une transaction atomique : la commande, le passage du véhicule à « Vendu », la " +
      "conversion d'une éventuelle réservation et la bascule d'un éventuel prospect sont écrits " +
      "ensemble (doc 09 §10). Le prix convenu est figé ici et ne sera plus recalculé.",
    customerId: "Identifiant du client",
    customerIdHint:
      "Identifiant du compte client (`customers`). L'annuaire client est géré dans l'écran « Clients ».",
    vehicleId: "Identifiant du véhicule",
    vehicleIdHint:
      "Véhicule disponible ou réservé. L'écran « Véhicules » porte l'annuaire et le statut commercial.",
    leadId: "Identifiant du prospect (facultatif)",
    leadIdHint: "Rattaché à la vente : son statut passe à « Commande confirmée ».",
    reservationId: "Identifiant de la réservation (facultatif)",
    reservationIdHint:
      "Réservation du même véhicule : elle est convertie en commande dans la même transaction.",
    agreedVehiclePrice: "Prix convenu du véhicule",
    agreedTransportPrice: "Prix convenu du transport (facultatif)",
    currency: "Devise",
    submit: "Confirmer la vente",
    pending: "Enregistrement…",
    hint: "Montants en unité entière ou à deux décimales (Decimal 14,2). Devise au format ISO à 3 lettres.",
  },

  status: {
    title: "Statut de la commande",
    current: "Statut actuel",
    newStatus: "Nouveau statut",
    note: "Note (facultatif)",
    noteHint: "Reprise dans l'historique `order_events` de la commande.",
    estimatedArrivalAt: "Arrivée estimée (facultatif)",
    estimatedArrivalHint: "Date prévisionnelle d'arrivée, enregistrée avec la transition.",
    submit: "Faire évoluer le statut",
    pending: "Mise à jour…",
    readOnly:
      "Votre compte ne porte pas la permission de modification des commandes : le statut est affiché en lecture seule.",
    terminal:
      "Cette commande a atteint un statut terminal : aucune transition n'est proposée.",
    historyHint:
      "Machine à états imposée (doc 09 §7) : seules les transitions autorisées sont proposées, le service refuse toute autre valeur.",
  },

  logistics: {
    title: "Suivi logistique du véhicule",
    intro:
      "Événements du véhicule (`vehicle_logistics_events`), distincts de l'historique de la commande.",
    empty: "Aucun événement logistique pour ce véhicule.",
    addTitle: "Ajouter un événement",
    eventType: "Type d'événement",
    location: "Lieu (facultatif)",
    locationHint: "120 caractères maximum.",
    description: "Description (facultatif)",
    descriptionHint: "1000 caractères maximum.",
    eventAt: "Date de l'événement (facultatif)",
    eventAtHint: "Par défaut, l'instant de l'enregistrement.",
    submit: "Ajouter l'événement",
    pending: "Enregistrement…",
    readOnly:
      "Votre compte ne porte pas la permission de modification : le suivi logistique est affiché en lecture seule.",
  },

  reservation: {
    title: "Réservations du véhicule",
    intro:
      "La confirmation réserve le véhicule (`RESERVED`) ; l'annulation et l'expiration le libèrent. " +
      "Aucun encaissement n'existe : l'acompte n'est qu'un contrôle externe enregistré (BR-101/BR-102).",
    empty: "Aucune réservation pour ce véhicule.",
    createTitle: "Nouvelle réservation",
    customerId: "Identifiant du client",
    customerIdHint: "Compte client au nom duquel la réservation est posée.",
    leadId: "Identifiant du prospect (facultatif)",
    expiresAt: "Expiration (facultatif)",
    agreement: "Prix convenu (facultatif)",
    depositRequired: "Acompte externe requis",
    depositRequiredHint: "Aucun paiement n'est perçu par Diaba Auto : l'acompte est vérifié hors plateforme.",
    depositAmount: "Montant de l'acompte (facultatif)",
    depositCurrency: "Devise de l'acompte (facultatif)",
    createSubmit: "Créer la réservation",
    createPending: "Création…",
    confirm: "Confirmer",
    confirmPending: "Confirmation…",
    cancel: "Annuler",
    cancelPending: "Annulation…",
    expire: "Expirer",
    expirePending: "Expiration…",
    depositReportTitle: "Déclarer l'acompte",
    depositReference: "Référence externe de l'acompte",
    depositReferenceHint: "Référence transmise par le client, enregistrée telle quelle.",
    depositReportSubmit: "Déclarer",
    depositReportPending: "Déclaration…",
    depositVerify: "Vérifier l'acompte",
    depositVerifyPending: "Vérification…",
    depositRejectTitle: "Refuser l'acompte",
    depositRejectReason: "Motif du refus (facultatif)",
    depositRejectSubmit: "Refuser",
    depositRejectPending: "Refus…",
    convertHint:
      "La conversion d'une réservation confirmée (« CONVERTIR COMMANDE ») est portée par la création d'une commande sur le même véhicule.",
    readOnly:
      "Votre compte ne porte pas la permission de réservation : les réservations sont affichées en lecture seule.",
    fields: {
      reference: "Référence",
      status: "Statut",
      expiresAt: "Expire le",
      agreedPrice: "Prix convenu",
      depositStatus: "Statut de l'acompte",
      depositAmount: "Montant de l'acompte",
      depositReference: "Référence de l'acompte",
      confirmed: "Confirmée par le personnel",
      createdAt: "Créée le",
    },
    yes: "Oui",
    no: "Non",
  },

  workspace: {
    title: "Réservations d'un véhicule",
    intro:
      "Ouvrir l'espace de réservation d'un véhicule (avant toute commande). Saisissez l'identifiant du véhicule.",
    vehicleId: "Identifiant du véhicule",
    submit: "Gérer les réservations",
  },

  messages: {
    createSuccess: "Commande confirmée : vente enregistrée.",
    statusSuccess: "Statut de la commande mis à jour.",
    logisticsSuccess: "Événement logistique ajouté.",
    reservationCreateSuccess: "Réservation créée.",
    reservationConfirmSuccess: "Réservation confirmée.",
    reservationCancelSuccess: "Réservation annulée.",
    reservationExpireSuccess: "Réservation expirée.",
    depositReportSuccess: "Acompte externe déclaré.",
    depositVerifySuccess: "Acompte externe vérifié.",
    depositRejectSuccess: "Acompte externe refusé.",
    genericError: "L'opération n'a pas pu aboutir. Réessayez.",
  },

  fieldErrors: {
    status: "Le statut indiqué n'est pas valide.",
    eventType: "Le type d'événement est invalide.",
    date: "La date indiquée n'est pas valide.",
  } as Record<string, string>,

  unavailable: {
    listTitle: "Liste indisponible",
    listBody:
      "La liste des commandes n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez après " +
      "rétablissement du service de données.",
    detailTitle: "Fiche indisponible",
    detailBody:
      "La fiche commande n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez après " +
      "rétablissement du service de données.",
    reservationsTitle: "Réservations indisponibles",
    reservationsBody:
      "Les réservations du véhicule n'ont pas pu être chargées. Aucune donnée n'est affichée.",
    logisticsTitle: "Suivi indisponible",
    logisticsBody:
      "Le suivi logistique du véhicule n'a pas pu être chargé. Aucune donnée n'est affichée.",
  },
} as const;

export type StaffOrdersMessages = typeof staffOrdersFr;
