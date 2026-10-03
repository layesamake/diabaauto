import { describe, expect, it } from "vitest";
import { readAnalyticsMeasurementId } from "@/lib/analytics/config";
import { parseConsent } from "@/lib/analytics/consent";
import { ANALYTICS_EVENT_PARAMS, buildEventPayload } from "@/lib/analytics/events";
import { buildContentSecurityPolicy } from "@/lib/security/http-headers";

const ON = {
  NEXT_PUBLIC_ANALYTICS_ENABLED: "true",
  NEXT_PUBLIC_ANALYTICS_PROVIDER: "ga4",
  NEXT_PUBLIC_ANALYTICS_ID: "G-ABC123XYZ9",
};

describe("readAnalyticsMeasurementId", () => {
  it("renvoie l'identifiant quand les trois valeurs sont cohérentes", () => {
    expect(readAnalyticsMeasurementId(ON)).toBe("G-ABC123XYZ9");
    expect(readAnalyticsMeasurementId({ ...ON, NEXT_PUBLIC_ANALYTICS_PROVIDER: "Google-Analytics" })).toBe("G-ABC123XYZ9");
  });

  it("reste inactif sans activation explicite, avec un autre fournisseur ou un identifiant mal formé", () => {
    expect(readAnalyticsMeasurementId({})).toBeNull();
    expect(readAnalyticsMeasurementId({ ...ON, NEXT_PUBLIC_ANALYTICS_ENABLED: "false" })).toBeNull();
    expect(readAnalyticsMeasurementId({ ...ON, NEXT_PUBLIC_ANALYTICS_PROVIDER: "plausible" })).toBeNull();
    expect(readAnalyticsMeasurementId({ ...ON, NEXT_PUBLIC_ANALYTICS_ID: "UA-12345-1" })).toBeNull();
    expect(readAnalyticsMeasurementId({ ...ON, NEXT_PUBLIC_ANALYTICS_ID: "G-<script>" })).toBeNull();
    expect(readAnalyticsMeasurementId({ ...ON, NEXT_PUBLIC_ANALYTICS_ID: "" })).toBeNull();
  });
});

describe("parseConsent", () => {
  it("n'accepte que deux valeurs ; tout le reste vaut « pas de choix »", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
    for (const value of [null, undefined, "", "true", "yes", 1, {}]) {
      expect(parseConsent(value)).toBeNull();
    }
  });
});

describe("buildEventPayload", () => {
  it("refuse un événement inconnu", () => {
    expect(buildEventPayload("purchase")).toBeNull();
    expect(buildEventPayload("constructor")).toBeNull();
    expect(buildEventPayload("__proto__")).toBeNull();
  });

  it("n'envoie que les paramètres déclarés : jamais de texte libre, d'e-mail ni de téléphone", () => {
    const payload = buildEventPayload("contact_whatsapp_click", {
      vehicle_reference: "DIABA-0001",
      email: "client@example.com",
      phone: "+221700000000",
      message: "Bonjour, je veux ce véhicule",
    });

    expect(payload).toEqual({ vehicle_reference: "DIABA-0001" });
  });

  it("une demande envoyée ne porte aucun paramètre, même si on lui en donne", () => {
    expect(buildEventPayload("request_submitted", { notes: "mes besoins", email: "a@b.c" })).toEqual({});
  });

  it("écarte les valeurs non simples et tronque les chaînes", () => {
    const payload = buildEventPayload("vehicle_view", {
      vehicle_reference: { nested: true },
      location: "x".repeat(500),
    });

    expect(payload).toEqual({ location: "x".repeat(100) });
  });

  it("la recherche ne transmet que « y a-t-il un texte » et les noms de filtres", () => {
    expect(buildEventPayload("catalogue_search", { has_query: true, filters: "brandId,condition", search: "toyota rav4" })).toEqual({
      has_query: true,
      filters: "brandId,condition",
    });
  });

  it("aucun paramètre déclaré ne ressemble à une donnée personnelle", () => {
    const names = Object.values(ANALYTICS_EVENT_PARAMS).flat();
    expect(names.some((name) => /mail|phone|message|notes?$/i.test(name))).toBe(false);
  });
});

describe("CSP et mesure d'audience", () => {
  const base = { appEnv: "production", supabaseUrl: "https://abc.supabase.co" } as const;

  it("n'autorise aucune origine Google quand la mesure n'est pas configurée", () => {
    const policy = buildContentSecurityPolicy(base);

    expect(policy).not.toMatch(/google|googletagmanager/);
    expect(buildContentSecurityPolicy({ ...base, analyticsMeasurementId: null })).not.toMatch(/google/);
    expect(buildContentSecurityPolicy({ ...base, analyticsMeasurementId: "  " })).not.toMatch(/google/);
  });

  it("autorise le script, la collecte et le pixel GA4, et rien d'autre, quand elle l'est", () => {
    const policy = buildContentSecurityPolicy({ ...base, analyticsMeasurementId: "G-ABC123XYZ9" });
    const directive = (name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

    expect(directive("script-src")).toContain("https://www.googletagmanager.com");
    expect(directive("connect-src")).toContain("https://www.google-analytics.com");
    expect(directive("connect-src")).toContain("https://*.analytics.google.com");
    expect(directive("img-src")).toContain("https://www.google-analytics.com");
    // Rien d'ouvert ailleurs : pas de cadre, pas de formulaire, pas de média, pas de police.
    for (const name of ["frame-src", "form-action", "media-src", "font-src", "default-src", "object-src"]) {
      expect(directive(name), name).not.toMatch(/google/);
    }
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
