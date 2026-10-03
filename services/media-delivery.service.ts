import { z } from "zod";

/**
 * Livraison des médias publics du bucket PRIVÉ `vehicle-images`.
 *
 * Le bucket n'est plus public : une image n'est lisible que par une URL signée de courte durée,
 * émise ici APRÈS vérification que le média est PUBLIC et que sa fiche est publiée et non archivée.
 * Un brouillon, une fiche archivée ou un média privé répondent tous « introuvable » (aucune
 * distinction observable : l'existence d'un média non publié n'est pas révélée).
 *
 * Module pur : la lecture en base et la signature sont injectées (testable sans Prisma ni Supabase).
 */

export type PublicMediaRecord = {
  storagePath: string | null;
  thumbnailPath: string | null;
};

export type MediaDeliveryDependencies = {
  /** Média PUBLIC d'une fiche publiée et non archivée ; `null` sinon. */
  findPublicMedia(id: string): Promise<PublicMediaRecord | null>;
  /** URL signée du chemin donné, valable `ttlSeconds`. */
  signUrl(storagePath: string, ttlSeconds: number): Promise<string>;
  ttlSeconds: number;
};

export type MediaRedirect = {
  url: string;
  /** Durée de mise en cache de la redirection : toujours strictement inférieure à la validité de l'URL. */
  cacheSeconds: number;
};

const idSchema = z.string().trim().uuid();

export function parseMediaVariant(value: unknown): "full" | "thumb" {
  return value === "thumb" ? "thumb" : "full";
}

/**
 * Résout la redirection d'un média public. `null` = introuvable (identifiant invalide, média non
 * public, fiche non publiée, ou aucun fichier pour la variante demandée). Une erreur de signature
 * est propagée : l'appelant répond 503, jamais 404, pour ne pas masquer une panne de stockage.
 */
export async function resolveMediaRedirect(
  id: unknown,
  variant: unknown,
  dependencies: MediaDeliveryDependencies,
): Promise<MediaRedirect | null> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const media = await dependencies.findPublicMedia(parsedId.data);
  if (!media) {
    return null;
  }

  const path = (parseMediaVariant(variant) === "thumb" ? media.thumbnailPath : media.storagePath)?.trim();
  if (!path) {
    return null;
  }

  const url = await dependencies.signUrl(path, dependencies.ttlSeconds);

  return { url, cacheSeconds: Math.max(0, Math.floor(dependencies.ttlSeconds / 2)) };
}
