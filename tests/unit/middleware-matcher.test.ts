import { describe, expect, it } from "vitest";
import { config } from "@/middleware";
import { privateRoutes } from "@/lib/routes";

/**
 * Le filtre du middleware est une règle de SÉCURITÉ autant que de performance : il décide quelles
 * requêtes rafraîchissent la session et déclenchent la redirection des routes privées. Une
 * exclusion trop large y ouvrirait une route privée ; une exclusion trop étroite ferait repartir un
 * appel d'authentification sur chaque image.
 *
 * Ce test reconstruit l'expression du matcher et vérifie les deux sens.
 */

const matcher = new RegExp(`^${config.matcher[0]}$`);

function matches(pathname: string): boolean {
  return matcher.test(pathname);
}

describe("filtre du middleware — routes protégées", () => {
  it("couvre toutes les routes privées déclarées et leurs sous-routes", () => {
    for (const route of privateRoutes) {
      expect(matches(route), route).toBe(true);
      expect(matches(`${route}/`), `${route}/`).toBe(true);
      expect(matches(`${route}/vehicules/123`), `${route}/vehicules/123`).toBe(true);
    }
  });

  it("couvre les pages publiques, qui doivent garder leur session rafraîchie", () => {
    for (const path of ["/", "/voitures", "/voitures/une-voiture", "/connexion", "/auth/callback", "/commander"]) {
      expect(matches(path), path).toBe(true);
    }
  });
});

describe("filtre du middleware — routes exclues", () => {
  it("exclut la livraison des images, appelée une fois par image", () => {
    expect(matches("/api/media/11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(matches("/api/media/22222222-2222-4222-8222-222222222222")).toBe(false);
  });

  it("exclut la sonde de disponibilité et les ressources statiques", () => {
    for (const path of [
      "/api/health",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/icon.png",
      "/apple-icon.png",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("n'exclut aucune autre route d'API par effet de bord", () => {
    // Un nom seulement préfixé par une exclusion ne doit PAS passer à travers : sans bornes, une
    // route ajoutée plus tard sortirait silencieusement du middleware.
    expect(matches("/api/medias-prives")).toBe(true);
    expect(matches("/api/media-admin/42")).toBe(true);
    expect(matches("/api/healthcheck-interne")).toBe(true);
    expect(matches("/brandings-internes")).toBe(true);
  });
});
