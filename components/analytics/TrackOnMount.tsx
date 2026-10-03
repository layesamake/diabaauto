"use client";

import { useEffect } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics/events";

/**
 * Émet un événement une fois, quand le composant apparaît (consultation d'une fiche, recherche).
 * `trackEvent` ne fait rien sans consentement. Aucun rendu.
 */
export function TrackOnMount({
  event,
  params,
}: {
  event: AnalyticsEventName;
  params?: Record<string, string | number | boolean>;
}) {
  const key = JSON.stringify(params ?? {});

  useEffect(() => {
    // Le consentement peut être donné juste après l'affichage : un court délai laisse GA s'initialiser.
    const timer = window.setTimeout(() => trackEvent(event, params), 800);
    return () => window.clearTimeout(timer);
  }, [event, key]);

  return null;
}
