import Image from "next/image";
import { MediaPlaceholder } from "@/components/public/MediaPlaceholder";

/**
 * Média public d'un véhicule (contrat §B.2).
 *
 * L'URL provient exclusivement de `resolvePublicMediaUrl` (côté service) : aucune URL n'est
 * construite ici. Si aucune URL n'est disponible, un repli visuel propre est affiché — jamais de
 * lien cassé ni de média privé.
 *
 * `unoptimized` : `next.config.ts` (hors périmètre de ce lot) ne déclare aucun `images.remotePatterns`
 * pour le domaine de stockage ; le chargeur d'optimisation refuserait ces URL distantes.
 */
export function VehiclePicture({
  url,
  alt,
  sizes = "100vw",
  priority = false,
  className = "",
  placeholderLabel,
}: {
  url: string | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  placeholderLabel?: string;
}) {
  if (!url) {
    return <MediaPlaceholder label={placeholderLabel} className={`h-full w-full ${className}`} />;
  }

  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized
      className={`object-cover ${className}`}
    />
  );
}