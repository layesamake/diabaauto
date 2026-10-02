"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fr } from "@/lib/i18n";

/**
 * Recherche rapide de l'accueil : redirige vers le catalogue en gardant la requête dans l'URL
 * (la recherche est ensuite lue côté serveur par le catalogue).
 */
export function QuickSearchForm() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = search.trim();
    router.push(trimmed === "" ? "/voitures" : `/voitures?search=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="accueil-recherche" className="text-sm font-medium text-[#011D4F]">
          {fr.home.searchTitle}
        </label>
        <input
          id="accueil-recherche"
          name="search"
          type="search"
          value={search}
          placeholder={fr.common.searchPlaceholder}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#071525] focus:border-[#0063DF]"
        />
      </div>

      <button
        type="submit"
        className="rounded-lg bg-[#0063DF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0354A3]"
      >
        {fr.home.searchCta}
      </button>
    </form>
  );
}