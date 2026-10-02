import Link from "next/link";
import type { ReactNode } from "react";

/**
 * État vide utile (doc 05 §7 : « empty state utile avec CTA »).
 * Le ton reste neutre : aucun résultat n'est jamais présenté comme une erreur serveur.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-[#f4f7fb] px-4 py-10 text-center">
      <h2 className="text-lg font-semibold text-[#011D4F]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Raccourci CTA « voir tout le catalogue », réutilisé par les états vides et les erreurs gérées. */
export function CatalogueLink({ label }: { label: string }) {
  return (
    <Link
      href="/voitures"
      className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
    >
      {label}
    </Link>
  );
}