import type { NextConfig } from "next";
import { readAnalyticsMeasurementId } from "./lib/analytics/config";
import { buildSecurityHeaders, type SecurityAppEnv } from "./lib/security/http-headers";

/**
 * Environnement applicatif tel que `next.config.ts` peut le lire au chargement de la configuration.
 * `.env*` est chargé par Next **avant** ce fichier : `APP_ENV` est donc disponible au build Vercel.
 */
const APP_ENVS: readonly SecurityAppEnv[] = ["development", "preview", "staging", "production"];

function resolveAppEnv(): SecurityAppEnv {
  const candidate = process.env.APP_ENV?.trim();

  if (candidate && (APP_ENVS as readonly string[]).includes(candidate)) {
    return candidate as SecurityAppEnv;
  }

  // Repli : `next build` de production sans APP_ENV reste traité comme production, comme la CI.
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

const securityHeaders = buildSecurityHeaders({
  appEnv: resolveAppEnv(),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  analyticsMeasurementId: readAnalyticsMeasurementId(process.env),
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Toutes les réponses : pages, Server Actions, Route Handlers et fichiers statiques.
        source: "/(.*)",
        headers: Object.entries(securityHeaders).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
