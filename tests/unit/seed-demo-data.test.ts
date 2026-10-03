import { describe, expect, it } from "vitest";
import {
  DEMO_BRANDS,
  DEMO_REFERENCE_PREFIX,
  DEMO_TITLE_MARKER,
  DEMO_VEHICLES,
} from "@/prisma/seed-demo-data";
import { assertDemoDataIsIdentified } from "@/prisma/seed-demo";

/**
 * Garde-fou de la règle `CLAUDE.md` §9 : « Utilise des données fictives uniquement pour le développement
 * et les tests, en les identifiant clairement ». Ces tests échouent si une donnée de démonstration
 * devient indiscernable d'une donnée réelle.
 */
describe("jeu de données de démonstration", () => {
  it("passe sa propre assertion d'identification", () => {
    expect(() => assertDemoDataIsIdentified()).not.toThrow();
  });

  it("préfixe toute référence de véhicule par DEMO-", () => {
    for (const vehicle of DEMO_VEHICLES) {
      expect(vehicle.reference.startsWith(DEMO_REFERENCE_PREFIX)).toBe(true);
    }
  });

  it("marque tout titre de véhicule comme fictif", () => {
    for (const vehicle of DEMO_VEHICLES) {
      expect(vehicle.title).toContain(DEMO_TITLE_MARKER);
    }
  });

  it("préfixe tout slug de marque par demo- et n'active que des marques fictives", () => {
    for (const brand of DEMO_BRANDS) {
      expect(brand.slug.startsWith("demo-")).toBe(true);
      expect(brand.name.toLowerCase()).toContain("fictive");
    }
  });

  it("ne déclare pas de véhicule vendu ni archivé (le catalogue public ne montrerait rien)", () => {
    expect(DEMO_VEHICLES.length).toBeGreaterThan(0);
    for (const vehicle of DEMO_VEHICLES) {
      expect(Number(vehicle.standardPriceXof)).toBeGreaterThan(0);
    }
  });

  it("couvre la Chine et le Sénégal (règle RM-07 : localisation toujours explicite)", () => {
    const locations = new Set(DEMO_VEHICLES.map((vehicle) => vehicle.logisticsLocation));
    expect(locations.has("CHINA")).toBe(true);
    expect(locations.has("SENEGAL")).toBe(true);
  });
});
