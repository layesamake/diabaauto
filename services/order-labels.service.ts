import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import { hasPermission } from "@/services/permissions.service";
import { toPermissionActor } from "@/services/identity.service";
import {
  createOrderLabelsRepository,
  type OrderLabelsRepository,
  type VehicleLabel,
} from "@/repositories/order-labels.repository";

/**
 * Noms et titres affichés dans la liste des commandes.
 *
 * Une commande ne porte que deux identifiants ; les afficher tels quels rend la liste illisible.
 * Ce module résout le nom du client et le titre du véhicule, **sous la permission de chaque source** :
 * sans `customer.view` le nom d'un client n'est jamais lu, sans `vehicle.view` le titre d'un véhicule
 * non plus. `order.view` seule ne donne pas accès aux fiches clients.
 */

export type OrderLabels = {
  /** Nom du client par identifiant ; vide si l'acteur ne peut pas voir les clients. */
  customers: ReadonlyMap<string, string>;
  vehicles: ReadonlyMap<string, VehicleLabel>;
};

export async function resolveOrderLabels(
  actor: Actor,
  orders: readonly { customerId: string; vehicleId: string }[],
  repository: OrderLabelsRepository = createOrderLabelsRepository(),
): Promise<OrderLabels> {
  const staff = requireStaff(actor, "order.view");
  const can = (permission: "customer.view" | "vehicle.view") =>
    hasPermission(toPermissionActor(staff), permission);

  const customerIds = [...new Set(orders.map((order) => order.customerId))];
  const vehicleIds = [...new Set(orders.map((order) => order.vehicleId))];

  const [customers, vehicles] = await Promise.all([
    can("customer.view") ? repository.customerNames(customerIds) : Promise.resolve(new Map<string, string>()),
    can("vehicle.view") ? repository.vehicleLabels(vehicleIds) : Promise.resolve(new Map<string, VehicleLabel>()),
  ]);

  return { customers, vehicles };
}
