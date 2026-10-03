"use server";

import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import {
  createVehicleStorageService,
  isVehicleStorageConfigured,
  readStorageConfig,
} from "@/lib/storage/vehicle-storage";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import {
  isAcceptedContentType,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES_PER_VEHICLE,
  optimizeImage,
} from "@/services/image-optimization.service";
import { addMedia, listMedia } from "@/services/media.service";

/**
 * Orchestration de l'upload multi-images (backoffice).
 *
 * Pour chaque image (fichier ou URL) :
 * 1. Récupération du buffer (File.arrayBuffer ou fetch côté serveur).
 * 2. Optimisation : resize, WebP, thumbnail (image-optimization.service).
 * 3. Upload dans le bucket Supabase (vehicle-storage).
 * 4. Enregistrement en base via le service media existant.
 *
 * Chaque image est traitée indépendamment : un échec n'empêche pas les autres.
 */

/** Timeout pour le fetch d'une URL distante (10 secondes). */
const URL_FETCH_TIMEOUT_MS = 10_000;

/** Taille max du body d'une URL distante (10 Mo, comme pour les fichiers). */
const URL_FETCH_MAX_BYTES = MAX_FILE_SIZE_BYTES;

/** Préfixes d'adresses privées refusées lors du fetch d'une URL. */
const BLOCKED_IP_PREFIXES = [
  "127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.",
  "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "0.", "169.254.",
  "::1", "fc00:", "fd00:", "fe80:",
];

export type UploadResult =
  | { ok: true; mediaId: string; storagePath: string }
  | { ok: false; source: string; error: string };

export type UploadInput = {
  files: File[];
  urls: string[];
};

/**
 * Upload groupé d'images pour un véhicule.
 *
 * Vérifie la permission `vehicle.edit`, le nombre total d'images (existant + nouvelles ≤ 5),
 * et la configuration du storage Supabase.
 */
export async function uploadVehicleImages(
  actor: Actor,
  vehicleId: string,
  input: UploadInput,
): Promise<UploadResult[]> {
  requireStaff(actor, "vehicle.edit");

  // Vérifier la configuration Storage
  const config = readStorageConfig();
  if (!isVehicleStorageConfigured(config)) {
    throw new AppError("INTERNAL", "Service de stockage non configuré.");
  }

  const storage = createVehicleStorageService(config);

  // Vérifier le nombre total
  const existing = await listMedia(actor, vehicleId);
  const existingImageCount = existing.filter((m) => m.mediaType === "IMAGE").length;
  const newCount = input.files.length + input.urls.length;

  if (existingImageCount + newCount > MAX_IMAGES_PER_VEHICLE) {
    throw new AppError(
      "VALIDATION",
      `Nombre maximum d'images dépassé : ${existingImageCount} existante(s), ${newCount} demandée(s), limite ${MAX_IMAGES_PER_VEHICLE}.`,
    );
  }

  if (newCount === 0) {
    throw new AppError("VALIDATION", "Aucune image fournie.");
  }

  // Traitement parallèle de chaque image
  const results: UploadResult[] = [];

  // Fichiers uploadés depuis l'ordinateur
  for (const file of input.files) {
    results.push(await processFile(actor, vehicleId, file, storage));
  }

  // Images depuis URL
  for (const url of input.urls) {
    results.push(await processUrl(actor, vehicleId, url, storage));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Traitement individuel
// ---------------------------------------------------------------------------

async function processFile(
  actor: Actor,
  vehicleId: string,
  file: File,
  storage: ReturnType<typeof createVehicleStorageService>,
): Promise<UploadResult> {
  const source = file.name || "fichier";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    return await optimizeAndStore(actor, vehicleId, buffer, source, storage);
  } catch (err) {
    return { ok: false, source, error: errorMessage(err) };
  }
}

async function processUrl(
  actor: Actor,
  vehicleId: string,
  url: string,
  storage: ReturnType<typeof createVehicleStorageService>,
): Promise<UploadResult> {
  try {
    // Validation de l'URL
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, source: url, error: "Seuls les protocoles HTTP et HTTPS sont acceptés." };
    }

    // Vérification des adresses privées (anti-SSRF)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      BLOCKED_IP_PREFIXES.some((prefix) => hostname.startsWith(prefix))
    ) {
      return { ok: false, source: url, error: "Adresse réseau privée non autorisée." };
    }

    // Fetch avec timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "DiabaAuto-ImageFetcher/1.0" },
        redirect: "follow",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { ok: false, source: url, error: `Erreur HTTP ${response.status}.` };
    }

    // Vérifier le Content-Type
    const contentType = response.headers.get("content-type");
    if (!isAcceptedContentType(contentType)) {
      return {
        ok: false,
        source: url,
        error: `Type de contenu non supporté : ${contentType ?? "inconnu"}.`,
      };
    }

    // Vérifier la taille (Content-Length si disponible)
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > URL_FETCH_MAX_BYTES) {
      return { ok: false, source: url, error: "Image trop volumineuse (max 10 Mo)." };
    }

    // Lire le body avec limite de taille
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > URL_FETCH_MAX_BYTES) {
      return { ok: false, source: url, error: "Image trop volumineuse (max 10 Mo)." };
    }

    const buffer = Buffer.from(arrayBuffer);
    return await optimizeAndStore(actor, vehicleId, buffer, url, storage);
  } catch (err) {
    if (err instanceof TypeError && String(err.message).includes("abort")) {
      return { ok: false, source: url, error: "Délai de téléchargement dépassé (10 s)." };
    }
    return { ok: false, source: url, error: errorMessage(err) };
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
  storage: ReturnType<typeof createVehicleStorageService>,
): Promise<UploadResult> {
  // 1. Optimisation
  const result = await optimizeImage(buffer);
  if (!result.ok) {
    const message =
      result.error.code === "INVALID_TYPE"
        ? `Format non supporté${result.error.detectedType ? ` (${result.error.detectedType})` : ""}.`
        : result.error.code === "TOO_LARGE"
          ? `Image trop volumineuse (${formatSize(result.error.sizeBytes)}, max ${formatSize(result.error.maxBytes)}).`
          : result.error.message;
    return { ok: false, source, error: message };
  }

  // 2. Upload dans le bucket
  const fileId = randomUUID();
  const storagePath = `vehicles/${vehicleId}/${fileId}.webp`;
  const thumbPath = `vehicles/${vehicleId}/thumbs/${fileId}.webp`;

  await storage.uploadFile(storagePath, result.data.optimized, "image/webp");
  await storage.uploadFile(thumbPath, result.data.thumbnail, "image/webp");

  // 3. Enregistrement en base via le service media existant
  const mediaResult = await addMedia(actor, vehicleId, {
    mediaType: "IMAGE",
    storagePath,
    externalUrl: null,
    thumbnailPath: thumbPath,
    category: null,
    visibility: "PUBLIC",
  });

  return { ok: true, mediaId: mediaResult.id, storagePath };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return "Erreur inattendue.";
}
