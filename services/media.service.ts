import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MAX_IMAGES_PER_VEHICLE } from "@/lib/media-constants";
import { createVehicleMediaRepository } from "@/repositories/vehicle-media.repository";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import type { DocumentVisibility, MediaType } from "@/services/vehicle.service";

/**
 * Médias du véhicule (doc 03 §7, contrat L2 §2.4).
 *
 * Règles :
 * - un média IMAGE référence un fichier déjà déposé (`storage_path`) et n'a pas d'`external_url` ;
 *   un média VIDEO externe porte `external_url` et un `storage_path` NULL ;
 * - un seul média principal par véhicule : le service démarque les autres dans la MÊME transaction ;
 * - supprimer le média principal réattribue le principal au premier média image public restant ;
 * - un média principal doit être une IMAGE publique, sinon l'invariant de publication ne peut pas
 *   être satisfait ;
 * - la visibilité suit `DocumentVisibility` (`PUBLIC` par défaut).
 *
 * Dépendance Supabase NON exécutée : aucun bucket n'est configuré (D15). L'enregistrement d'un média
 * se fait donc uniquement par chemin de stockage déjà déposé ou par URL externe ; l'obtention d'une
 * URL signée est isolée dans `lib/storage/vehicle-storage.ts` et n'est pas exercée ici.
 *
 * Surface d'API gelée (contrat §2bis) : `listMedia` / `addMedia` / `removeMedia` / `setPrimaryMedia`.
 */

export type MediaRow = {
  id: string;
  vehicleId: string;
  mediaType: MediaType;
  storagePath: string | null;
  externalUrl: string | null;
  thumbnailPath: string | null;
  category: string | null;
  displayOrder: number;
  isPrimary: boolean;
  visibility: DocumentVisibility;
};

export type MediaCreateData = Omit<MediaRow, "id">;

export type VehicleMediaRepository = {
  findById(id: string): Promise<MediaRow | null>;
  listByVehicle(vehicleId: string): Promise<MediaRow[]>;
  create(input: MediaCreateData): Promise<MediaRow>;
  setPrimary(id: string, isPrimary: boolean): Promise<MediaRow>;
  /** Démarque tous les médias principaux du véhicule, sauf `exceptId`. */
  demotePrimary(vehicleId: string, exceptId: string | null): Promise<void>;
  setDisplayOrder(id: string, displayOrder: number): Promise<void>;
  remove(id: string): Promise<void>;
  /** Remplace les fichiers (original + vignette) d'un média image, sans changer son identifiant. */
  updateFiles(id: string, files: { storagePath: string; thumbnailPath: string | null }): Promise<MediaRow>;
  /** Remplace la seule vignette d'un média (affiche d'une vidéo), sans toucher au fichier principal. */
  updateThumbnail(id: string, thumbnailPath: string | null): Promise<MediaRow>;
  /**
   * Verrouille la ligne du véhicule jusqu'à la fin de la transaction courante (`SELECT … FOR UPDATE`).
   * Sérialise les ajouts concurrents. Retourne `false` si le véhicule n'existe pas.
   */
  lockVehicle(vehicleId: string): Promise<boolean>;
  transaction<T>(fn: (tx: VehicleMediaRepository) => Promise<T>): Promise<T>;
};

export type MediaDependencies = { repository: VehicleMediaRepository };

let mediaRepository: VehicleMediaRepository = createVehicleMediaRepository();

/** Remplace le repository (tests unitaires, ou composition serveur). */
export function configureMediaRepository(repository: VehicleMediaRepository): void {
  mediaRepository = repository;
}

