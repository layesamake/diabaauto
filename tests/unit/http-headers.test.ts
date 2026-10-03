import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  supabaseOrigins,
} from "@/lib/security/http-headers";

const SUPABASE_URL = "https://bxmsxmxwdwpzqcxfdjeu.supabase.co";

describe("supabaseOrigins", () => {
  it("dérive l'origine https et le canal temps réel wss du projet", () => {
    expect(supabaseOrigins(SUPABASE_URL)).toEqual([
      "https://bxmsxmxwdwpzqcxfdjeu.supabase.co",
      "wss://bxmsxmxwdwpzqcxfdjeu.supabase.co",
    ]);
  });

  it("ne produit aucune origine pour une valeur absente ou illisible", () => {
    expect(supabaseOrigins(undefined)).toEqual([]);
    expect(supabaseOrigins("")).toEqual([]);
    expect(supabaseOrigins("   ")).toEqual([]);
    expect(supabaseOrigins("pas-une-url")).toEqual([]);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("ferme les vecteurs structurels : frame-ancestors, object-src, base-uri, form-action", () => {
    const policy = buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: SUPABASE_URL });

    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    // `frame-src` n'est plus fermé : il autorise les deux lecteurs vidéo, et eux seuls (T74).
    expect(policy).toContain("frame-src https://www.youtube-nocookie.com https://player.vimeo.com");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("default-src 'self'");
  });

  it("n'autorise aucune origine distante en dehors du projet Supabase et des deux lecteurs vidéo", () => {
    const policy = buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: SUPABASE_URL });
    const allowed = policy.split("; ").flatMap((part) => part.split(" ").slice(1).filter((token) => token.startsWith("http")));

    // Liste close : toute origine distante ajoutée ailleurs dans la CSP fait échouer ce test.
    expect(new Set(allowed)).toEqual(
      new Set([SUPABASE_URL, "https://www.youtube-nocookie.com", "https://player.vimeo.com"]),
    );
  });

  it("autorise l'API REST, le Storage et le temps réel Supabase dans connect-src", () => {
    const policy = buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: SUPABASE_URL });

    expect(policy).toContain(`connect-src 'self' ${SUPABASE_URL} wss://bxmsxmxwdwpzqcxfdjeu.supabase.co`);
    expect(policy).toContain(`img-src 'self' data: blob: ${SUPABASE_URL}`);
  });

  it("n'ouvre 'unsafe-eval' qu'en développement et jamais en production ni en prévisualisation", () => {
    const dev = buildContentSecurityPolicy({ appEnv: "development", supabaseUrl: SUPABASE_URL });
    const preview = buildContentSecurityPolicy({ appEnv: "preview", supabaseUrl: SUPABASE_URL });
    const prod = buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: SUPABASE_URL });

    expect(dev).toContain("'unsafe-eval'");
    expect(preview).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("n'ajoute upgrade-insecure-requests qu'en production", () => {
    expect(buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: SUPABASE_URL })).toContain(
      "upgrade-insecure-requests",
    );
    expect(buildContentSecurityPolicy({ appEnv: "staging", supabaseUrl: SUPABASE_URL })).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("reste valide sans Supabase configuré : aucune origine distante ajoutée", () => {
    const policy = buildContentSecurityPolicy({ appEnv: "development" });

    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).not.toContain("supabase.co");
  });
});

describe("buildSecurityHeaders", () => {
  it("émet les quatre en-têtes exigés par le document 17 §6 en production", () => {
    const headers = buildSecurityHeaders({ appEnv: "production", supabaseUrl: SUPABASE_URL });

    expect(headers["Content-Security-Policy"]).toBeTruthy();
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("protège du clickjacking par frame-ancestors et X-Frame-Options", () => {
    const headers = buildSecurityHeaders({ appEnv: "production", supabaseUrl: SUPABASE_URL });

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("n'émet jamais HSTS hors production", () => {
    for (const appEnv of ["development", "preview", "staging"] as const) {
      const headers = buildSecurityHeaders({ appEnv, supabaseUrl: SUPABASE_URL });
      expect(headers["Strict-Transport-Security"]).toBeUndefined();
    }
  });

  it("verrouille les fonctionnalités navigateur non utilisées", () => {
    const headers = buildSecurityHeaders({ appEnv: "production", supabaseUrl: SUPABASE_URL });

    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
  });
});


describe("CSP — lecteurs vidéo", () => {
  const policy = buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: "https://projet.supabase.co" });
  const frameSrc = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src")) ?? "";

  it("autorise exactement les deux lecteurs vidéo, et rien d'autre", () => {
    expect(frameSrc).toBe("frame-src https://www.youtube-nocookie.com https://player.vimeo.com");
  });

  it("n'autorise pas youtube.com sans nocookie, ni un hébergeur tiers", () => {
    expect(frameSrc).not.toContain("//www.youtube.com");
    expect(frameSrc).not.toContain("dailymotion");
    expect(frameSrc).not.toContain("*");
  });

  it("n'accorde aux lecteurs aucun autre pouvoir que l'affichage", () => {
    // Ni script, ni connexion, ni formulaire : seule `frame-src` les mentionne.
    for (const directive of ["script-src", "connect-src", "form-action", "img-src", "media-src"]) {
      const value = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(directive)) ?? "";
      expect(value, directive).not.toContain("youtube");
      expect(value, directive).not.toContain("vimeo");
    }
  });

  it("maintient la protection anti-clickjacking du site lui-même", () => {
    // `frame-src` dit ce que NOUS pouvons intégrer ; `frame-ancestors` qui peut nous intégrer.
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
