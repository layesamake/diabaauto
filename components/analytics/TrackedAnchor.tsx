"use client";

import type { AnchorHTMLAttributes } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/analytics/events";

/** Lien externe dont le clic émet un événement de mesure (sans consentement : aucun envoi). */
export function TrackedAnchor({
  event,
  params,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  event: AnalyticsEventName;
  params?: Record<string, string | number | boolean>;
}) {
  return (
    <a
      {...rest}
      onClick={(clickEvent) => {
        trackEvent(event, params);
        onClick?.(clickEvent);
      }}
    />
  );
}
