import { describe, expect, it } from "vitest";
import * as seedData from "@/prisma/seed-data";
import {
  BODY_TYPE_SEEDS,
  FUEL_TYPE_SEEDS,
  TRANSMISSION_TYPE_SEEDS,
} from "@/prisma/seed-data";

/**
 * Garde-fou du seed de référentiel (doc 13 §« Seeds obligatoires », doc 03 §5) :
 * seules les valeurs NOMMÉES dans la documentation sont amorçables ; aucune marque, aucun modèle,
 * aucune couleur inventée (D14, décisions.md).
 */
const DOCUMENTED_BODY_CODES = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "PICKUP",
  "MINIBUS",
  "VAN",
  "TRUCK",
  "UTILITY",
];

const DOCUMENTED_FUEL_CODES = ["ESSENCE", "DIESEL", "HYBRID", "PHEV", "ELECTRIC"];
const DOCUMENTED_TRANSMISSION_CODES = ["AUTOMATIC", "MANUAL", "CVT", "DCT"];

describe("seed des référentiels", () => {
  it("amorce exactement les carrosseries nommées par le doc 13", () => {
    expect(BODY_TYPE_SEEDS.map((row) => row.code)).toEqual(DOCUMENTED_BODY_CODES);
  });

  it("amorce exactement les énergies et les boîtes de vitesses documentées", () => {
    expect(FUEL_TYPE_SEEDS.map((row) => row.code)).toEqual(DOCUMENTED_FUEL_CODES);
    expect(TRANSMISSION_TYPE_SEEDS.map((row) => row.code)).toEqual(DOCUMENTED_TRANSMISSION_CODES);
  });

  it("donne un libellé français non vide et des codes uniques", () => {
    const rows = [...BODY_TYPE_SEEDS, ...FUEL_TYPE_SEEDS, ...TRANSMISSION_TYPE_SEEDS];
    const codes = rows.map((row) => row.code);

    expect(new Set(codes).size).toBe(codes.length);
    for (const row of rows) {
      expect(row.name.trim().length).toBeGreaterThan(0);
      expect(row.code).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it("n'expose aucune marque, aucun modèle et aucune couleur inventés", () => {
    const forbidden = Object.keys(seedData).filter((name) => /brand|model|categor|color/i.test(name));

    expect(forbidden).toEqual([]);
  });
});