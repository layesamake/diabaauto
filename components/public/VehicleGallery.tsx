"use client";

import { useEffect, useState } from "react";
import type { CatalogueMediaItem } from "@/services/catalogue.service";
import { parseVideoEmbed } from "@/lib/media/video-embed";
import { VehiclePicture } from "@/components/public/VehiclePicture";
import { fr } from "@/lib/i18n";

/**
 * Galerie photo/vidéo de la fiche véhicule (doc 05 §3, contrat §B.2).
 *
 * Les URL proviennent exclusivement de `CatalogueMediaItem.url` (résolu par le service).
 *
 * Vidéos (décision T74) : un lien YouTube ou Vimeo est lu dans le lecteur de l'hébergeur, mais
 * l'iframe n'est créée **qu'au clic du visiteur**. Tant qu'il n'a rien demandé, aucune requête ne
 * part vers un tiers — ni cookie, ni octet, ni temps de chargement sur une connexion mobile.
 * YouTube passe par `youtube-nocookie.com`, seul domaine autorisé avec Vimeo par `frame-src`.
 *
 * Un lien non reconnu (fichier `.mp4` déposé dans le stockage) garde le lecteur natif : aucune
 * URL inconnue n'atterrit dans une iframe.
 */
export function VehicleGallery({
  items,
  title,
  placeholderLabel,
}: {
  items: CatalogueMediaItem[];
  title: string;
  placeholderLabel?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;

  // Changer de média arrête la vidéo en cours : l'iframe est retirée du document.
  useEffect(() => {
    setPlayingId(null);
  }, [activeId]);

  if (active === null) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200">
        <VehiclePicture url={null} alt={title} placeholderLabel={placeholderLabel} />
      </div>
    );
  }

  const embed = active.mediaType === "VIDEO" ? parseVideoEmbed(active.url) : null;

  return (
    <section aria-label={fr.vehicle.galleryTitle} className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-[#f4f7fb]">
        {active.mediaType !== "VIDEO" ? (
          <VehiclePicture url={active.url} alt={active.alt || title} sizes="(max-width: 1024px) 100vw, 60vw" priority />
        ) : embed === null ? (
          // Fichier vidéo déposé dans le stockage : lecteur natif, aucune tierce partie.
          <video
            controls
            preload="none"
            src={active.url}
            className="h-full w-full object-cover"
            aria-label={fr.vehicle.videoLabel}
          />
        ) : playingId === active.id ? (
          <iframe
            src={embed.embedUrl}
            title={fr.vehicle.videoLabel}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <VideoPoster
            thumbnailUrl={active.thumbnailUrl}
            alt={active.alt || title}
            onPlay={() => setPlayingId(active.id)}
          />
        )}
      </div>

      {items.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setActiveId(item.id)}
                aria-label={fr.vehicle.galleryThumbnail(index + 1)}
                aria-current={item.id === active.id ? true : undefined}
                className={`relative block h-16 w-24 overflow-hidden rounded-lg border ${
                  item.id === active.id ? "border-[#0063DF]" : "border-slate-200"
                }`}
              >
                <VehiclePicture
                  url={item.mediaType === "VIDEO" ? (item.thumbnailUrl ?? null) : item.url}
                  alt={item.alt || `${title} ${index + 1}`}
                  sizes="96px"
                  placeholderLabel={item.mediaType === "VIDEO" ? fr.vehicle.videoLabel : undefined}
                />

                {/* Une vidéo doit se reconnaître dans la bande de miniatures. */}
                {item.mediaType === "VIDEO" ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                    <PlayIcon className="h-6 w-6 text-white drop-shadow" />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Affiche de la vidéo : image d'aperçu si le média en porte une, sinon fond neutre. Aucune image
 * n'est demandée à l'hébergeur — ce serait déjà une requête tierce avant le clic.
 */
function VideoPoster({
  thumbnailUrl,
  alt,
  onPlay,
}: {
  thumbnailUrl: string | null;
  alt: string;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group absolute inset-0 flex h-full w-full items-center justify-center"
      aria-label={fr.vehicle.videoPlay}
    >
      {thumbnailUrl ? (
        <VehiclePicture url={thumbnailUrl} alt={alt} sizes="(max-width: 1024px) 100vw, 60vw" />
      ) : (
        <span className="absolute inset-0 bg-gradient-to-br from-[#011D4F] to-[#0354A3]" />
      )}

      <span className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/40" />

      <span className="relative flex flex-col items-center gap-2 text-white">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
          <PlayIcon className="ml-1 h-7 w-7 text-[#011D4F]" />
        </span>
        <span className="text-sm font-semibold">{fr.vehicle.videoPlay}</span>
        <span className="max-w-xs px-4 text-center text-xs text-white/80">{fr.vehicle.videoPrivacy}</span>
      </span>
    </button>
  );
}

function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a.5.5 0 0 0 .76.43l11.54-6.86a.5.5 0 0 0 0-.86L8.76 4.71a.5.5 0 0 0-.76.43Z" />
    </svg>
  );
}