/** Rétablit le repository Prisma par défaut. */
export function resetMediaRepository(): void {
  mediaRepository = createVehicleMediaRepository();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const idField = z.string().trim().uuid();
const storagePathField = z.string().trim().min(1).max(512);
const urlField = z.string().trim().url().max(2048);

const mediaSchema = z
  .object({
    mediaType: z.enum(["IMAGE", "VIDEO"]),
    storagePath: storagePathField.nullish(),
    externalUrl: urlField.nullish(),
    thumbnailPath: storagePathField.nullish(),
    category: z.string().trim().max(60).nullish(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
    isPrimary: z.boolean().optional(),
    visibility: z.enum(["PUBLIC", "PRIVATE", "SHARE_ON_REQUEST"]).optional(),
  })
  .strict();

export type ParsedMedia = {
  mediaType: MediaType;
  storagePath: string | null;
  externalUrl: string | null;
  thumbnailPath: string | null;
  category: string | null;
  displayOrder: number | null;
  isPrimary: boolean | null;
  visibility: DocumentVisibility;
};

export function parseMedia(input: unknown): ParsedMedia {
  const result = mediaSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de média invalide.");
  }

  const data = result.data;
  const storagePath = data.storagePath ?? null;
  const externalUrl = data.externalUrl ?? null;

  if (data.mediaType === "IMAGE" && !storagePath) {
    throw new AppError("VALIDATION", "Une image exige un chemin de stockage.");
  }
  if (data.mediaType === "IMAGE" && externalUrl) {
    throw new AppError("VALIDATION", "Une image ne peut pas porter d'URL externe.");
  }
  if (data.mediaType === "VIDEO" && !externalUrl) {
    throw new AppError("VALIDATION", "Une vidéo exige une URL externe.");
  }
  if (data.mediaType === "VIDEO" && storagePath) {
    throw new AppError("VALIDATION", "Une vidéo externe ne référence pas de fichier stocké.");
  }

  const visibility = data.visibility ?? "PUBLIC";
  if (data.isPrimary === true && (data.mediaType !== "IMAGE" || visibility !== "PUBLIC")) {
    throw new AppError("VALIDATION", "Un média principal doit être une image publique.");
  }

  return {
    mediaType: data.mediaType,
    storagePath,
    externalUrl,
    thumbnailPath: data.thumbnailPath ?? null,
    category: data.category ?? null,
    displayOrder: data.displayOrder ?? null,
    isPrimary: data.isPrimary ?? null,
    visibility,
  };
}

/** Un média est éligible au statut principal : image publique. */
export function canBePrimary(record: Pick<MediaRow, "mediaType" | "visibility">): boolean {
  return record.mediaType === "IMAGE" && record.visibility === "PUBLIC";
}

function idOf(value: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant de média invalide.");
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

/** Lecture back-office des médias d'un véhicule. */
export async function listMedia(actor: Actor, vehicleId: string): Promise<MediaRow[]> {
  requireStaff(actor, "vehicle.view");
  return mediaRepository.listByVehicle(idOf(vehicleId));
}

/**
 * Ajoute un média. `displayOrder` par défaut = dernier + 1 ; le premier média image public devient
 * automatiquement principal. Un `isPrimary: true` démarque les autres médias dans la transaction.
 */
export async function addMedia(
  actor: Actor,
  vehicleId: string,
  input: unknown,
): Promise<{ id: string }> {
  requireStaff(actor, "vehicle.edit");
  const vehicle = idOf(vehicleId);
  const parsed = parseMedia(input);

  const created = await mediaRepository.transaction(async (tx) => {
    // Le verrou rend « compter puis insérer » atomique : deux ajouts simultanés ne peuvent pas
    // dépasser la limite. Un déclencheur SQL (M10) reste le filet de sécurité final.
    if (!(await tx.lockVehicle(vehicle))) {
      throw new AppError("NOT_FOUND", "Ressource introuvable.");
    }

    const existing = await tx.listByVehicle(vehicle);
    if (
      parsed.mediaType === "IMAGE" &&
      existing.filter((item) => item.mediaType === "IMAGE").length >= MAX_IMAGES_PER_VEHICLE
    ) {
      throw new AppError(
        "VALIDATION",
        `Limite de ${MAX_IMAGES_PER_VEHICLE} images par véhicule atteinte.`,
      );
    }

    const maxOrder = existing.reduce((max, item) => Math.max(max, item.displayOrder), -1);
    const becomesPrimary =
      parsed.isPrimary ??
      (existing.length === 0 && parsed.mediaType === "IMAGE" && parsed.visibility === "PUBLIC");

    if (becomesPrimary) {
      await tx.demotePrimary(vehicle, null);
    }

    return tx.create({
      vehicleId: vehicle,
      mediaType: parsed.mediaType,
      storagePath: parsed.storagePath,
      externalUrl: parsed.externalUrl,
      thumbnailPath: parsed.thumbnailPath,
      category: parsed.category,
      displayOrder: parsed.displayOrder ?? maxOrder + 1,
      isPrimary: becomesPrimary,
      visibility: parsed.visibility,
    });
  });

  return { id: created.id };
}

/** Lecture d'un média par identifiant (back-office). */
export async function getMedia(actor: Actor, mediaId: string): Promise<MediaRow> {
  requireStaff(actor, "vehicle.view");
  const record = await mediaRepository.findById(idOf(mediaId));
  if (!record) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  return record;
}

/**
 * Remplace les fichiers d'un média image (ré-optimisation). L'identifiant, l'ordre, la visibilité et
 * le statut « principal » sont conservés : les URL `/api/media/[id]` restent valables.
 */
export async function replaceMediaFiles(
  actor: Actor,
  mediaId: string,
  files: { storagePath: string; thumbnailPath: string | null },
): Promise<MediaRow> {
  requireStaff(actor, "vehicle.edit");
  const id = idOf(mediaId);

  const record = await mediaRepository.findById(id);
  if (!record) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }
  if (record.mediaType !== "IMAGE") {
    throw new AppError("VALIDATION", "Seule une image peut être ré-optimisée.");
  }

  return mediaRepository.updateFiles(id, files);
}

/**
 * Définit l'affiche d'une vidéo (ou la retire avec `null`).
 *
 * Réservé aux médias VIDEO : l'affiche d'une image, c'est sa propre vignette, produite par le
 * pipeline d'optimisation. Le chemin reçu désigne un fichier DÉJÀ copié dans le stockage par
 * l'appelant — ce service ne manipule aucun octet.
 */
export async function setVideoThumbnail(
  actor: Actor,
  mediaId: string,
  thumbnailPath: string | null,
): Promise<MediaRow> {
  requireStaff(actor, "vehicle.edit");
  const id = idOf(mediaId);

  const record = await mediaRepository.findById(id);
  if (!record) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }
  if (record.mediaType !== "VIDEO") {
    throw new AppError("VALIDATION", "Seule une vidéo porte une affiche.");
  }

  return mediaRepository.updateThumbnail(id, thumbnailPath);
}

