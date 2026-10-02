"use client";

import { useState } from "react";
import { createSavedSearchAction, type SavedSearchActionState } from "@/app/my-diaba-auto/saved-searches-actions";
import { StatusMessage } from "@/components/auth/StatusMessage";
import { savedSearchesFr } from "@/lib/i18n/saved-searches.fr";
import type { CatalogueFilters } from "@/services/catalogue.service";

/**
 * Bouton d'enregistrement d'une recherche (contrat lot 4 §2 « Sous-agent B »).
 *
 * Composant client autonome : reçoit les filtres courants et l'état d'authentification en props,
 * n'appelle jamais directement un repository. Pas de sauvegarde anonyme — un visiteur voit un message
 * explicite au lieu d'un formulaire (aucune donnée visiteur en base, contrat §2).
 *
 * **N'est PAS câblé dans `app/(public)/voitures/page.tsx`** : l'intégration revient à l'orchestrateur
 * (contrat §2, pour éviter un conflit d'édition concurrent sur un fichier partagé).
 */
export function SaveSearchButton({
  filters,
  isAuthenticated,
}: {
  filters: CatalogueFilters;
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SavedSearchActionState | null>(null);

  if (!isAuthenticated) {
    return (
      <p className="rounded-lg border border-slate-200 bg-[#f4f7fb] px-3 py-2 text-sm text-slate-600">
        {savedSearchesFr.saveButton.signInRequired}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState(null);
        }}
        className="rounded-lg border border-[#0063DF] px-4 py-2 text-sm font-semibold text-[#0063DF] hover:bg-[#e8f4ff]"
      >
        {savedSearchesFr.saveButton.label}
      </button>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData();
    formData.set("name", name);
    formData.set("notificationsEnabled", notificationsEnabled ? "true" : "false");
    formData.set("filters", JSON.stringify(filters));

    setPending(true);
    try {
      const result = await createSavedSearchAction(formData);
      setState(result);
      if ("data" in result) {
        setName("");
        setNotificationsEnabled(false);
        setOpen(false);
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: savedSearchesFr.saveButton.genericError } });
    } finally {
      setPending(false);
    }
  }

  const errorMessage = state && "error" in state ? state.error.message : "";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <StatusMessage tone="error" message={errorMessage} />

      <div>
        <label htmlFor="saved-search-name" className="text-sm font-medium text-[#011D4F]">
          {savedSearchesFr.form.nameLabel}
        </label>
        <input
          id="saved-search-name"
          name="name"
          type="text"
          value={name}
          maxLength={80}
          required
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#071525] focus:border-[#0063DF]"
        />
        <p className="mt-1 text-xs text-slate-600">{savedSearchesFr.form.nameHint}</p>
      </div>

      <label className="flex items-start gap-2 text-sm text-[#011D4F]">
        <input
          type="checkbox"
          checked={notificationsEnabled}
          disabled={pending}
          onChange={(event) => setNotificationsEnabled(event.target.checked)}
          className="mt-1"
        />
        <span>
          {savedSearchesFr.form.notificationsLabel}
          <span className="block text-xs text-slate-600">{savedSearchesFr.form.notificationsHint}</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? savedSearchesFr.saveButton.pending : savedSearchesFr.form.submit}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setState(null);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F]"
        >
          {savedSearchesFr.form.cancel}
        </button>
      </div>
    </form>
  );
}
