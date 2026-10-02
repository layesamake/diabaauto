export type VehicleCommercialStatus =
  | "DRAFT"
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "UNAVAILABLE"
  | "ARCHIVED";

/**
 * Transitions autorisées de `VehicleCommercialStatus` (doc 09 §1, contrat canonique §4.4).
 * La publication (`Vehicle.isPublished`) n'est pas un statut : elle n'est pas modélisée ici.
 *
 * `AVAILABLE → SOLD` est autorisé : doc 09 §1 porte explicitement la ligne
 * « AVAILABLE/RESERVED --Vendre--> SOLD » (condition : commande confirmée, transaction, audit), et
 * doc 14 §5 exige que la vente depuis un véhicule disponible soit transactionnelle. La vente n'exige
 * donc pas une réservation préalable (arbitrage T46).
 */
const allowedVehicleTransitions: Readonly<Record<VehicleCommercialStatus, readonly VehicleCommercialStatus[]>> = {
  DRAFT: ["AVAILABLE", "ARCHIVED"],
  AVAILABLE: ["RESERVED", "SOLD", "UNAVAILABLE", "ARCHIVED"],
  RESERVED: ["SOLD", "AVAILABLE"],
  SOLD: [],
  UNAVAILABLE: ["AVAILABLE", "ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionVehicleStatus(
  from: VehicleCommercialStatus,
  to: VehicleCommercialStatus,
): boolean {
  return allowedVehicleTransitions[from].includes(to);
}

// ---------------------------------------------------------------------------
// Lead (doc 09 §4, contrat lot 5 §3) — machine à états imposée
// ---------------------------------------------------------------------------

/** Statuts d'un prospect — déjà conformes au corpus (`LeadStatus`), aucune valeur inventée. */
export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "NEGOTIATION"
  | "ORDER_CONFIRMED"
  | "LOST"
  | "COMPLETED";

/**
 * Transitions autorisées du prospect (doc 09 §4, contrat lot 5 §3) :
 * `NEW → CONTACTED → QUALIFIED → NEGOTIATION → ORDER_CONFIRMED → COMPLETED`,
 * `LOST` atteignable depuis tout état non terminal. `COMPLETED` et `LOST` sont terminaux.
 */
const allowedLeadTransitions: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["ORDER_CONFIRMED", "LOST"],
  ORDER_CONFIRMED: ["COMPLETED", "LOST"],
  COMPLETED: [],
  LOST: [],
};

/** Cibles autorisées depuis un statut prospect (liste vide pour un état terminal). */
export function leadStatusTransitions(status: LeadStatus): LeadStatus[] {
  return [...allowedLeadTransitions[status]];
}

export function canTransitionLeadStatus(from: LeadStatus, to: LeadStatus): boolean {
  return allowedLeadTransitions[from].includes(to);
}

// ---------------------------------------------------------------------------
// Demande Revendeur (doc 09 §3, contrat lot 5 §3) — machine à états imposée
// ---------------------------------------------------------------------------

/** Statuts d'une demande Revendeur — enum corpus `ResellerApplicationStatus`, aucune valeur inventée. */
export type ResellerApplicationStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

/**
 * Transitions autorisées de la demande Revendeur (doc 09 §3, contrat lot 5 §3) :
 * `PENDING → UNDER_REVIEW` (prise en charge), `UNDER_REVIEW → APPROVED | REJECTED`,
 * `PENDING/UNDER_REVIEW → CANCELLED` (annulation client/admin). Toute autre transition est refusée.
 */
const allowedResellerApplicationTransitions: Readonly<
  Record<ResellerApplicationStatus, readonly ResellerApplicationStatus[]>
