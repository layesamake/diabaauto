import { prisma } from "@/lib/prisma/client";
import type { FavoriteRepository } from "@/services/favorite.service";

/**
 * Accès Prisma aux favoris client (`favorite_vehicles` uniquement, doc 03 §10/§11, décision T34).
 *
 * RLS et GRANT sont déjà posés en base (CRUD complet de ses propres lignes pour un client
 * authentifié, migration M05) : ce repository n'exécute que des opérations idempotentes sur la clé
 * composite `(customer_id, vehicle_id)` et ne lit/écrit jamais une autre table.
 *
 * La cible (`customerId`) est toujours fournie par le service, jamais dérivée ici : ce fichier ne
 * connaît aucune règle d'autorisation, uniquement la traduction domaine <-> Prisma.
 */

export type FavoriteVehicleRow = { vehicleId: string; createdAt: Date };

/** Sous-ensemble du client Prisma utilisé — permet d'injecter un double en test unitaire. */
export type FavoriteVehicleClient = {
  favoriteVehicle: {
    findMany(args: {
      where: { customerId: string };
      select: { vehicleId: true; createdAt: true };
      orderBy: { createdAt: "desc" };
    }): Promise<FavoriteVehicleRow[]>;
    upsert(args: {
      where: { customerId_vehicleId: { customerId: string; vehicleId: string } };
      create: { customerId: string; vehicleId: string };
      update: Record<string, never>;
    }): Promise<unknown>;
    deleteMany(args: {
      where: { customerId: string; vehicleId: string };
    }): Promise<{ count: number }>;
    createMany(args: {
      data: { customerId: string; vehicleId: string }[];
      skipDuplicates: true;
    }): Promise<{ count: number }>;
  };
};

export function createFavoriteRepository(
  client: FavoriteVehicleClient = prisma as unknown as FavoriteVehicleClient,
): FavoriteRepository {
  return {
    async listByCustomer(customerId: string) {
      const rows = await client.favoriteVehicle.findMany({
        where: { customerId },
        select: { vehicleId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      return rows.map((row) => ({ vehicleId: row.vehicleId, createdAt: row.createdAt }));
    },

    /** `upsert` sur la clé composite : un second ajout du même véhicule ne crée aucun doublon. */
    async add(customerId: string, vehicleId: string) {
      await client.favoriteVehicle.upsert({
        where: { customerId_vehicleId: { customerId, vehicleId } },
        create: { customerId, vehicleId },
        update: {},
      });
    },

    /** `deleteMany` : retirer un favori déjà absent ne lève jamais d'erreur (0 ligne affectée). */
    async remove(customerId: string, vehicleId: string) {
      await client.favoriteVehicle.deleteMany({ where: { customerId, vehicleId } });
    },

    /** `createMany` + `skipDuplicates` : fusion idempotente, aucun doublon en base. */
    async mergeMany(customerId: string, vehicleIds: string[]) {
      if (vehicleIds.length === 0) {
        return;
      }

      await client.favoriteVehicle.createMany({
        data: vehicleIds.map((vehicleId) => ({ customerId, vehicleId })),
        skipDuplicates: true,
      });
    },
  };
}
