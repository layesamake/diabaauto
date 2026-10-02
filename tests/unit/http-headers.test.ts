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
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("default-src 'self'");
  });

  it("n'autorise aucune origine distante en dehors du projet Supabase configuré", () => {
    const policy = buildContentSecurityPolicy({ appEnv: "production", supabaseUrl: SUPABASE_URL });
    const allowed = policy.split("; ").flatMap((part) => part.split(" ").slice(1).filter((token) => token.startsWith("http")));

    expect(new Set(allowed)).toEqual(new Set([SUPABASE_URL]));
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
