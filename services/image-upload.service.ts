import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { formatSize } from "@/lib/format-size";
import { STAGING_PREFIX } from "@/lib/media-constants";
import { fetchRemoteImage, RemoteFetchError } from "@/lib/security/safe-remote-fetch";
import {
  createVehicleStorageService,
  isVehicleStorageConfigured,
  readStorageConfig,
  type VehicleStorageService,
} from "@/lib/storage/vehicle-storage";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import {
  isAcceptedContentType,
  isThumbnailOutdated,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES_PER_VEHICLE,
  optimizeImage,
} from "@/services/image-optimization.service";
import { addMedia, getMedia, listMedia, replaceMediaFiles } from "@/services/media.service";

/**
 * Orchestration de l'ajout d'images véhicule (back-office).
 *
 * ATTENTION : ce module ne doit PAS porter la directive « use server ». Elle transformerait chaque
 * fonction exportée en point d'entrée appelable depuis le navigateur, avec un `actor` fourni par
 * l'appelant. Seules les Server Actions de `app/admin/actions.ts` sont exposées ; elles résolvent
 * l'acteur côté serveur.
 *
 * Deux chemins d'entrée, un seul pipeline d'optimisation (`optimizeAndStore`) :
 *
 * 1. Depuis l'ordinateur — le fichier ne transite JAMAIS par une Server Action (limite de corps de
 *    requête de Next.js et de Vercel, bien inférieure au poids d'une photo de téléphone) :
 *    a. `requestImageUploads` renvoie des cibles d'envoi signées vers un dossier temporaire du bucket ;
 *    b. le navigateur dépose le fichier (déjà réduit) directement dans le bucket ;
 *    c. `finalizeImageUploads` relit le fichier temporaire, l'optimise, écrit le résultat définitif,
 *       supprime le temporaire et enregistre le média.
 * 2. Depuis une URL — `addImagesFromUrls` télécharge côté serveur (voir `safe-remote-fetch`).
 *
 * Chaque image est traitée indépendamment : un échec n'empêche pas les autres.
 */

export type UploadResult =
  | {
      ok: true;
      mediaId: string;
      storagePath: string;
      source: string;
      originalBytes: number;
      optimizedBytes: number;
    }
  | { ok: false; source: string; error: string };

export type ReoptimizeResult =
  | { ok: true; changed: true; beforeBytes: number; afterBytes: number }
  | { ok: true; changed: false; beforeBytes: number }
  | { ok: false; error: string };

export type UploadTarget = { path: string; token: string };
export type UploadTargets = { bucket: string; targets: UploadTarget[] };

const idSchema = z.string().uuid();
const MAX_BATCH = MAX_IMAGES_PER_VEHICLE;

/** Types annoncés acceptés pour un téléchargement par URL (le contenu réel est vérifié ensuite). */
function acceptRemoteContentType(contentType: string | null): boolean {
  if (isAcceptedContentType(contentType)) return true;
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  // Certains hébergeurs servent les images en flux binaire générique.
  return mime === "application/octet-stream" || mime === "binary/octet-stream";
}

function vehicleIdOf(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Identifiant de véhicule invalide.");
  }
  return parsed.data;
}

function openStorage(): VehicleStorageService {
  const config = readStorageConfig();
  if (!isVehicleStorageConfigured(config)) {
    throw new AppError("INTERNAL", "Service de stockage non configuré.");
  }
  return createVehicleStorageService(config);
}

async function countImages(actor: Actor, vehicleId: string): Promise<number> {
  const existing = await listMedia(actor, vehicleId);
  return existing.filter((item) => item.mediaType === "IMAGE").length;
}

