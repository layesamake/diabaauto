/**
 * En-têtes de sécurité HTTP (lot 8, `docs/17_Cahier_securite.docx` §6 « Sécurité HTTP »).
 *
 * Exigences couvertes :
 * - CSP adaptée (restriction des origines de script, style, image, média et connexion) ;
 * - HSTS **en production uniquement** ;
 * - `X-Content-Type-Options`, `Referrer-Policy`, protection clickjacking (`frame-ancestors`
 *   + `X-Frame-Options`) ;
 * - aucune source externe non nécessaire : les seules origines distantes autorisées sont le projet
 *   Supabase réellement configuré (`NEXT_PUBLIC_SUPABASE_URL`), pour l'API REST, l'API Auth, le
 *   Storage et le canal temps réel (WebSocket), et les deux lecteurs vidéo ci-dessous.
 *
 * Module **pur** : aucune lecture d'environnement, aucun effet de bord. `next.config.ts` fournit
 * l'environnement applicatif et l'URL Supabase ; les tests les injectent directement.
 *
 * Limite assumée et documentée (décision T51, `docs/contrat-lot-8.md`) : `script-src` contient
 * `'unsafe-inline'`, imposé par les scripts d'amorçage en ligne de Next.js tant qu'aucun `nonce`
 * par requête n'est mis en place. Une CSP à `nonce` forcerait le rendu dynamique de toutes les
 * pages, ce qui dégraderait la cible de performance (doc 18 §6). La restriction d'origines, elle,
 * est réelle : aucun script tiers n'est autorisé.
 */

export type SecurityAppEnv = "development" | "preview" | "staging" | "production";

export type SecurityHeadersInput = {
  /** Environnement applicatif (`APP_ENV`). */
  appEnv: SecurityAppEnv;
  /** URL du projet Supabase (`NEXT_PUBLIC_SUPABASE_URL`), absente en développement non configuré. */
  supabaseUrl?: string | null;
  /**
   * Identifiant de mesure GA4, uniquement si la mesure est configurée (`readAnalyticsMeasurementId`).
   * Absent : aucune origine Google n'est autorisée.
   */
  analyticsMeasurementId?: string | null;
};

/**
 * Origines Google Analytics 4, ajoutées à la CSP SEULEMENT quand la mesure est configurée (T88).
 * Les jokers `*.google-analytics.com` / `*.analytics.google.com` sont imposés par les points de
 * collecte régionaux de GA4 (`region1.google-analytics.com`…). Le script ne se charge qu'après
 * consentement du visiteur : la CSP l'autorise, elle ne le déclenche pas.
 */
export const ANALYTICS_ORIGINS = {
  script: ["https://www.googletagmanager.com"],
  connect: [
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://www.googletagmanager.com",
  ],
  img: ["https://www.google-analytics.com", "https://*.google-analytics.com", "https://www.googletagmanager.com"],
} as const;

/**
 * Lecteurs vidéo autorisés dans une `iframe`, et eux seuls (décision T74).
 *
 * `frame-src` est la SEULE directive qui les mentionne : ils ne peuvent ni exécuter de script dans
 * la page, ni ouvrir de connexion en son nom. La galerie ne charge l'iframe qu'au clic du visiteur,
 * donc aucune requête ne part vers ces domaines à l'ouverture d'une fiche.
 *
 * YouTube est servi par `youtube-nocookie.com` : pas de cookie de suivi avant lecture. Toute
 * addition ici élargit la surface d'attaque — elle se décide, elle ne s'ajoute pas par confort.
 */
export const VIDEO_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const;

/** Origines `https` et `wss` du projet Supabase : API REST, Auth, Storage et Realtime. */
export function supabaseOrigins(supabaseUrl?: string | null): string[] {
  const raw = supabaseUrl?.trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = new URL(raw);
    const secure = parsed.protocol === "https:";
    const http = `${parsed.protocol}//${parsed.host}`;
    const socket = `${secure ? "wss:" : "ws:"}//${parsed.host}`;

    return [http, socket];
  } catch {
    return [];
  }
}

function origins(...values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(" ");
}

/**
 * Politique de sécurité du contenu.
 *
 * `'unsafe-eval'` n'est ajouté qu'en développement (outils de rechargement de Next.js) ; il est
 * absent de toute autre valeur d'environnement, donc de la production et des prévisualisations.
 */
export function buildContentSecurityPolicy(input: SecurityHeadersInput): string {
  const supabase = supabaseOrigins(input.supabaseUrl);
  // Le canal temps réel (`wss:`) ne concerne que `connect-src` : il n'a rien à faire dans `img-src`.
  const supabaseHttp = supabase.filter((origin) => origin.startsWith("https://") || origin.startsWith("http://"));
  const isProduction = input.appEnv === "production";
  const isDevelopment = input.appEnv === "development";

  const analytics = Boolean(input.analyticsMeasurementId?.trim());
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    isDevelopment ? "'unsafe-eval'" : "",
    ...(analytics ? ANALYTICS_ORIGINS.script : []),
  ];

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...supabaseHttp, ...(analytics ? ANALYTICS_ORIGINS.img : [])]],
    ["media-src", ["'self'", "blob:", ...supabaseHttp]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...supabase, ...(analytics ? ANALYTICS_ORIGINS.connect : [])]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", [...VIDEO_FRAME_ORIGINS]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${origins(...values)}`).join("; ");

  return isProduction ? `${policy}; upgrade-insecure-requests` : policy;
}

/**
 * Table complète des en-têtes de sécurité, prête pour `headers()` de `next.config.ts`.
 *
 * `Strict-Transport-Security` n'est **jamais** émis hors production : l'annoncer depuis une
 * prévisualisation ou un poste de développement épinglerait HTTPS sur un hôte qui ne le sert pas.
 * `preload` est volontairement absent (décision T52) : le domaine servi est un sous-domaine
 * `vercel.app` partagé ; la précharge sera ajoutée avec le domaine Diaba Auto définitif.
 */
export function buildSecurityHeaders(input: SecurityHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(input),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", "),
  };

  if (input.appEnv === "production") {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  }

  return headers;
}
