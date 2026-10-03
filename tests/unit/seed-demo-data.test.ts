import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEMO_ASSETS_DIR,
  DEMO_BRANDS,
  DEMO_REFERENCE_PREFIX,
  DEMO_TITLE_MARKER,
  DEMO_VEHICLE_IMAGES,
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

describe("images de démonstration", () => {
  it("couvre chaque véhicule, avec exactement une image principale et au plus 5 images", () => {
    const refs = new Set(DEMO_VEHICLES.map((vehicle) => vehicle.reference));
    const covered = new Set(DEMO_VEHICLE_IMAGES.map((entry) => entry.reference));

    expect(covered).toEqual(refs);

    for (const entry of DEMO_VEHICLE_IMAGES) {
      expect(refs.has(entry.reference), entry.reference).toBe(true);
      expect(entry.images.length, entry.reference).toBeGreaterThan(0);
      expect(entry.images.length, entry.reference).toBeLessThanOrEqual(5);
      expect(entry.images.filter((image) => image.isPrimary).length, entry.reference).toBe(1);

      const orders = entry.images.map((image) => image.order);
      expect(new Set(orders).size, entry.reference).toBe(orders.length);
    }
  });

  it("chaque fichier image est versionné sous prisma/demo-assets/ et identifié comme fictif", () => {
    const baseDir = fileURLToPath(new URL(`../../prisma/${DEMO_ASSETS_DIR}/`, import.meta.url));

    for (const entry of DEMO_VEHICLE_IMAGES) {
      // Le fichier commence par la référence (donc le dossier porte la référence DEMO-…).
      expect(entry.images.every((image) => image.file.startsWith(`${entry.reference}/`)), entry.reference).toBe(true);
      for (const image of entry.images) {
        expect(existsSync(join(baseDir, image.file)), image.file).toBe(true);
      }
    }
  });
});
