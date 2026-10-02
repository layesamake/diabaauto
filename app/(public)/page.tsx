import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentActor } from "@/lib/auth/session";
import { absoluteUrl } from "@/lib/seo";
import { loadPublicData } from "@/components/public/public-data";
import { loadFavoriteState } from "@/components/public/favorite-state";
import { QuickSearchForm } from "@/components/public/QuickSearchForm";
import { VehicleGrid } from "@/components/public/VehicleGrid";
import { fr } from "@/lib/i18n";
import { listFeaturedVehicles } from "@/services/catalogue.service";

/**
 * Accueil public (doc 05 §2, contrat §B.1) : hero, recherche rapide, nouveautés, blocs Chine /
 * Sénégal, processus et bloc Revendeur. Aucune promesse commerciale ni aucun chiffre n'est inventé.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diaba Auto — Véhicules neufs et d’occasion Chine / Sénégal",
  description:
    "Parcourez le catalogue Diaba Auto : véhicules neufs et d’occasion en Chine ou au Sénégal, prix affichés et prise de contact directe.",
  alternates: { canonical: absoluteUrl("/") },
};

export default async function HomePage() {
  const actor = await getCurrentActor();
  const [featured, favoriteState] = await Promise.all([
    loadPublicData(() => listFeaturedVehicles(actor, 6)),
    loadFavoriteState(actor),
  ]);

  const featuredEmpty = featured.status !== "ok" || featured.value.length === 0;

  return (
    <main>
      <section className="bg-gradient-to-br from-[#011D4F] via-[#0063DF] to-[#099FF8] px-4 py-16 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#66E5FC]">
            {fr.home.heroEyebrow}
          </p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
            {fr.home.heroTitle}
          </h1>
          <p className="mt-5 max-w-2xl text-base text-blue-50 md:text-lg">{fr.home.heroBody}</p>

          <div className="mt-8 max-w-2xl rounded-2xl bg-white p-4 text-[#071525]">
            <QuickSearchForm />
          </div>

          <div className="mt-6">
            <Link
              href="/voitures"
              className="inline-block rounded-full border border-white px-6 py-3 text-sm font-semibold text-white"
            >
              {fr.common.seeCatalogue}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-bold text-[#011D4F]">{fr.home.featuredTitle}</h2>

        <div className="mt-6">
          {featuredEmpty ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-[#f4f7fb] px-4 py-8 text-center text-sm text-slate-600">
              {featured.status === "ok" ? fr.home.featuredEmpty : fr.home.featuredUnavailable}
            </p>
          ) : (
            <VehicleGrid vehicles={featured.value} favoriteState={favoriteState} />
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-12 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#011D4F]">{fr.home.chinaTitle}</h2>
          <p className="mt-3 text-sm text-slate-600">{fr.home.chinaBody}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#011D4F]">{fr.home.senegalTitle}</h2>
          <p className="mt-3 text-sm text-slate-600">{fr.home.senegalBody}</p>
        </article>
      </section>

      <section className="bg-[#f4f7fb] px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold text-[#011D4F]">{fr.home.processTitle}</h2>
          <ol className="mt-6 grid gap-5 md:grid-cols-3">
            {fr.home.processSteps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <span className="text-sm font-semibold text-[#0063DF]">{index + 1}</span>
                <h3 className="mt-2 text-lg font-semibold text-[#011D4F]">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl bg-[#011D4F] px-6 py-8 text-white">
          <h2 className="text-2xl font-bold">{fr.home.resellerTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm text-blue-50">{fr.home.resellerBody}</p>
          <Link
            href="/my-diaba-auto"
            className="mt-6 inline-block rounded-full bg-[#0063DF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            {fr.home.resellerCta}
          </Link>
        </div>
      </section>
    </main>
  );
}