import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";

/**
 * Accès au bucket Supabase « vehicle-images » — DÉPENDANCE NON EXÉCUTÉE (D15).
 *
 * Aucun projet Supabase n'est configuré dans cet environnement : les fonctions de ce module ne sont
 * donc pas exercées (ni upload signé, ni URL signée). Elles sont isolées ici pour que le reste du lot
 * L2 (référentiels, véhicule, médias, prix) reste testable sans Storage : le service de médias
 * n'enregistre que des CHEMINS déjà déposés (`storagePath`) ou des URLs externes (`externalUrl`).
 *
 * Rappel doc 17 : un bucket public n'est pas protégé par RLS. Les documents privés restent dans un
 * bucket privé et sont servis par URL signée de courte durée (`STORAGE_SIGNED_URL_TTL_SECONDS`).
 */

export const DEFAULT_VEHICLE_IMAGE_BUCKET = "vehicle-images";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const MAX_SIGNED_URL_TTL_SECONDS = 3600;

export type StorageConfig = {
  supabaseUrl: string | null;
  serviceRoleKey: string | null;
  bucket: string;
  ttlSeconds: number;
};

export type SignedUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
};

export type VehicleStorageService = {
  readonly bucket: string;
  createSignedUrl(storagePath: string, options?: { ttlSeconds?: number }): Promise<string>;
  createSignedUploadUrl(storagePath: string): Promise<SignedUploadTarget>;
};

/** Lit la configuration de stockage ; aucune valeur secrète n'est journalisée ni retournée à l'UI. */
export function readStorageConfig(source: NodeJS.ProcessEnv = process.env): StorageConfig {
  const supabaseUrl = source.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;

  return {
    supabaseUrl,
    serviceRoleKey,
    bucket: source.SUPABASE_BUCKET_VEHICLE_IMAGES?.trim() || DEFAULT_VEHICLE_IMAGE_BUCKET,
    ttlSeconds: signedUrlTtlSeconds(source),
  };
}

/** TTL d'URL signée : borné à 1 h pour ne pas transformer un lien temporaire en lien permanent. */
export function signedUrlTtlSeconds(source: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(source.STORAGE_SIGNED_URL_TTL_SECONDS ?? "", 10);
  if (!Number.isInteger(raw) || raw <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.min(raw, MAX_SIGNED_URL_TTL_SECONDS);
}

export function isVehicleStorageConfigured(config: StorageConfig): boolean {
  return Boolean(config.supabaseUrl && config.serviceRoleKey);
}

/**
 * Construit le service Storage. Sans configuration, toute opération échoue avec `INTERNAL` : le
 * message par défaut (`lib/errors.ts`) ne révèle aucun détail d'infrastructure.
 */
export function createVehicleStorageService(
  config: StorageConfig = readStorageConfig(),
): VehicleStorageService {
  const ensureConfigured = (): { client: ReturnType<typeof createClient>; bucket: string } => {
    if (!isVehicleStorageConfigured(config) || !config.supabaseUrl || !config.serviceRoleKey) {
      throw new AppError("INTERNAL", "Service de stockage non configuré.");
    }

    return {
      client: createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      bucket: config.bucket,
    };
  };

  return {
    bucket: config.bucket,

    async createSignedUrl(storagePath: string, options?: { ttlSeconds?: number }): Promise<string> {
      const { client, bucket } = ensureConfigured();
      const ttl = options?.ttlSeconds ?? config.ttlSeconds;
      const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, ttl);

      if (error || !data?.signedUrl) {
        throw new AppError("INTERNAL", "URL signée indisponible.");
      }

      return data.signedUrl;
    },

    async createSignedUploadUrl(storagePath: string): Promise<SignedUploadTarget> {
      const { client, bucket } = ensureConfigured();
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(storagePath);

      if (error || !data) {
        throw new AppError("INTERNAL", "Téléversement signé indisponible.");
      }

      return {
        bucket,
        path: data.path,
        token: data.token,
        signedUrl: data.signedUrl,
      };
    },
  };
}