import { findPublicMedia } from "@/repositories/public-media.repository";
import { createVehicleStorageService, signedUrlTtlSeconds } from "@/lib/storage/vehicle-storage";
import { resolveMediaRedirect } from "@/services/media-delivery.service";

/**
 * Livraison des médias du bucket privé `vehicle-images` : vérifie que le média est public et que la
 * fiche est publiée, puis redirige (302) vers une URL signée de courte durée. Aucun octet ne transite
 * par cette fonction. Route publique, lecture seule.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const variant = new URL(request.url).searchParams.get("v");

  try {
    const storage = createVehicleStorageService();
    const redirect = await resolveMediaRedirect(id, variant, {
      findPublicMedia,
      signUrl: (path, ttl) => storage.createSignedUrl(path, { ttlSeconds: ttl }),
      ttlSeconds: signedUrlTtlSeconds(),
    });

    if (!redirect) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirect.url,
        "Cache-Control": `public, max-age=${redirect.cacheSeconds}, s-maxage=${redirect.cacheSeconds}`,
      },
    });
  } catch {
    // Panne de stockage ou de base : jamais un 404 (qui masquerait l'incident), aucun détail exposé.
    return new Response("Service unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