> = {
  PENDING: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Cibles autorisées depuis un statut de demande Revendeur (liste vide pour un état terminal). */
export function resellerApplicationTransitions(status: ResellerApplicationStatus): ResellerApplicationStatus[] {
  return [...allowedResellerApplicationTransitions[status]];
}

export function canTransitionResellerApplication(
  from: ResellerApplicationStatus,
  to: ResellerApplicationStatus,
): boolean {
  return allowedResellerApplicationTransitions[from].includes(to);
}

// ---------------------------------------------------------------------------
// Réservation (doc 09 §5, contrat lot 6 §3.1) — machine à états imposée
// ---------------------------------------------------------------------------

/** Statuts d'une réservation (doc 09 §5 et doc 12 : PENDING, CONFIRMED, CANCELLED, EXPIRED, CONVERTED). */
export type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "CONVERTED";

/**
 * Transitions autorisées de la réservation (doc 09 §5) :
 * `PENDING → CONFIRMER → CONFIRMED` ; `PENDING|CONFIRMED → Annuler → CANCELLED` ;
 * `CONFIRMED → Expirer → EXPIRED` ; `CONFIRMED → Convertir commande → CONVERTED`.
 *
 * « Maintenir » (doc 09 §5) n'est pas un changement d'état : c'est l'effet sur le véhicule
 * (`Vehicle.commercial_status = RESERVED`), porté par la confirmation (§10 : « Reservation CONFIRMED
 * + Vehicle RESERVED + Audit »). « Convertir commande » crée/relie la commande **et** clôt la
 * réservation en `CONVERTED` (valeur du doc 12), qui n'est plus active et n'entre donc plus en
 * conflit avec l'index unique partiel.
 */
const allowedReservationTransitions: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "EXPIRED", "CONVERTED"],
  CANCELLED: [],
  EXPIRED: [],
  CONVERTED: [],
};

/** Cibles autorisées depuis un statut de réservation (liste vide pour un état terminal). */
export function reservationTransitions(status: ReservationStatus): ReservationStatus[] {
  return [...allowedReservationTransitions[status]];
}

export function canTransitionReservationStatus(from: ReservationStatus, to: ReservationStatus): boolean {
  return allowedReservationTransitions[from].includes(to);
}

// ---------------------------------------------------------------------------
// Acompte externe (doc 09 §6, contrat lot 6 §3.2) — machine à états imposée
// ---------------------------------------------------------------------------

/** Statuts de l'acompte externe. Diaba Auto n'encaisse rien : ces états ne reflètent qu'un contrôle. */
export type DepositStatus = "NOT_REQUIRED" | "REQUESTED" | "REPORTED" | "VERIFIED" | "REJECTED";

/**
 * Transitions autorisées de l'acompte (doc 09 §6, lu littéralement) :
 * `NOT_REQUIRED | REQUESTED → REPORTED → VERIFIED | REJECTED`.
 *
 * L'activation d'un acompte (`deposit_required` passe à vrai et le statut devient `REQUESTED`) est un
 * **effet d'une mise à jour de la réservation**, pas une transition de cette machine : le corpus ne
 * déclare pas `NOT_REQUIRED → REQUESTED` comme transition, et rien n'est inventé ici.
 */
const allowedDepositTransitions: Readonly<Record<DepositStatus, readonly DepositStatus[]>> = {
  NOT_REQUIRED: ["REPORTED"],
  REQUESTED: ["REPORTED"],
  REPORTED: ["VERIFIED", "REJECTED"],
  VERIFIED: [],
  REJECTED: [],
};

/** Cibles autorisées depuis un statut d'acompte (liste vide pour un état terminal). */
export function depositTransitions(status: DepositStatus): DepositStatus[] {
  return [...allowedDepositTransitions[status]];
}

export function canTransitionDepositStatus(from: DepositStatus, to: DepositStatus): boolean {
  return allowedDepositTransitions[from].includes(to);
}

// ---------------------------------------------------------------------------
// Commande (doc 09 §7, contrat lot 6 §3.3) — machine à états imposée
// ---------------------------------------------------------------------------

/** Statuts d'une commande — déjà conformes au corpus (`OrderStatus`), aucune valeur inventée. */
export type OrderStatus =
  | "CONFIRMED"
  | "PROCESSING"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "DELIVERED"
  | "CANCELLED";

/**
 * Transitions autorisées de la commande (doc 09 §7) :
 * `CONFIRMED → PROCESSING → IN_TRANSIT → ARRIVED → DELIVERED`, et `→ CANCELLED` « selon règles
 * métier » depuis tout état actif. `DELIVERED` et `CANCELLED` sont terminaux : une commande livrée
 * ne se rouvre pas.
 */
const allowedOrderTransitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Cibles autorisées depuis un statut de commande (liste vide pour un état terminal). */
export function orderTransitions(status: OrderStatus): OrderStatus[] {
  return [...allowedOrderTransitions[status]];
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return allowedOrderTransitions[from].includes(to);
}
