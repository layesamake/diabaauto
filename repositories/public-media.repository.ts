import { prisma } from "@/lib/prisma/client";
import type { PublicMediaRecord } from "@/services/media-delivery.service";

/**
 * Lecture d'un média PUBLIC pour sa livraison (route `/api/media/[id]`).
 *
 * `visibility = PUBLIC`, `isPublished = true` ET `archivedAt = null` sont posés dans la requête :
 * un média de brouillon, d'archive ou non public ne ressort jamais (défense en profondeur).
 */
export async function findPublicMedia(id: string): Promise<PublicMediaRecord | null> {
  const row = await prisma.vehicleMedia.findFirst({
    where: {
      id,
      visibility: "PUBLIC",
      vehicle: { isPublished: true, archivedAt: null },
    },
    select: { storagePath: true, thumbnailPath: true },
  });

  return row ? { storagePath: row.storagePath, thumbnailPath: row.thumbnailPath } : null;
}
