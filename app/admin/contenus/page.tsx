import type { Metadata } from "next";
import Link from "next/link";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDateTime } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { listSitePages, type SitePageEditView } from "@/services/site-page.service";

/**
 * Contenus : les pages de texte du site que l'on peut modifier.
 *
 * Garde serveur `content.manage` ; en cas de refus, AUCUNE donnée n'est lue.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Contenus — Back-office Diaba Auto",
  "Textes des pages « À propos » et « Comment ça marche ».",
);

export default async function AdminContentPage() {
  const access = await resolveAdminAccess("content.manage");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <AdminHeader title="Contenus" subtitle="Accès réservé aux administrateurs." />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  let pages: SitePageEditView[] | null = null;
  try {
    pages = await listSitePages(access.actor);
  } catch {
    pages = null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <AdminHeader
        title="Contenus"
        subtitle="Les textes des pages du site. Tant qu'une page n'a pas été modifiée, le site affiche un texte par défaut."
        logout={<LogoutButton action={logoutAction} />}
      />

      {pages ? (
        <ul className="mt-8 grid list-none gap-4 p-0">
          {pages.map((page) => (
            <li key={page.slug} className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-[#011D4F]">{page.label}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {page.customized && page.updatedAt
                  ? `Modifiée le ${formatDateTime(page.updatedAt)}`
                  : "Texte par défaut (jamais modifiée)"}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                <Link href={`/admin/contenus/${page.slug}`} className="text-[#0063DF] hover:text-[#0354A3]">
                  Modifier
                  <span className="sr-only"> la page {page.label}</span>
                </Link>
                <Link href={page.publicPath} className="text-[#0063DF] hover:text-[#0354A3]">
                  Voir sur le site
                  <span className="sr-only"> : {page.label}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Contenus momentanément indisponibles</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            Les pages n&apos;ont pas pu être chargées (la migration M12 est-elle appliquée ?). Aucune donnée
            n&apos;est modifiée.
          </p>
        </section>
      )}
    </main>
  );
}
