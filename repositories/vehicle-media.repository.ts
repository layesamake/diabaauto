import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { translatePrismaError } from "@/lib/prisma/errors";
import type {
  MediaCreateData,
  MediaRow,
  VehicleMediaRepository,
} from "@/services/media.service";

/**
 * Accès Prisma aux médias de véhicule (doc 03 §7) et démarquage du média principal.
 *
 * `display_order` est posé par le service (dernier + 1, puis réordonnancement explicite) ; la
 * démarcation du principal s'applique à tous les médias du véhicule dans la transaction courante.
 */

export const vehicleMediaSelect = {
  id: true,
  vehicleId: true,
  mediaType: true,
  storagePath: true,
  externalUrl: true,
  thumbnailPath: true,
  category: true,
  displayOrder: true,
  isPrimary: true,
  visibility: true,
} as const;

export type VehicleMediaRow = {
  id: string;
  vehicleId: string;
  mediaType: MediaRow["mediaType"];
  storagePath: string | null;
  externalUrl: string | null;
  thumbnailPath: string | null;
  category: string | null;
  displayOrder: number;
  isPrimary: boolean;
  visibility: MediaRow["visibility"];
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toVehicleMediaRecord(row: VehicleMediaRow): MediaRow {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    mediaType: row.mediaType,
    storagePath: row.storagePath ?? null,
    externalUrl: row.externalUrl ?? null,
    thumbnailPath: row.thumbnailPath ?? null,
    category: row.category ?? null,
    displayOrder: row.displayOrder,
    isPrimary: row.isPrimary,
    visibility: row.visibility,
  };
}

export function createVehicleMediaRepository(
  client: Prisma.TransactionClient = prisma,
): VehicleMediaRepository {
  async function findById(id: string): Promise<MediaRow | null> {
    const row = await client.vehicleMedia.findUnique({ where: { id }, select: vehicleMediaSelect });
    return row ? toVehicleMediaRecord(row) : null;
  }

  async function listByVehicle(vehicleId: string): Promise<MediaRow[]> {
    const rows = await client.vehicleMedia.findMany({
      where: { vehicleId },
      select: vehicleMediaSelect,
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });

    return rows.map(toVehicleMediaRecord);
  }

  async function create(input: MediaCreateData): Promise<MediaRow> {
    try {
      const row = await client.vehicleMedia.create({
        data: {
          vehicleId: input.vehicleId,
          mediaType: input.mediaType,
          storagePath: input.storagePath,
          externalUrl: input.externalUrl,
          thumbnailPath: input.thumbnailPath,
          category: input.category,
          displayOrder: input.displayOrder,
          isPrimary: input.isPrimary,
          visibility: input.visibility,
        },
        select: vehicleMediaSelect,
      });

      return toVehicleMediaRecord(row);
    } catch (error) {
      const translated = translatePrismaError(error, "Chemin de stockage déjà utilisé.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function setPrimary(id: string, isPrimary: boolean): Promise<MediaRow> {
    const row = await client.vehicleMedia.update({
      where: { id },
      data: { isPrimary },
      select: vehicleMediaSelect,
    });

    return toVehicleMediaRecord(row);
  }

  async function demotePrimary(vehicleId: string, exceptId: string | null): Promise<void> {
    await client.vehicleMedia.updateMany({
      where: { vehicleId, isPrimary: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isPrimary: false },
    });
  }

  async function setDisplayOrder(id: string, displayOrder: number): Promise<void> {
    await client.vehicleMedia.update({ where: { id }, data: { displayOrder }, select: { id: true } });
  }

  async function remove(id: string): Promise<void> {
    await client.vehicleMedia.delete({ where: { id }, select: { id: true } });
  }

  async function updateFiles(
    id: string,
    files: { storagePath: string; thumbnailPath: string | null },
  ): Promise<MediaRow> {
    try {
      const row = await client.vehicleMedia.update({
        where: { id },
        data: { storagePath: files.storagePath, thumbnailPath: files.thumbnailPath },
        select: vehicleMediaSelect,
      });

      return toVehicleMediaRecord(row);
    } catch (error) {
      const translated = translatePrismaError(error, "Chemin de stockage déjà utilisé.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function updateThumbnail(id: string, thumbnailPath: string | null): Promise<MediaRow> {
    const row = await client.vehicleMedia.update({
      where: { id },
      data: { thumbnailPath },
      select: vehicleMediaSelect,
    });

    return toVehicleMediaRecord(row);
  }

  async function lockVehicle(vehicleId: string): Promise<boolean> {
    // Verrou de ligne tenu jusqu'à la fin de la transaction : sérialise les ajouts de médias
    // d'un même véhicule. Hors transaction il serait relâché aussitôt, donc inutile (non utilisé ainsi).
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE
    `;

    return rows.length > 0;
  }

  return {
    findById,
    listByVehicle,
    create,
    setPrimary,
    demotePrimary,
    setDisplayOrder,
    remove,
    updateFiles,
    updateThumbnail,
    lockVehicle,
    // Transaction de premier niveau uniquement (voir `repositories/vehicle.repository.ts`).
    transaction: (fn) => prisma.$transaction(async (tx) => fn(createVehicleMediaRepository(tx))),
  };
}