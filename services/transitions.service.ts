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