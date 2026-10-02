import type { ReactNode } from "react";
import Link from "next/link";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Clés d'écran du back-office, utilisées pour marquer le lien courant.
 * Le lot 5 ajoute Prospects, Demandes, Clients et Revendeurs ; Commandes, Personnel et Audit
 * arrivent aux lots suivants (app/admin/page.tsx).
 */
export type AdminScreenKey =
  | "vehicules"
  | "referentiels"
  | "prospects"
  | "demandes"
  | "clients"
  | "revendeurs"
  | "commandes";

/**
 * En-tête du back-office : titre, navigation et déconnexion.
 *
 * La navigation n'expose un écran que si l'acteur porte la permission correspondante : un membre du
 * personnel sans `content.manage` ne voit pas le lien vers les référentiels. Le lien n'est qu'une
 * aide — la garde réelle reste appliquée par la page cible.
 */
export function AdminHeader({
  permissions,
  title,
  subtitle,
  logout,
  current,
}: {
  permissions: readonly PermissionCode[];
  title: string;
  subtitle: string;
  logout?: ReactNode;
  current?: AdminScreenKey | null;
}) {
  const links = [
    { href: "/admin/vehicules", label: "Véhicules", key: "vehicules" as const, allowed: permissions.includes("vehicle.view") },
    {
      href: "/admin/referentiels",
      label: "Référentiels",
      key: "referentiels" as const,
      allowed: permissions.includes("content.manage"),
    },
    {
      href: "/admin/prospects",
      label: "Prospects",
      key: "prospects" as const,
      allowed: permissions.includes("lead.view"),
    },
    {
      href: "/admin/demandes",
      label: "Demandes",
      key: "demandes" as const,
      allowed: permissions.includes("lead.view"),
    },
    {
      href: "/admin/clients",
      label: "Clients",
      key: "clients" as const,
      allowed: permissions.includes("customer.view"),
    },
    {
      href: "/admin/revendeurs",
      label: "Revendeurs",
      key: "revendeurs" as const,
      allowed: permissions.includes("reseller.view"),
    },
    {
      href: "/admin/commandes",
      label: "Commandes",
      key: "commandes" as const,
      allowed: permissions.includes("order.view"),
    },
  ].filter((link) => link.allowed);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-[#011D4F]">{title}</h1>
        <p className="mt-2 text-slate-600">{subtitle}</p>
        {links.length > 0 ? (
          <nav aria-label="Navigation du back-office" className="mt-3 flex flex-wrap gap-4">
            <Link href="/admin" className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
              Accueil back-office
            </Link>
            {links.map((link) =>
              current === link.key ? (
                <span key={link.key} aria-current="page" className="text-sm font-semibold text-slate-500">
                  {link.label}
                </span>
              ) : (
                <Link
                  key={link.key}
                  href={link.href}
                  className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        ) : null}
      </div>
      {logout}
    </div>
  );
}
