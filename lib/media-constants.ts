/**
 * Constantes partagées entre le client et le serveur pour les médias véhicule.
 *
 * Ce module ne doit contenir AUCUNE dépendance serveur (sharp, Prisma, Supabase, etc.) car il est
 * importé par des composants « use client ».
 */

/** Nombre max d'images par véhicule. */
export const MAX_IMAGES_PER_VEHICLE = 5;

/** Types MIME acceptés pour les images véhicule. */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Taille max d'un fichier brut en octets (10 Mo). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
