"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { allowedAdminNav, type AdminNavEntry } from "@/components/admin/admin-nav";
import { RubricIcon } from "@/components/admin/RubricIcon";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Barre latérale du back-office.
 *
 * L'écran courant est déduit du chemin, et non d'une propriété à passer dans chaque page : une page
 * ajoutée plus tard est marquée sans qu'on y pense, et aucune ne peut mentir sur l'endroit où elle
 * se trouve.
 *
 * Les écrans rattachés à « Contacts » restent visibles en permanence : réduire le nombre d'entrées
 * de premier rang suffit à clarifier, cacher des liens derrière un dépli ne ferait qu'ajouter un
 * clic.
 */
export function AdminSidebar({ permissions }: { permissions: readonly PermissionCode[] }) {
  const pathname = usePathname();
  const groups = allowedAdminNav(permissions);

  /** `/admin` ne doit s'allumer que sur lui-même, sinon il resterait actif partout. */
  const estCourant = (href: string): boolean =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  /** Un parent s'allume quand on est sur l'un de ses écrans. */
  const contientCourant = (entry: AdminNavEntry): boolean =>
    estCourant(entry.href) || (entry.children ?? []).some((child) => estCourant(child.href));

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
              const actif = contientCourant(entry);

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

                  {entry.children && entry.children.length > 0 ? (
                    <ul className="mb-1 ml-[30px] mt-1 flex list-none flex-col gap-0.5 border-l border-white/15 p-0 pl-3">
                      {entry.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            aria-current={estCourant(child.href) ? "page" : undefined}
                            title={child.description}
                            className={`block rounded-md px-2.5 py-2 text-[13px] no-underline ${
                              estCourant(child.href)
                                ? "bg-white/15 font-semibold text-white"
                                : "text-[#B9D2EF] hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
