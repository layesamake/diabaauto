"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import {
  addMediaAction,
  removeMediaAction,
  reoptimizeMediaAction,
  setPrimaryMediaAction,
} from "@/app/admin/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminTextField } from "@/components/admin/AdminFields";
import { ImageUploadPanel } from "@/components/admin/ImageUploadPanel";
import {
  DOCUMENT_VISIBILITY_LABELS,
  MEDIA_TYPE_LABELS,
} from "@/components/admin/admin-view";
import { formatSize } from "@/lib/format-size";
import type { MediaRow } from "@/services/media.service";

/**
 * Panneau médias d'un véhicule (doc 03 §7, contrat L2 §2.4).
 *
 * Deux sections :
 * 1. Upload d'images : drag-and-drop / sélection de fichier / collage d'URL,
 *    avec optimisation automatique (WebP, resize, thumbnail).
 * 2. Ajout de vidéo : formulaire texte pour URL externe.
 *
 * Le service reste le seul juge (un média principal doit être une image publique).
 */

export function MediaPanel({
  vehicleId,
  media,
  canEdit,
}: {
  vehicleId: string;
  media: MediaRow[];
  canEdit: boolean;
}) {
  const imageCount = media.filter((m) => m.mediaType === "IMAGE").length;

  return (
    <section aria-labelledby="media-panel" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="media-panel" className="text-lg font-semibold text-[#011D4F]">
        Médias
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {media.length > 0
          ? `${media.length} média(s) enregistré(s).`
          : "Aucun média enregistré. La publication exige une image principale publique."}
      </p>

      {/* Galerie des médias existants */}
      {media.length > 0 ? (
        <MediaGrid media={media} canEdit={canEdit} />
      ) : null}

      {/* Upload d'images */}
      {canEdit ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-[#011D4F]">Ajouter des images</h3>
          <p className="mt-1 text-xs text-slate-500">
            Les images sont automatiquement optimisées pour le web (conversion WebP, redimensionnement, miniature).
          </p>
          <div className="mt-3">
            <ImageUploadPanel vehicleId={vehicleId} existingImageCount={imageCount} />
          </div>
        </div>
      ) : null}

      {/* Ajout de vidéo (formulaire texte simple, conservé) */}
      {canEdit ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-[#011D4F]">Ajouter une vidéo</h3>
          <AdminForm
            action={addMediaAction}
            submitLabel="Ajouter la vidéo"
            pendingLabel="Ajout…"
            resetOnSuccess
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <input type="hidden" name="mediaType" value="VIDEO" />
            <input type="hidden" name="visibility" value="PUBLIC" />
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminTextField
                id="video-external-url"
                name="externalUrl"
                label="URL de la vidéo"
                type="url"
                hint="Lien YouTube, Vimeo ou autre hébergeur vidéo."
                required
              />
              <AdminTextField
                id="video-category"
                name="category"
                label="Catégorie"
                placeholder="Extérieur, intérieur…"
              />
            </div>
          </AdminForm>
        </div>
      ) : null}

      {!canEdit ? (
        <p className="mt-4 text-sm text-slate-600">
          Votre compte ne porte pas la permission d&apos;édition des véhicules : les médias sont affichés en lecture
          seule.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Grille de médias existants avec miniatures
// ---------------------------------------------------------------------------

function MediaGrid({ media, canEdit }: { media: MediaRow[]; canEdit: boolean }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {media.map((item) => (
        <MediaCard key={item.id} media={item} canEdit={canEdit} />
      ))}
    </div>
  );
}

function MediaCard({ media, canEdit }: { media: MediaRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isPrimaryImage = media.mediaType === "IMAGE" && media.visibility === "PUBLIC";
  const thumbnailSrc =
    media.mediaType === "IMAGE" && media.storagePath
      ? `/api/media/${media.id}?v=thumb`
      : null;

  async function run(action: (formData: FormData) => Promise<AdminActionState>, field: string, value: string) {
    if (pending) return;

    const formData = new FormData();
    formData.set(field, value);
    setPending(true);
    setError("");

    try {
      const result = await action(formData);
      if ("data" in result) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("Opération échouée.");
    } finally {
      setPending(false);
    }
  }

  async function reoptimize() {
    if (pending) return;

    const formData = new FormData();
    formData.set("mediaId", media.id);
    setPending(true);
    setError("");
    setInfo("");

    try {
      const response = await reoptimizeMediaAction(formData);
      if ("error" in response) {
        setError(response.error.message);
        return;
      }

      const outcome = response.data.result;
      if (outcome.ok && outcome.changed) {
        setInfo(`${formatSize(outcome.beforeBytes)} → ${formatSize(outcome.afterBytes)}`);
        router.refresh();
      } else {
        setInfo("Déjà optimisée.");
      }
    } catch {
      setError("Opération échouée.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="group relative flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Miniature */}
      <div className="relative aspect-[4/3] bg-slate-100">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : media.mediaType === "VIDEO" ? (
          <div className="flex h-full items-center justify-center">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}

        {/* Badge principal */}
        {media.isPrimary ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-[#0063DF] px-2 py-0.5 text-[10px] font-bold text-white shadow">
            Principal
          </span>
        ) : null}

        {/* Badge type */}
        <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {MEDIA_TYPE_LABELS[media.mediaType]}
        </span>
      </div>

      {/* Infos */}
      <div className="flex flex-1 flex-col gap-1 px-2.5 py-2">
        <p className="truncate text-xs text-slate-500">
          {media.category ?? DOCUMENT_VISIBILITY_LABELS[media.visibility]}
        </p>
        <p className="text-[10px] text-slate-400">Ordre : {media.displayOrder}</p>
      </div>

      {/* Actions */}
      {canEdit ? (
        <div className="flex border-t border-slate-100">
          {isPrimaryImage && !media.isPrimary ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(setPrimaryMediaAction, "mediaId", media.id)}
              className="flex-1 py-1.5 text-[11px] font-medium text-[#0063DF] hover:bg-[#f0f7ff] disabled:opacity-50"
              title="Désigner comme image principale"
            >
              Principal
            </button>
          ) : (
            <span className="flex-1" />
          )}
          {media.mediaType === "IMAGE" && media.storagePath ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void reoptimize()}
              className="border-l border-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Recompresser cette image pour le web"
            >
              Optimiser
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Supprimer définitivement ce média ?")) {
                void run(removeMediaAction, "mediaId", media.id);
              }
            }}
            className="border-l border-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-[#b42318] hover:bg-[#fdf2f1] disabled:opacity-50"
            title="Supprimer ce média"
          >
            Supprimer
          </button>
        </div>
      ) : null}

      {info ? <p className="px-2 pb-1.5 text-[10px] text-slate-500">{info}</p> : null}

      {/* Erreur */}
      {error ? (
        <p className="px-2 pb-1.5 text-[10px] text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
