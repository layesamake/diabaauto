"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useCallback, type DragEvent } from "react";
import { uploadVehicleImagesAction, type UploadActionState } from "@/app/admin/actions";
import { MAX_IMAGES_PER_VEHICLE, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/media-constants";

/**
 * Panneau d'upload multi-images pour le backoffice véhicule.
 *
 * Deux modes d'ajout :
 * - Sélection de fichiers (drag-and-drop ou clic) depuis l'ordinateur.
 * - Collage d'une URL d'image.
 *
 * Limite : 5 images max par véhicule (existantes + nouvelles).
 * Chaque image est optimisée côté serveur (WebP, resize, thumbnail).
 */

type PendingImage =
  | { type: "file"; file: File; preview: string }
  | { type: "url"; url: string };

const ACCEPTED_TYPES: readonly string[] = ACCEPTED_IMAGE_MIME_TYPES;

export function ImageUploadPanel({
  vehicleId,
  existingImageCount,
}: {
  vehicleId: string;
  existingImageCount: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadActionState | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const remaining = MAX_IMAGES_PER_VEHICLE - existingImageCount - pending.length;

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: PendingImage[] = [];
      const fileArray = Array.from(files);

      for (const file of fileArray) {
        if (newItems.length + pending.length >= MAX_IMAGES_PER_VEHICLE - existingImageCount) break;
        if (!ACCEPTED_TYPES.includes(file.type)) continue;

        newItems.push({
          type: "file",
          file,
          preview: URL.createObjectURL(file),
        });
      }

      if (newItems.length > 0) {
        setPending((prev) => [...prev, ...newItems]);
        setResult(null);
      }
    },
    [pending.length, existingImageCount],
  );

  function addUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    } catch {
      return;
    }

    if (remaining <= 0) return;

    setPending((prev) => [...prev, { type: "url", url: trimmed }]);
    setUrlInput("");
    setResult(null);
  }

  function removeItem(index: number) {
    setPending((prev) => {
      const item = prev[index];
      if (item.type === "file") {
        URL.revokeObjectURL(item.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleUpload() {
    if (pending.length === 0 || uploading) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.set("vehicleId", vehicleId);

    // Fichiers
    for (const item of pending) {
      if (item.type === "file") {
        formData.append("files", item.file);
      }
    }

    // URLs
    const urls = pending.filter((item) => item.type === "url").map((item) => (item as { type: "url"; url: string }).url);
    if (urls.length > 0) {
      formData.set("urls", JSON.stringify(urls));
    }

    try {
      const actionResult = await uploadVehicleImagesAction(formData);
      setResult(actionResult);

      if ("data" in actionResult) {
        // Révoquer les previews et vider la file
        for (const item of pending) {
          if (item.type === "file") {
            URL.revokeObjectURL(item.preview);
          }
        }
        setPending([]);
        router.refresh();
      }
    } catch {
      setResult({ error: { code: "INTERNAL", message: "L'upload n'a pas pu aboutir. Réessayez." } });
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  const canAdd = remaining > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Compteur */}
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-[#011D4F]">{existingImageCount + pending.length}</span>
        {" / "}
        {MAX_IMAGES_PER_VEHICLE} images
        {remaining > 0 && pending.length === 0
          ? ` — vous pouvez en ajouter ${remaining}`
          : remaining <= 0 && pending.length === 0
            ? " — limite atteinte"
            : null}
      </p>

      {/* Zone de drop */}
      {canAdd ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
            dragOver
              ? "border-[#0063DF] bg-[#e8f4ff]"
              : "border-slate-300 bg-slate-50 hover:border-[#0063DF] hover:bg-[#f0f7ff]"
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <svg
            className="h-8 w-8 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
            />
          </svg>
          <p className="text-sm font-medium text-slate-700">
            Glissez des images ici ou cliquez pour sélectionner
          </p>
          <p className="text-xs text-slate-500">JPEG, PNG, WebP, AVIF — 10 Mo max par image</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                addFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      ) : null}

      {/* Input URL */}
      {canAdd ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://exemple.com/image.jpg"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#071525] placeholder:text-slate-400 focus:border-[#0063DF] focus:outline-none"
          />
          <button
            type="button"
            onClick={addUrl}
            disabled={!urlInput.trim()}
            className="rounded-lg border border-[#0063DF] px-4 py-2 text-sm font-semibold text-[#0063DF] hover:bg-[#e8f4ff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ajouter l&apos;URL
          </button>
        </div>
      ) : null}

      {/* Previews des images en attente */}
      {pending.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {pending.map((item, index) => (
            <div key={index} className="group relative">
              <div className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {item.type === "file" ? (
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-2">
                    <svg
                      className="h-6 w-6 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.06 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                      />
                    </svg>
                    <span className="line-clamp-2 text-center text-xs text-slate-500">
                      {item.url}
                    </span>
                  </div>
                )}
              </div>
              {/* Bouton de suppression */}
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#b42318] text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                aria-label="Retirer cette image"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
              {/* Nom */}
              <p className="mt-1 truncate text-xs text-slate-500">
                {item.type === "file" ? item.file.name : "URL"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Bouton upload */}
      {pending.length > 0 ? (
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          aria-busy={uploading}
          className="self-start rounded-lg bg-[#0063DF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading
            ? "Optimisation et téléversement…"
            : `Téléverser ${pending.length} image${pending.length > 1 ? "s" : ""}`}
        </button>
      ) : null}

      {/* Messages de résultat */}
      {result && "data" in result ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-medium text-green-800">{result.data.message}</p>
          {result.data.results.some((r) => !r.ok) ? (
            <ul className="mt-2 space-y-1">
              {result.data.results
                .filter((r) => !r.ok)
                .map((r, i) => (
                  <li key={i} className="text-xs text-red-700">
                    {!r.ok && r.source} : {!r.ok && r.error}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : result && "error" in result ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{result.error.message}</p>
        </div>
      ) : null}
    </div>
  );
}
