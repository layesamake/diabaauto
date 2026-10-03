"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { allowedAdminNav } from "@/components/admin/admin-nav";
import { RubricIcon } from "@/components/admin/RubricIcon";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Barre latérale du back-office.
 *
 * L'écran courant est déduit du chemin, et non d'une propriété à passer dans chaque page : une page
 * ajoutée plus tard est marquée sans qu'on y pense, et aucune ne peut mentir sur l'endroit où elle
 * se trouve.
 */
export function AdminSidebar({ permissions }: { permissions: readonly PermissionCode[] }) {
  const pathname = usePathname();
  const groups = allowedAdminNav(permissions);

  /** `/admin` ne doit s'allumer que sur lui-même, sinon il resterait actif partout. */
  const estCourant = (href: string): boolean =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  /**
   * « Contacts » reste allumé sur les écrans d'origine qu'il réunit (fiche prospect, client…) : on y
   * arrive depuis la liste, et le menu doit continuer à dire où l'on est.
   */
  const estSurContacts = (href: string): boolean =>
    href === "/admin/contacts" &&
    ["/admin/prospects", "/admin/demandes", "/admin/clients", "/admin/revendeurs"].some(estCourant);

  return (
    <nav
      aria-label="Navigation du back-office"
      className="flex w-full flex-col gap-7 bg-[#011D4F] px-4 py-6 text-white md:min-h-screen md:w-60 md:flex-none"
    >
      <Link href="/admin" className="flex items-center gap-2.5 px-2 text-white hover:text-white">
        <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#0063DF]">
          <RubricIcon name="vehicules" className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[15px] font-bold tracking-[0.04em]">DIABA AUTO</span>
      </Link>

      {groups.map((group) => (
        <div key={group.key}>
          {group.label ? (
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8FB4E2]">
              {group.label}
            </p>
          ) : null}

          <ul className="flex list-none flex-col gap-1 p-0">
            {group.entries.map((entry) => {
              const actif = estCourant(entry.href) || estSurContacts(entry.href);

              return (
                <li key={entry.label}>
                  <Link
                    href={entry.href}
                    aria-current={estCourant(entry.href) ? "page" : undefined}
                    title={entry.description}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm no-underline ${
                      actif
                        ? "bg-[#0063DF] font-semibold text-white"
                        : "font-medium text-[#C9DCF5] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <RubricIcon name={entry.icon} className="h-5 w-5 flex-none" />
                    <span>{entry.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
