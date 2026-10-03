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

/** Dossier du bucket où le navigateur dépose le fichier brut avant optimisation serveur. */
export const STAGING_PREFIX = "staging";

/** Poids visé pour une image optimisée (octets) : la qualité WebP baisse par paliers pour l'atteindre. */
export const TARGET_OPTIMIZED_BYTES = 300 * 1024;

/**
 * Réduction côté navigateur (gain de temps d'envoi, pas une garantie : le serveur refait tout).
 * Une image déjà légère et de dimensions raisonnables est envoyée telle quelle.
 */
export const CLIENT_MAX_DIMENSION = 2000;
export const CLIENT_SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
