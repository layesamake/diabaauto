import {
  createVehicleStorageService,
  isVehicleStorageConfigured,
  readStorageConfig,
} from "@/lib/storage/vehicle-storage";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import type { MediaRow } from "@/services/media.service";

/**
 * Vignettes des médias pour les écrans du back-office.
 *
 * La route publique `/api/media/[id]` ne sert QUE les médias publics de fiches publiées et non
 * archivées. Le back-office montre aussi des brouillons et des archives — et c'est précisément
 * avant publication que l'aperçu sert. Ces écrans ne peuvent donc pas passer par elle : les
 * vignettes sont signées ici, côté serveur, après contrôle de la permission `vehicle.view`.
 *
 * Toutes les URL sont demandées en UN seul appel au stockage, et non une par image.
 *
 * Ces URL sont de courte durée (`STORAGE_SIGNED_URL_TTL_SECONDS`) et ne sont jamais rendues
 * publiques : elles n'apparaissent que dans une page déjà réservée au personnel habilité.
 */

/** Chemin à afficher pour un média : sa vignette, à défaut l'image elle-même. */
function previewPathOf(media: MediaRow): string | null {
  if (media.mediaType !== "IMAGE") {
    return null;
  }

  return media.thumbnailPath?.trim() || media.storagePath?.trim() || null;
}

/**
 * URL de vignette par identifiant de média. Un média sans fichier, un stockage non configuré ou un
 * fichier absent du bucket se traduisent par une entrée manquante : l'appelant affiche un repli
 * plutôt qu'une image cassée. Une panne de stockage n'empêche jamais l'écran de s'afficher.
 */
export async function resolveMediaThumbnails(
  actor: Actor,
  media: readonly MediaRow[],
): Promise<Map<string, string>> {
  requireStaff(actor, "vehicle.view");

  const thumbnails = new Map<string, string>();

  const config = readStorageConfig();
  if (!isVehicleStorageConfigured(config)) {
    return thumbnails;
  }

  const paths = new Map<string, string>();
  for (const item of media) {
    const path = previewPathOf(item);
    if (path) {
      paths.set(item.id, path);
    }
  }

  if (paths.size === 0) {
    return thumbnails;
  }

  try {
    const signed = await createVehicleStorageService(config).createSignedUrls([...paths.values()]);

    for (const [mediaId, path] of paths) {
      const url = signed.get(path);
      if (url) {
        thumbnails.set(mediaId, url);
      }
    }
  } catch {
    // Le détail reste côté serveur : l'écran s'affiche sans vignette plutôt que de tomber.
    return thumbnails;
  }

  return thumbnails;
}
