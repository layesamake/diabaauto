import type { Metadata } from "next";
import { PageBody } from "@/components/public/PageBody";
import { SITE_PAGES } from "@/lib/site-pages/site-pages";
import { getPublicPage } from "@/services/public-page.service";

const SLUG = "a-propos" as const;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicPage(SLUG);

  return {
    title: `${page.title} — Diaba Auto`,
    description: SITE_PAGES[SLUG].description,
    alternates: { canonical: SITE_PAGES[SLUG].publicPath },
  };
}

/** Texte modifiable depuis le back-office (« Contenus ») ; texte par défaut tant qu'il n'a pas été modifié. */
export default async function AboutPage() {
  const page = await getPublicPage(SLUG);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-[#011D4F]">{page.title}</h1>
      <PageBody body={page.body} />
    </main>
  );
}
