import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { CookiePreferencesButton } from "@/components/analytics/CookiePreferencesButton";
import { readAnalyticsMeasurementId } from "@/lib/analytics/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diaba Auto — Véhicules Chine et Sénégal",
  description: "Découvrez, comparez et contactez Diaba Auto pour des véhicules neufs et d’occasion situés en Chine ou au Sénégal.",
};

const navItems = [
  ["Catalogue", "/voitures"],
  ["Commander", "/commander"],
  ["Comment ça marche", "/comment-ca-marche"],
  ["Contact", "/contact"],
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const measurementId = readAnalyticsMeasurementId(process.env);

  return (
    <html lang="fr">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-3" aria-label="Accueil Diaba Auto">
              <Image src="/brand/diaba-auto-logo.png" alt="Diaba Auto" width={144} height={48} priority className="h-12 w-auto object-contain" />
            </Link>
            <nav className="hidden items-center gap-5 text-sm font-medium text-[#011D4F] md:flex" aria-label="Navigation principale">
              {navItems.map(([label, href]) => <Link key={href} href={href} className="hover:text-[#0063DF]">{label}</Link>)}
            </nav>
            <Link href="/my-diaba-auto" className="rounded-full bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]">
              My Diaba Auto
            </Link>
          </div>
        </header>
        {children}
        <footer className="mt-16 bg-[#011D4F] px-4 py-8 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm">
            <span>© Diaba Auto — Véhicules neufs et d’occasion Chine / Sénégal.</span>
            <span className="flex items-center gap-4">
              <Link href="/mentions-legales" className="underline underline-offset-2 hover:text-[#66E5FC]">
                Mentions légales et confidentialité
              </Link>
              {measurementId ? <CookiePreferencesButton /> : null}
            </span>
          </div>
        </footer>
        <AnalyticsProvider measurementId={measurementId} />
      </body>
    </html>
  );
}
