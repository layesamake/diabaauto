import { prisma } from "@/lib/prisma/client";

/**
 * Libellés lisibles pour la liste des commandes : le nom d'un client et le titre d'un véhicule, à la
 * place de leurs identifiants.
 *
 * Deux requêtes groupées (`id IN (…)`), quel que soit le nombre de commandes : jamais une requête par
 * ligne. Colonnes strictement nécessaires — aucune coordonnée, aucun champ d'approvisionnement.
 * L'autorisation se décide en amont, dans `services/order-labels.service.ts`.
 */

export type VehicleLabel = { reference: string; title: string };

export type OrderLabelsRepository = {
  customerNames(ids: readonly string[]): Promise<Map<string, string>>;
  vehicleLabels(ids: readonly string[]): Promise<Map<string, VehicleLabel>>;
};

export function createOrderLabelsRepository(): OrderLabelsRepository {
  return {
    async customerNames(ids) {
      if (ids.length === 0) return new Map();

      const rows = await prisma.customerProfile.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, firstName: true, lastName: true },
      });

      return new Map(rows.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()]));
    },

    async vehicleLabels(ids) {
      if (ids.length === 0) return new Map();

      const rows = await prisma.vehicle.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, reference: true, title: true },
      });

      return new Map(rows.map((row) => [row.id, { reference: row.reference, title: row.title }]));
    },
  };
}
