import { describe, expect, it } from "vitest";
import { RUBRIC_ICON_NAMES } from "@/components/admin/rubric-icons";
import { allowedRubricScreens, RUBRIC_SCREENS } from "@/components/admin/rubric-screens";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Garde-fou du catalogue de rubriques de l'accueil du back-office.
 *
 * La propriété visée : **toute rubrique affichée possède une icône existante et un lien unique**.
 * Une rubrique ajoutée plus tard sans icône, ou pointant vers un écran inexistant, casse ce test —
 * c'est précisément ce qu'on veut, car le défaut ne se verrait qu'à l'œil.
 */

describe("rubric-screens", () => {
  it("donne une icône connue à chaque rubrique", () => {
    for (const screen of RUBRIC_SCREENS) {
      expect(RUBRIC_ICON_NAMES, `icône manquante pour ${screen.title}`).toContain(screen.icon);
    }
  });

  it("n'a ni lien ni titre en double", () => {
    const hrefs = RUBRIC_SCREENS.map((screen) => screen.href);
    const titles = RUBRIC_SCREENS.map((screen) => screen.title);

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("pointe chaque rubrique vers un écran du back-office", () => {
    for (const screen of RUBRIC_SCREENS) {
      expect(screen.href.startsWith("/admin/")).toBe(true);
      expect(screen.description.length).toBeGreaterThan(0);
    }
  });

  it("propose les sept rubriques livrées à un administrateur complet", () => {
    const all: PermissionCode[] = [
      "vehicle.view",
      "content.manage",
      "lead.view",
      "customer.view",
      "reseller.view",
      "order.view",
    ];

    const screens = allowedRubricScreens(all);

    expect(screens).toHaveLength(RUBRIC_SCREENS.length);
    expect(screens.map((screen) => screen.title)).toEqual([
      "Véhicules",
      "Référentiels",
      "Prospects",
      "Demandes sur mesure",
      "Clients",
      "Revendeurs",
      "Commandes",
    ]);
  });

  it("ne propose que les rubriques autorisées par les permissions", () => {
    const screens = allowedRubricScreens(["vehicle.view", "order.view"]);

    expect(screens.map((screen) => screen.href)).toEqual([
      "/admin/vehicules",
      "/admin/commandes",
    ]);
  });

  it("ne propose rien sans permission", () => {
    expect(allowedRubricScreens([])).toEqual([]);
  });

  it("conditionne Demandes sur mesure à la permission des prospects (D21 en attente)", () => {
    const screens = allowedRubricScreens(["lead.view"]);

    expect(screens.map((screen) => screen.href)).toEqual([
      "/admin/prospects",
      "/admin/demandes",
    ]);
  });
});
