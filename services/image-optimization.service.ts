import sharp, { type Metadata } from "sharp";

/**
 * Optimisation d'images pour le web (lot backoffice — upload multi-images).
 *
 * Chaque image uploadée passe par ce pipeline avant d'être stockée dans le bucket :
 * 1. Validation du type MIME (magic bytes, pas seulement l'extension).
 * 2. Redimensionnement : largeur max 1920 px (proportionnel, pas d'agrandissement).
 * 3. Conversion WebP, qualité 80.
 * 4. Génération d'un thumbnail 400 × 300 px (crop centré).
 *
 * Le module est pur (pas de dépendance Storage/BDD) et testable unitairement.
 */

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES_PER_VEHICLE,
} from "@/lib/media-constants";

// Ré-exportation pour que les consommateurs serveur n'aient pas à importer deux modules.
export { MAX_FILE_SIZE_BYTES, MAX_IMAGES_PER_VEHICLE };

/** Types MIME acceptés (vérifié via les magic bytes par sharp). */
export const ACCEPTED_MIME_TYPES = new Set<string>(ACCEPTED_IMAGE_MIME_TYPES);

const OPTIMIZED_MAX_WIDTH = 1920;
const OPTIMIZED_QUALITY = 80;
const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 300;

export type OptimizedImage = {
  /** Image optimisée en WebP. */
  optimized: Buffer;
  /** Thumbnail 400×300 en WebP. */
  thumbnail: Buffer;
  /** Largeur de l'image optimisée. */
  width: number;
  /** Hauteur de l'image optimisée. */
  height: number;
  /** Format de sortie (toujours "webp"). */
  format: "webp";
  /** Taille de l'image optimisée en octets. */
  sizeBytes: number;
  /** Taille du thumbnail en octets. */
  thumbSizeBytes: number;
};

export type ImageValidationError =
  | { code: "INVALID_TYPE"; detectedType: string | null }
  | { code: "TOO_LARGE"; sizeBytes: number; maxBytes: number }
  | { code: "PROCESSING_FAILED"; message: string };

export type ImageValidationResult =
  | { ok: true; data: OptimizedImage }
  | { ok: false; error: ImageValidationError };

/**
 * Valide et optimise un buffer image.
 *
 * Retourne un résultat discriminé plutôt que de lancer : l'appelant décide du traitement d'erreur
 * (un Server Action peut vouloir agréger les erreurs de plusieurs images).
 */
export async function optimizeImage(input: Buffer): Promise<ImageValidationResult> {
  // --- Taille brute ---
  if (input.byteLength > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: { code: "TOO_LARGE", sizeBytes: input.byteLength, maxBytes: MAX_FILE_SIZE_BYTES },
    };
  }

  // --- Type MIME (magic bytes via sharp metadata) ---
  let metadata: Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", detectedType: null },
    };
  }

  const detectedMime = metadata.format ? `image/${metadata.format}` : null;
  if (!detectedMime || !ACCEPTED_MIME_TYPES.has(detectedMime)) {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", detectedType: detectedMime },
    };
  }

  // --- Optimisation ---
  try {
    const pipeline = sharp(input).rotate(); // Auto-rotate EXIF

    // Redimensionnement proportionnel (pas d'agrandissement)
    const needsResize =
      metadata.width !== undefined && metadata.width > OPTIMIZED_MAX_WIDTH;

    const resized = needsResize
      ? pipeline.resize({ width: OPTIMIZED_MAX_WIDTH, withoutEnlargement: true })
      : pipeline;

    const optimized = await resized
      .webp({ quality: OPTIMIZED_QUALITY })
      .toBuffer({ resolveWithObject: true });

    // Thumbnail : crop centré 400×300
    const thumbnail = await sharp(input)
      .rotate()
      .resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT, fit: "cover", position: "centre" })
      .webp({ quality: 70 })
      .toBuffer();

    return {
      ok: true,
      data: {
        optimized: optimized.data,
        thumbnail,
        width: optimized.info.width,
        height: optimized.info.height,
        format: "webp",
        sizeBytes: optimized.info.size,
        thumbSizeBytes: thumbnail.byteLength,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "PROCESSING_FAILED",
        message: err instanceof Error ? err.message : "Erreur de traitement inconnue.",
      },
    };
  }
}

/**
 * Vérifie qu'un Content-Type HTTP est acceptable.
 * Utilisé pour valider les images récupérées par URL avant de passer à `optimizeImage`.
 */
export function isAcceptedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Le Content-Type peut contenir des paramètres (charset, etc.)
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return ACCEPTED_MIME_TYPES.has(mime);
}
