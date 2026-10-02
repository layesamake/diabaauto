"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeSavedSearchAction } from "@/app/my-diaba-auto/saved-searches-actions";
import { StatusMessage } from "@/components/auth/StatusMessage";
import { EmptyState } from "@/components/public/EmptyState";
import { toCatalogueQueryString } from "@/components/public/catalogue-query";
import { savedSearchesFr } from "@/lib/i18n/saved-searches.fr";
import type { SavedSearchView } from "@/services/saved-search.service";

/**
 * Liste des recherches enregistrées du client connecté (contrat lot 4 §2 « Sous-agent B »).
 *
 * Section autonome, consommée par `app/my-diaba-auto/page.tsx` — câblée par l'orchestrateur (hors
 * périmètre de ce sous-agent). Chaque recherche pointe vers `/voitures?<criteria_json reconstitué>`
 * via `toCatalogueQueryString` (réutilisé depuis `components/public/catalogue-query.ts`, jamais
 * redéfini ici).
 */
export function SavedSearchesList({ searches }: { searches: SavedSearchView[] }) {
  if (searches.length === 0) {
    return (
      <section aria-labelledby="recherches-enregistrees" className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 id="recherches-enregistrees" className="text-lg font-semibold text-[#011D4F]">
          {savedSearchesFr.sectionTitle}
        </h2>
        <div className="mt-4">
          <EmptyState title={savedSearchesFr.list.emptyTitle} body={savedSearchesFr.list.emptyBody} />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="recherches-enregistrees" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="recherches-enregistrees" className="text-lg font-semibold text-[#011D4F]">
        {savedSearchesFr.sectionTitle}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{savedSearchesFr.sectionIntro}</p>

      <ul className="mt-4 flex flex-col gap-3">
        {searches.map((search) => (
          <SavedSearchItem key={search.id} search={search} />
        ))}
      </ul>
    </section>
  );
}

function SavedSearchItem({ search }: { search: SavedSearchView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/voitures?${toCatalogueQueryString(search.criteria)}`;
  const createdOn = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(search.createdAt);

  async function handleRemove() {
    if (pending) return;
    if (typeof window !== "undefined" && !window.confirm(savedSearchesFr.list.removeConfirm)) {
      return;
    }

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("id", search.id);

    try {
      const result = await removeSavedSearchAction(formData);
      if ("error" in result) {
        setError(result.error.message);
      } else {
        router.refresh();
      }
    } catch {
      setError(savedSearchesFr.list.removeError);
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#011D4F]">{search.name}</p>
          <p className="mt-1 text-xs text-slate-600">{savedSearchesFr.list.createdOn(createdOn)}</p>
          <p className="mt-1 text-xs text-slate-600">
            {search.notificationsEnabled
              ? savedSearchesFr.list.notificationsOn
              : savedSearchesFr.list.notificationsOff}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={href}
            className="rounded-lg border border-[#0063DF] px-3 py-1.5 text-sm font-semibold text-[#0063DF] hover:bg-[#e8f4ff]"
          >
            {savedSearchesFr.list.openSearch}
          </a>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            aria-busy={pending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#95312a] hover:bg-[#fdf2f1] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? savedSearchesFr.list.removePending : savedSearchesFr.list.remove}
          </button>
        </div>
      </div>

      <StatusMessage tone="error" message={error ?? ""} />
    </li>
  );
}
