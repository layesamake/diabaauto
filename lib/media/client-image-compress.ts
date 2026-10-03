import {
  ACCEPTED_IMAGE_MIME_TYPES,
  CLIENT_MAX_DIMENSION,
  CLIENT_SKIP_BELOW_BYTES,
} from "@/lib/media-constants";

/**
 * Réduction d'une image dans le navigateur avant l'envoi (module client uniquement : canvas).
 *
 * But : envoyer 300 Ko à 1 Mo au lieu de 5 à 10 Mo, ce qui compte sur une connexion mobile. Ce n'est
 * PAS la garantie de qualité ni de sécurité : le serveur relit le fichier, vérifie son vrai format,
 * le redimensionne, supprime les métadonnées et le convertit en WebP.
 *
 * Retourne le fichier d'origine, sans erreur, dès que la réduction n'est pas possible ou pas utile
 * (image déjà légère, format que le navigateur ne sait pas décoder, canvas indisponible…).
 */

const ACCEPTED: readonly string[] = ACCEPTED_IMAGE_MIME_TYPES;
const OUTPUT_QUALITY = 0.85;

export type PreparedImage = {
  blob: Blob;
  contentType: string;
  /** `true` si le fichier a été réduit côté navigateur. */
  reduced: boolean;
};

export function isAcceptedImageFile(file: File): boolean {
  return ACCEPTED.includes(file.type);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, contentType: file.type || "application/octet-stream", reduced: false };

  try {
    // Orientation EXIF appliquée au décodage : le canvas reçoit l'image droite.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longestSide = Math.max(bitmap.width, bitmap.height);

    if (file.size <= CLIENT_SKIP_BELOW_BYTES && longestSide <= CLIENT_MAX_DIMENSION) {
      bitmap.close();
      return original;
    }

    const scale = Math.min(1, CLIENT_MAX_DIMENSION / longestSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return original;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // WebP si le navigateur sait l'encoder, sinon JPEG ; le serveur convertira de toute façon.
    const webp = await canvasToBlob(canvas, "image/webp", OUTPUT_QUALITY);
    const encoded = webp && webp.type === "image/webp" ? webp : await canvasToBlob(canvas, "image/jpeg", OUTPUT_QUALITY);

    // Aucun gain : on garde l'original plutôt que d'ajouter une recompression.
    if (!encoded || encoded.size >= file.size) {
      return original;
    }

    return { blob: encoded, contentType: encoded.type, reduced: true };
  } catch {
    return original;
  }
}
