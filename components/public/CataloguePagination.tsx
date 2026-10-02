import Link from "next/link";
import { buildListHref } from "@/components/public/catalogue-query";
import { fr } from "@/lib/i18n";

/**
 * Pagination serveur : chaque lien est une URL complète portant les filtres actifs (contrat §3.8).
 * Aucune donnée n'est rechargée côté client.
 */
export function CataloguePagination({
  basePath,
  query,
  page,
  pageCount,
}: {
  basePath: string;
  query: string;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const windowSize = 5;
  const start = Math.max(1, Math.min(page - 2, pageCount - windowSize + 1));
  const end = Math.min(pageCount, start + windowSize - 1);
  const pages: number[] = [];
  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }

  const linkClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-[#011D4F] hover:border-[#0063DF]";
  const currentClass = "rounded-lg bg-[#011D4F] px-3 py-2 text-sm font-semibold text-white";
  const disabledClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-400";

  return (
    <nav aria-label={fr.catalogue.paginationLabel} className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={buildListHref(basePath, query, page - 1)} rel="prev" className={linkClass}>
          {fr.catalogue.previousPage}
        </Link>
      ) : (
        <span aria-hidden="true" className={disabledClass}>
          {fr.catalogue.previousPage}
        </span>
      )}

      {pages.map((current) =>
        current === page ? (
          <span key={current} aria-current="page" className={currentClass}>
            {current}
          </span>
        ) : (
          <Link key={current} href={buildListHref(basePath, query, current)} className={linkClass}>
            {current}
          </Link>
        ),
      )}

      {page < pageCount ? (
        <Link href={buildListHref(basePath, query, page + 1)} rel="next" className={linkClass}>
          {fr.catalogue.nextPage}
        </Link>
      ) : (
        <span aria-hidden="true" className={disabledClass}>
          {fr.catalogue.nextPage}
        </span>
      )}

      <p className="w-full text-center text-xs text-slate-500">
        {fr.catalogue.pageIndicator(page, pageCount)}
      </p>
    </nav>
  );
}