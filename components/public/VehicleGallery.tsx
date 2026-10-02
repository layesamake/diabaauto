"use client";

import { useState } from "react";
import type { CatalogueMediaItem } from "@/services/catalogue.service";
import { VehiclePicture } from "@/components/public/VehiclePicture";
import { fr } from "@/lib/i18n";

/**
 * Galerie photo/vidéo de la fiche véhicule (doc 05 §3, contrat §B.2).
 *
 * Les URL proviennent exclusivement de `CatalogueMediaItem.url` (résolu par le service). Un média
 * vidéo est rendu avec un élément `video` natif — aucune iframe tierce n'est injectée.
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
  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;

  if (active === null) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200">
        <VehiclePicture url={null} alt={title} placeholderLabel={placeholderLabel} />
      </div>
    );
  }

  return (
    <section aria-label={fr.vehicle.galleryTitle} className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-[#f4f7fb]">
        {active.mediaType === "VIDEO" ? (
          <video
            controls
            preload="none"
            src={active.url}
            className="h-full w-full object-cover"
            aria-label={fr.vehicle.videoLabel}
          />
        ) : (
          <VehiclePicture url={active.url} alt={active.alt || title} sizes="(max-width: 1024px) 100vw, 60vw" priority />
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
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}