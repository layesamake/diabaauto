"use client";

/**
 * Mesure d'audience GA4 soumise au consentement.
 *
 * - Sans identifiant de mesure valide (`measurementId` nul) : rien n'est rendu, rien n'est chargé.
 * - Tant que le visiteur n'a pas accepté : le script Google n'est PAS chargé, aucun cookie n'est posé.
 * - Accepter charge GA4 (publicité, personnalisation et signaux désactivés) ; refuser le décharge
 *   au prochain chargement de page et supprime les cookies `_ga` du site.
 */

import Script from "next/script";
import { useEffect, useState } from "react";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_REOPEN_EVENT,
  readStoredConsent,
  storeConsent,
  type ConsentChoice,
} from "@/lib/analytics/consent";

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function clearAnalyticsCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim() ?? "";
    if (name === "_ga" || name.startsWith("_ga_")) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}

export function AnalyticsProvider({ measurementId }: { measurementId: string | null }) {
  const [consent, setConsent] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredConsent();
    setConsent(stored);
    setBannerOpen(stored === null);
    setReady(true);

    const onChange = (event: Event) => setConsent((event as CustomEvent<ConsentChoice>).detail);
    const onReopen = () => setBannerOpen(true);
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen);

    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
      window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
    };
  }, []);

  useEffect(() => {
    if (!measurementId || !ready) {
      return;
    }

    const target = window as unknown as GtagWindow;
    if (consent === "granted") {
      target[`ga-disable-${measurementId}`] = false;
      target.dataLayer = target.dataLayer ?? [];
      target.gtag =
        target.gtag ??
        function gtag() {
          // GA exige l'objet `arguments` tel quel, pas un tableau.
          // eslint-disable-next-line prefer-rest-params
          target.dataLayer?.push(arguments);
        };
      target.gtag("consent", "default", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      target.gtag("js", new Date());
      target.gtag("config", measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    } else if (consent === "denied") {
      target[`ga-disable-${measurementId}`] = true;
      clearAnalyticsCookies();
    }
  }, [consent, measurementId, ready]);

  if (!measurementId || !ready) {
    return null;
  }

  function choose(choice: ConsentChoice) {
    storeConsent(choice);
    setBannerOpen(false);
  }

  const buttonClass =
    "rounded-lg border border-[#0063DF] px-5 py-2.5 text-sm font-semibold text-[#0063DF] hover:bg-[#E8F1FD]";

  return (
    <>
      {consent === "granted" ? (
        <Script
          id="ga4-loader"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
          strategy="afterInteractive"
        />
      ) : null}

      {bannerOpen ? (
        <section
          aria-label="Mesure d'audience et cookies"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white p-4 shadow-[0_-4px_16px_rgba(1,29,79,0.12)]"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-700">
              Nous utilisons Google Analytics pour mesurer l&apos;audience du site (pages vues, clics sur WhatsApp).
              Rien n&apos;est envoyé sans votre accord, et jamais vos messages, e-mails ou numéros de téléphone. Vous
              pouvez changer d&apos;avis à tout moment avec « Gérer les cookies », en bas de page.
            </p>
            <div className="flex shrink-0 gap-3">
              <button type="button" onClick={() => choose("denied")} className={buttonClass}>
                Refuser
              </button>
              <button type="button" onClick={() => choose("granted")} className={buttonClass}>
                Accepter
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