/**
 * Supprime un média ; si c'était le principal, le premier média image public restant devient
 * principal (dans la même transaction).
 */
export async function removeMedia(actor: Actor, mediaId: string): Promise<void> {
  requireStaff(actor, "vehicle.edit");
  const id = idOf(mediaId);

  const record = await mediaRepository.findById(id);
  if (!record) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  await mediaRepository.transaction(async (tx) => {
    await tx.remove(id);

    if (!record.isPrimary) {
      return;
    }

    const remaining = await tx.listByVehicle(record.vehicleId);
    const candidate = remaining.find(canBePrimary);
    if (candidate) {
      await tx.setPrimary(candidate.id, true);
    }
  });
}

/** Rend un média principal (IMAGE publique) et démarque les autres dans la transaction. */
export async function setPrimaryMedia(actor: Actor, mediaId: string): Promise<void> {
  requireStaff(actor, "vehicle.edit");
  const id = idOf(mediaId);

  const record = await mediaRepository.findById(id);
  if (!record) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }
  if (!canBePrimary(record)) {
    throw new AppError("VALIDATION", "Un média principal doit être une image publique.");
  }

  await mediaRepository.transaction(async (tx) => {
    await tx.demotePrimary(record.vehicleId, id);
    await tx.setPrimary(id, true);
  });
}

/**
 * Réordonne les médias d'un véhicule : l'ensemble fourni doit correspondre exactement à l'existant.
 * Hors surface d'écran gelée, mais nécessaire à l'édition de l'ordre d'affichage (doc 03 §7).
 */
export async function reorderMedia(
  actor: Actor,
  vehicleId: string,
  orderedIds: readonly string[],
): Promise<MediaRow[]> {
  requireStaff(actor, "vehicle.edit");
  const vehicle = idOf(vehicleId);
  const ids = z.array(idField).min(1).max(200).safeParse(orderedIds);
  if (!ids.success || new Set(ids.data).size !== ids.data.length) {
    throw new AppError("VALIDATION", "Ordre des médias invalide.");
  }

  const existing = await mediaRepository.listByVehicle(vehicle);
  const existingIds = new Set(existing.map((item) => item.id));
  if (existingIds.size !== ids.data.length || ids.data.some((id) => !existingIds.has(id))) {
    throw new AppError("VALIDATION", "L'ordre fourni ne correspond pas aux médias du véhicule.");
  }

  return mediaRepository.transaction(async (tx) => {
    for (const [index, id] of ids.data.entries()) {
      await tx.setDisplayOrder(id, index);
    }

    return tx.listByVehicle(vehicle);
  });
}

/**
 * Média principal d'un véhicule, destiné à la vignette de fiche. Le tri suit `display_order`
 * (déjà garanti par le repository).
 */
export function selectPrimaryMedia(media: readonly MediaRow[]): MediaRow | null {
  return media.find((item) => item.isPrimary && canBePrimary(item)) ?? null;
}