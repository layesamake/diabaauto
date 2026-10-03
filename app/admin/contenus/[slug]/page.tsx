import type { Metadata } from "next";
import Link from "next/link";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SitePageForm } from "@/components/admin/SitePageForm";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { isSitePageSlug } from "@/lib/site-pages/site-pages";
import { getSitePageForEdit, type SitePageEditView } from "@/services/site-page.service";

/** Modification d'une page de contenu. Garde serveur `content.manage` ; slug inconnu = introuvable. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Modifier une page — Back-office Diaba Auto",
  "Modification du texte d'une page du site.",
);

export default async function AdminContentEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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

  if (!isSitePageSlug(slug)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <AdminHeader title="Page introuvable" subtitle="Cette page n'existe pas." />
        <p className="mt-6 text-sm">
          <Link href="/admin/contenus" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
            Retour aux contenus
          </Link>
        </p>
      </main>
    );
  }

  let page: SitePageEditView | null = null;
  try {
    page = await getSitePageForEdit(access.actor, slug);
  } catch {
    page = null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <AdminHeader
        title={page ? `Modifier « ${page.label} »` : "Contenus"}
        subtitle="Les changements sont visibles sur le site dès l'enregistrement."
        logout={<LogoutButton action={logoutAction} />}
      />
      <p className="mt-4 flex gap-4 text-sm font-semibold">
        <Link href="/admin/contenus" className="text-[#0063DF] hover:text-[#0354A3]">
          ← Tous les contenus
        </Link>
        {page ? (
          <Link href={page.publicPath} className="text-[#0063DF] hover:text-[#0354A3]">
            Voir sur le site
          </Link>
        ) : null}
      </p>

      {page ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <SitePageForm slug={page.slug} title={page.title} body={page.body} />
        </section>
      ) : (
        <section role="alert" className="mt-6 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Page momentanément indisponible</h2>
          <p className="mt-2 text-sm text-[#7a5310]">La page n&apos;a pas pu être chargée. Aucune donnée n&apos;est modifiée.</p>
        </section>
      )}
    </main>
  );
}
