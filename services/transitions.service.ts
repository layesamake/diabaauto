export type VehicleCommercialStatus =
  | "DRAFT"
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "UNAVAILABLE"
  | "ARCHIVED";

/**
 * Transitions autorisées de `VehicleCommercialStatus` (contrat canonique §4.4).
 * La publication (`Vehicle.isPublished`) n'est pas un statut : elle n'est pas modélisée ici.
 */
const allowedVehicleTransitions: Readonly<Record<VehicleCommercialStatus, readonly VehicleCommercialStatus[]>> = {
  DRAFT: ["AVAILABLE", "ARCHIVED"],
  AVAILABLE: ["RESERVED", "UNAVAILABLE", "ARCHIVED"],
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
