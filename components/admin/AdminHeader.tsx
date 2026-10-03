import type { ReactNode } from "react";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Clés d'écran du back-office.
 *
 * Elles servaient à marquer le lien courant dans l'en-tête. La navigation vit désormais dans
 * `app/admin/layout.tsx`, qui déduit l'écran courant du chemin : ces clés ne sont plus nécessaires.
 * Le type reste exporté le temps que les pages cessent de passer `current`, sans valeur fonctionnelle.
 */
export type AdminScreenKey =
  | "vehicules"
  | "referentiels"
  | "prospects"
  | "demandes"
  | "clients"
  | "revendeurs"
  | "commandes"
  | "personnel"
  | "compte";

/**
 * En-tête d'un écran du back-office : son titre, sa phrase d'explication et la déconnexion.
 *
 * Il ne porte PLUS de navigation. Elle était répétée dans chaque page, obligeait à transmettre les
 * permissions partout, et doublait les rubriques de l'accueil. Elle est maintenant rendue une seule
 * fois par l'enveloppe du back-office.
 */
export function AdminHeader(props: {
  /** Conservé pour ne pas modifier les quatorze pages d'un coup ; la navigation ne s'en sert plus. */
  permissions?: readonly PermissionCode[];
  title: string;
  subtitle: string;
  logout?: ReactNode;
  /** Idem : la barre latérale déduit l'écran courant du chemin. */
  current?: AdminScreenKey | null;
}) {
  const { title, subtitle, logout } = props;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-[#011D4F]">{title}</h1>
        <p className="mt-2 text-slate-600">{subtitle}</p>
      </div>
      {logout}
    </div>
  );
}
