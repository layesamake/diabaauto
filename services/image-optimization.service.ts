import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";

/**
 * Optimisation d'images pour le web (lot backoffice — upload multi-images).
 *
 * Chaque image envoyée passe par ce pipeline avant d'être stockée dans le bucket :
 * 1. Validation de la taille puis du VRAI format (signature binaire lue par sharp, pas l'extension).
 * 2. Rejet des images à trop de pixels (protection mémoire contre les images piégées).
 * 3. Correction de l'orientation EXIF. Les métadonnées (EXIF, dont le GPS, ICC, XMP) ne sont pas
 *    recopiées : sharp ne les conserve que sur demande explicite (`withMetadata`).
 * 4. Redimensionnement : largeur max 1920 px (proportionnel, jamais d'agrandissement).
 * 5. Conversion WebP, qualité 80 puis 70 puis 60 jusqu'à passer sous 300 Ko.
 * 6. Génération d'une vignette 400 × 300 px (recadrage centré).
 *
 * Le module est pur (pas de dépendance Storage/BDD) et testable unitairement.
 */

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES_PER_VEHICLE,
  TARGET_OPTIMIZED_BYTES,
} from "@/lib/media-constants";

// Ré-exportation pour que les consommateurs serveur n'aient pas à importer deux modules.
export { MAX_FILE_SIZE_BYTES, MAX_IMAGES_PER_VEHICLE };

/** Types MIME acceptés (vérifié via les magic bytes par sharp). */
export const ACCEPTED_MIME_TYPES = new Set<string>(ACCEPTED_IMAGE_MIME_TYPES);

const OPTIMIZED_MAX_WIDTH = 1920;
/** Paliers de qualité essayés dans l'ordre ; le dernier est conservé même s'il dépasse la cible. */
const QUALITY_STEPS = [80, 70, 60] as const;
const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 300;
const THUMB_QUALITY = 70;
/** ~60 mégapixels : un capteur de 50 Mpx passe, une « bombe » de décompression est refusée. */
const MAX_INPUT_PIXELS = 60_000_000;

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
  /** Taille du fichier reçu avant optimisation, pour afficher le gain. */
  originalBytes: number;
  /** Qualité WebP finalement retenue. */
  quality: number;
};

export type ImageValidationError =
  | { code: "INVALID_TYPE"; detectedType: string | null }
  | { code: "TOO_LARGE"; sizeBytes: number; maxBytes: number }
  | { code: "TOO_MANY_PIXELS" }
  | { code: "PROCESSING_FAILED"; message: string };

export type ImageValidationResult =
  | { ok: true; data: OptimizedImage }
  | { ok: false; error: ImageValidationError };

function openImage(input: Buffer): Sharp {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
}

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
    metadata = await openImage(input).metadata();
  } catch (err) {
    if (err instanceof Error && /pixel limit/i.test(err.message)) {
      return { ok: false, error: { code: "TOO_MANY_PIXELS" } };
    }

    return {
      ok: false,
      error: { code: "INVALID_TYPE", detectedType: null },
    };
  }

  // sharp annonce l'AVIF sous le format « heif » (conteneur HEIF, compression AV1). Le HEIC des
  // iPhone (compression HEVC) reste refusé : il n'est pas dans la liste acceptée.
  const detectedMime = metadata.format
    ? metadata.format === "heif" && metadata.compression === "av1"
      ? "image/avif"
      : `image/${metadata.format}`
    : null;
  if (!detectedMime || !ACCEPTED_MIME_TYPES.has(detectedMime)) {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", detectedType: detectedMime },
    };
  }

  // sharp renvoie les dimensions AVANT rotation : on contrôle les pixels avant de décoder.
  if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_INPUT_PIXELS) {
    return { ok: false, error: { code: "TOO_MANY_PIXELS" } };
  }

  // --- Optimisation ---
  try {
    let optimized: { data: Buffer; info: OutputInfo } | null = null;
    let usedQuality: number = QUALITY_STEPS[0];

    for (const quality of QUALITY_STEPS) {
      const attempt = await openImage(input)
        .rotate() // applique l'orientation EXIF puis la retire
        .resize({ width: OPTIMIZED_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });

      optimized = attempt;
      usedQuality = quality;

      if (attempt.data.byteLength <= TARGET_OPTIMIZED_BYTES) break;
    }

    if (!optimized) {
      throw new Error("Aucune sortie produite.");
    }

    // Thumbnail : crop centré 400×300
    const thumbnail = await openImage(input)
      .rotate()
      .resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT, fit: "cover", position: "centre" })
      .webp({ quality: THUMB_QUALITY })
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
        originalBytes: input.byteLength,
        quality: usedQuality,
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
