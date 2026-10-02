"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import { addMediaAction, removeMediaAction, setPrimaryMediaAction } from "@/app/admin/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField, AdminTextField } from "@/components/admin/AdminFields";
import {
  DOCUMENT_VISIBILITIES,
  DOCUMENT_VISIBILITY_LABELS,
  MEDIA_TYPES,
  MEDIA_TYPE_LABELS,
  orEmpty,
  type SelectOption,
} from "@/components/admin/admin-view";
import { StatusMessage } from "@/components/auth/StatusMessage";
import type { MediaRow } from "@/services/media.service";

/**
 * Panneau médias d'un véhicule (doc 03 §7, contrat L2 §2.4).
 *
 * Aucun identifiant Supabase n'étant configuré (D15), l'upload de fichier n'est pas exercé : une
 * image est enregistrée par le chemin d'un fichier déjà déposé dans le bucket, une vidéo par son URL
 * externe. Le service est le seul juge (un média principal doit être une image publique).
 */

const MEDIA_TYPE_OPTIONS: SelectOption[] = MEDIA_TYPES.map((type) => ({ value: type, label: MEDIA_TYPE_LABELS[type] }));
const VISIBILITY_OPTIONS: SelectOption[] = DOCUMENT_VISIBILITIES.map((visibility) => ({
  value: visibility,
  label: DOCUMENT_VISIBILITY_LABELS[visibility],
}));

export function MediaPanel({
  vehicleId,
  media,
  canEdit,
}: {
  vehicleId: string;
  media: MediaRow[];
  canEdit: boolean;
}) {
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

      {canEdit ? (
        <AdminForm
          action={addMediaAction}
          submitLabel="Ajouter le média"
          pendingLabel="Ajout…"
          resetOnSuccess
          className="mt-4 flex flex-col gap-4 border-t border-slate-200 pt-4"
        >
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminSelectField
              id="media-type"
              name="mediaType"
              label="Type de média"
              required
              defaultValue="IMAGE"
              options={MEDIA_TYPE_OPTIONS}
            />
            <AdminSelectField
              id="media-visibility"
              name="visibility"
              label="Visibilité"
              defaultValue="PUBLIC"
              options={VISIBILITY_OPTIONS}
            />
            <AdminTextField
              id="media-storage-path"
              name="storagePath"
              label="Chemin de stockage (image)"
              hint="Chemin déjà déposé dans le bucket « vehicle-images ». Requis pour une image."
            />
            <AdminTextField
              id="media-external-url"
              name="externalUrl"
              label="URL externe (vidéo)"
              type="url"
              hint="Requise pour une vidéo ; interdite pour une image."
            />
            <AdminTextField id="media-thumbnail" name="thumbnailPath" label="Chemin de la vignette" />
            <AdminTextField id="media-category" name="category" label="Catégorie" placeholder="Extérieur, intérieur…" />
          </div>
        </AdminForm>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          Votre compte ne porte pas la permission d&apos;édition des véhicules : les médias sont affichés en lecture
          seule.
        </p>
      )}

      {media.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Liste des médias du véhicule</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-3">Type</th>
                <th scope="col" className="py-2 pr-3">Référence du fichier</th>
                <th scope="col" className="py-2 pr-3">Catégorie</th>
                <th scope="col" className="py-2 pr-3">Visibilité</th>
                <th scope="col" className="py-2 pr-3">Ordre</th>
                <th scope="col" className="py-2 pr-3">Statut</th>
                <th scope="col" className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {media.map((item) => (
                <MediaRowItem key={item.id} media={item} canEdit={canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function MediaRowItem({ media, canEdit }: { media: MediaRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<AdminActionState | null>(null);

  const isPrimaryImage = media.mediaType === "IMAGE" && media.visibility === "PUBLIC";

  async function run(action: (formData: FormData) => Promise<AdminActionState>, field: string, value: string) {
    if (pending) {
      return;
    }

    const formData = new FormData();
    formData.set(field, value);
    setPending(true);

    try {
      const result = await action(formData);
      setState(result);
      if ("data" in result) {
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: "L'opération n'a pas pu aboutir. Réessayez." } });
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-3">{MEDIA_TYPE_LABELS[media.mediaType]}</td>
      <td className="py-2 pr-3 break-all text-slate-700">{orEmpty(media.storagePath ?? media.externalUrl)}</td>
      <td className="py-2 pr-3">{orEmpty(media.category)}</td>
      <td className="py-2 pr-3">{DOCUMENT_VISIBILITY_LABELS[media.visibility]}</td>
      <td className="py-2 pr-3">{media.displayOrder}</td>
      <td className="py-2 pr-3">
        {media.isPrimary ? (
          <span className="rounded-full bg-[#e8f4ff] px-2 py-0.5 text-xs font-semibold text-[#0354A3]">Principal</span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </td>
      <td className="py-2">
        {canEdit ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !isPrimaryImage || media.isPrimary}
                aria-busy={pending}
                onClick={() => run(setPrimaryMediaAction, "mediaId", media.id)}
                className="rounded-lg border border-[#0063DF] px-3 py-1 text-xs font-semibold text-[#0063DF] hover:bg-[#e8f4ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Désigner comme principal
              </button>
              <button
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={() => {
                  if (window.confirm("Supprimer définitivement ce média ?")) {
                    void run(removeMediaAction, "mediaId", media.id);
                  }
                }}
                className="rounded-lg border border-[#b42318] px-3 py-1 text-xs font-semibold text-[#95312a] hover:bg-[#fdf2f1] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Supprimer
              </button>
            </div>
            <StatusMessage tone="error" message={state && "error" in state ? state.error.message : ""} />
          </div>
        ) : (
          <span className="text-slate-500">Lecture seule</span>
        )}
      </td>
    </tr>
  );
}