/** Refus rapide d'un lot trop gros ; la garantie réelle est dans `addMedia` (verrou) et en base (M10). */
async function assertRoom(actor: Actor, vehicleId: string, incoming: number): Promise<void> {
  if (incoming <= 0) {
    throw new AppError("VALIDATION", "Aucune image fournie.");
  }
  if (incoming > MAX_BATCH) {
    throw new AppError("VALIDATION", `Au plus ${MAX_BATCH} images à la fois.`);
  }

  const existing = await countImages(actor, vehicleId);
  if (existing + incoming > MAX_IMAGES_PER_VEHICLE) {
    throw new AppError(
      "VALIDATION",
      `Nombre maximum d'images dépassé : ${existing} existante(s), ${incoming} demandée(s), limite ${MAX_IMAGES_PER_VEHICLE}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Chemin 1 : depuis l'ordinateur (envoi direct vers le bucket)
// ---------------------------------------------------------------------------

/** Chemin temporaire d'un fichier brut : lié au véhicule, nom non devinable. */
function stagingPathFor(vehicleId: string, fileId: string): string {
  return `${STAGING_PREFIX}/${vehicleId}/${fileId}`;
}

function isStagingPathOf(path: string, vehicleId: string): boolean {
  const expected = new RegExp(`^${STAGING_PREFIX}/${vehicleId}/[0-9a-f-]{36}$`, "i");
  return expected.test(path) && !path.includes("..");
}

/**
 * Étape 1 : prépare `count` cibles d'envoi signées pour le navigateur.
 * Le client ne choisit jamais le chemin : il ne peut écrire que là où le serveur l'a autorisé.
 */
export async function requestImageUploads(
  actor: Actor,
  vehicleId: string,
  count: number,
): Promise<UploadTargets> {
  requireStaff(actor, "vehicle.edit");
  const vehicle = vehicleIdOf(vehicleId);
  const storage = openStorage();

  await assertRoom(actor, vehicle, count);

  const targets: UploadTarget[] = [];
  for (let index = 0; index < count; index += 1) {
    const path = stagingPathFor(vehicle, randomUUID());
    const signed = await storage.createSignedUploadUrl(path);
    targets.push({ path: signed.path, token: signed.token });
  }

  return { bucket: storage.bucket, targets };
}

/**
 * Étape 3 : relit chaque fichier déposé, l'optimise, l'enregistre et supprime le temporaire.
 * Un chemin qui n'appartient pas à ce véhicule est refusé, quoi que le navigateur envoie.
 */
export async function finalizeImageUploads(
  actor: Actor,
  vehicleId: string,
  items: ReadonlyArray<{ path: string; name?: string }>,
): Promise<UploadResult[]> {
  requireStaff(actor, "vehicle.edit");
  const vehicle = vehicleIdOf(vehicleId);
  const storage = openStorage();

  if (items.length === 0) {
    throw new AppError("VALIDATION", "Aucune image fournie.");
  }
  if (items.length > MAX_BATCH) {
    throw new AppError("VALIDATION", `Au plus ${MAX_BATCH} images à la fois.`);
  }

  const results: UploadResult[] = [];

  for (const item of items) {
    const source = (item.name ?? "").slice(0, 120) || "fichier";

    if (!isStagingPathOf(item.path, vehicle)) {
      results.push({ ok: false, source, error: "Fichier non reconnu." });
      continue;
    }

    try {
      const buffer = await storage.downloadFile(item.path, MAX_FILE_SIZE_BYTES);
      results.push(await optimizeAndStore(actor, vehicle, buffer, source, storage));
    } catch (error) {
      results.push({ ok: false, source, error: messageOf(error) });
    } finally {
      // Le brut ne doit jamais rester : il n'est ni optimisé, ni nettoyé de ses métadonnées.
      await storage.deleteFile(item.path).catch(() => undefined);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Chemin 2 : depuis une URL
// ---------------------------------------------------------------------------

export async function addImagesFromUrls(
  actor: Actor,
  vehicleId: string,
  urls: readonly string[],
): Promise<UploadResult[]> {
  requireStaff(actor, "vehicle.edit");
  const vehicle = vehicleIdOf(vehicleId);
  const storage = openStorage();

  await assertRoom(actor, vehicle, urls.length);

  const results: UploadResult[] = [];

  for (const url of urls) {
    try {
      const remote = await fetchRemoteImage(url, {
        maxBytes: MAX_FILE_SIZE_BYTES,
        acceptContentType: acceptRemoteContentType,
      });
      results.push(await optimizeAndStore(actor, vehicle, remote.buffer, url, storage));
    } catch (error) {
      results.push({ ok: false, source: url, error: messageOf(error) });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Ré-optimisation d'une image déjà enregistrée
// ---------------------------------------------------------------------------

/** Gain minimal pour remplacer une image : en dessous, on évite de recompresser pour rien. */
const MIN_GAIN_RATIO = 0.9;

/**
 * Repasse une image existante dans le pipeline (ex. image déposée avant l'optimisation automatique).
 * L'identifiant du média est conservé ; les anciens fichiers sont supprimés une fois le nouveau
 * chemin enregistré. Une image déjà optimisée n'est pas recompressée (perte de qualité inutile).
 */
export async function reoptimizeImage(actor: Actor, mediaId: string): Promise<ReoptimizeResult> {
  requireStaff(actor, "vehicle.edit");
  const media = await getMedia(actor, mediaId);

  if (media.mediaType !== "IMAGE" || !media.storagePath) {
    return { ok: false, error: "Ce média n'est pas une image stockée." };
  }

  const storage = openStorage();

  try {
    const original = await storage.downloadFile(media.storagePath, MAX_FILE_SIZE_BYTES);
    const result = await optimizeImage(original);
    if (!result.ok) {
      return { ok: false, error: describeOptimizationError(result.error) };
    }

    // Une vignette d'ancienne génération (400 px) doit être refaite même quand l'image principale
    // n'a plus rien à gagner : c'est elle que chargent les cartes du catalogue.
    const thumbnailNeedsRefresh = media.thumbnailPath
      ? await storage
          .downloadFile(media.thumbnailPath, MAX_FILE_SIZE_BYTES)
          .then(isThumbnailOutdated)
          .catch(() => true)
      : true;

    const { data } = result;
    if (data.sizeBytes >= original.byteLength * MIN_GAIN_RATIO && !thumbnailNeedsRefresh) {
      return { ok: true, changed: false, beforeBytes: original.byteLength };
    }

    const fileId = randomUUID();
    const storagePath = `vehicles/${media.vehicleId}/${fileId}.webp`;
    const thumbPath = `vehicles/${media.vehicleId}/thumbs/${fileId}.webp`;

    await storage.uploadFile(storagePath, data.optimized, "image/webp");
    await storage.uploadFile(thumbPath, data.thumbnail, "image/webp");

    try {
      await replaceMediaFiles(actor, media.id, { storagePath, thumbnailPath: thumbPath });
    } catch (error) {
      await removeQuietly(storage, [storagePath, thumbPath]);
      throw error;
    }

    await removeQuietly(storage, [media.storagePath, media.thumbnailPath]);

    return { ok: true, changed: true, beforeBytes: original.byteLength, afterBytes: data.sizeBytes };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

// ---------------------------------------------------------------------------
// Pipeline commun : optimisation + stockage + BDD
// ---------------------------------------------------------------------------

async function optimizeAndStore(
  actor: Actor,
  vehicleId: string,
  buffer: Buffer,
  source: string,
  storage: VehicleStorageService,
): Promise<UploadResult> {
  // 1. Optimisation
  const result = await optimizeImage(buffer);
  if (!result.ok) {
    return { ok: false, source, error: describeOptimizationError(result.error) };
  }

  // 2. Dépôt dans le bucket
  const fileId = randomUUID();
  const storagePath = `vehicles/${vehicleId}/${fileId}.webp`;
  const thumbPath = `vehicles/${vehicleId}/thumbs/${fileId}.webp`;

  await storage.uploadFile(storagePath, result.data.optimized, "image/webp");
  await storage.uploadFile(thumbPath, result.data.thumbnail, "image/webp");

  // 3. Enregistrement en base ; en cas de refus (ex. limite atteinte), on ne laisse pas de fichiers orphelins.
  try {
    const media = await addMedia(actor, vehicleId, {
      mediaType: "IMAGE",
      storagePath,
      externalUrl: null,
      thumbnailPath: thumbPath,
      category: null,
      visibility: "PUBLIC",
    });

    return {
      ok: true,
      mediaId: media.id,
      storagePath,
      source,
      originalBytes: result.data.originalBytes,
      optimizedBytes: result.data.sizeBytes,
    };
  } catch (error) {
    await removeQuietly(storage, [storagePath, thumbPath]);
    return { ok: false, source, error: messageOf(error) };
  }
}

function describeOptimizationError(
  error: Exclude<Awaited<ReturnType<typeof optimizeImage>>, { ok: true }>["error"],
): string {
  switch (error.code) {
    case "INVALID_TYPE":
      return `Format non supporté${error.detectedType ? ` (${error.detectedType})` : ""}. Formats acceptés : JPEG, PNG, WebP, AVIF.`;
    case "TOO_LARGE":
      return `Image trop volumineuse (${formatSize(error.sizeBytes)}, max ${formatSize(error.maxBytes)}).`;
    case "TOO_MANY_PIXELS":
      return "Image trop grande en dimensions.";
    case "PROCESSING_FAILED":
      return "Cette image n'a pas pu être traitée.";
  }
}

async function removeQuietly(
  storage: VehicleStorageService,
  paths: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  for (const path of paths) {
    if (path) {
      await storage.deleteFile(path).catch(() => undefined);
    }
  }
}

/** Message affichable. Une erreur inattendue ne divulgue jamais son détail technique. */
function messageOf(error: unknown): string {
  if (error instanceof AppError || error instanceof RemoteFetchError) return error.message;
  return "Erreur inattendue.";
}
