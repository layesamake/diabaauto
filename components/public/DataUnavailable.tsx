import { CatalogueLink } from "@/components/public/EmptyState";
import { fr } from "@/lib/i18n";

/**
 * Écran d'indisponibilité / d'entrée refusée (doc 05 §7 : « erreur serveur générique sans donnée
 * sensible »). La cause technique n'est jamais affichée : seuls un titre et un message en français.
 */
export function DataUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-slate-200 bg-[#f4f7fb] px-4 py-10 text-center"
    >
      <h2 className="text-lg font-semibold text-[#011D4F]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{body}</p>
      <div className="mt-5 flex justify-center">
        <CatalogueLink label={fr.common.backToCatalogue} />
      </div>
    </div>
  );
}