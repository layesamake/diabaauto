import { describe, expect, it } from "vitest";
import {
  VEHICLE_TABS,
  VEHICLE_TAB_LABELS,
  countOfTab,
  parseVehicleTab,
  stageOfTab,
  vehicleTabHref,
} from "@/components/admin/vehicle-list-view";
import { VEHICLE_STAGES } from "@/lib/vehicle-stage";
import { toStageWhere, toVehicleWhere } from "@/repositories/vehicle.repository";

/**
 * Onglets de la liste des véhicules.
 *
 * Ce qui compte : l'URL ne peut pas mener à un état incohérent (valeur inconnue → « Tous »), chaque
 * étape métier a son onglet, et les conditions SQL des étapes sont disjointes et se combinent avec
 * la recherche sans l'écraser.
 */

describe("onglets — URL", () => {
  it("retombe sur « Tous » pour toute valeur inconnue", () => {
    for (const value of ["", "admin", "EN-LIGNE", 3, null, undefined, {}]) {
      expect(parseVehicleTab(value), String(value)).toBe("tous");
    }
  });

  it("reconnaît chaque onglet", () => {
    for (const tab of VEHICLE_TABS) {
      expect(parseVehicleTab(tab)).toBe(tab);
    }
  });

  it("donne un libellé à chaque onglet", () => {
    for (const tab of VEHICLE_TABS) {
      expect(VEHICLE_TAB_LABELS[tab].length, tab).toBeGreaterThan(2);
    }
  });

  it("construit des liens qui gardent la recherche, et l'adresse nue pour « Tous » sans recherche", () => {
    expect(vehicleTabHref("tous", "")).toBe("/admin/vehicules");
    expect(vehicleTabHref("pret", "")).toBe("/admin/vehicules?etat=pret");
    expect(vehicleTabHref("pret", "hilux")).toBe("/admin/vehicules?etat=pret&recherche=hilux");
    expect(vehicleTabHref("tous", "hilux", 3)).toBe("/admin/vehicules?recherche=hilux&page=3");
  });

  it("encode la recherche : aucun caractère ne peut casser l'adresse", () => {
    const href = vehicleTabHref("tous", "a&etat=vendus#x");

    expect(href).toBe("/admin/vehicules?recherche=a%26etat%3Dvendus%23x");
    expect(new URL(href, "https://exemple.test").searchParams.get("etat")).toBeNull();
  });
});

describe("onglets — étapes métier", () => {
  it("fait correspondre chaque étape à exactement un onglet, et « Tous » à aucune", () => {
    expect(stageOfTab("tous")).toBeUndefined();

    const stages = VEHICLE_TABS.map(stageOfTab).filter((stage) => stage !== undefined);
    expect([...stages].sort()).toEqual([...VEHICLE_STAGES].sort());
  });

  it("lit l'effectif de l'onglet : le total pour « Tous », celui de l'étape sinon", () => {
    const counts = { all: 12, online: 5, ready: 2, incomplete: 3, sold: 2 };

    expect(countOfTab(counts, "tous")).toBe(12);
    expect(countOfTab(counts, "en-ligne")).toBe(5);
    expect(countOfTab(counts, "pret")).toBe(2);
    expect(countOfTab(counts, "a-completer")).toBe(3);
    expect(countOfTab(counts, "vendus")).toBe(2);
  });
});

describe("étapes — conditions SQL", () => {
  it("exclut l'archivé et le vendu des trois étapes hors vendu, et le capte dans « vendu »", () => {
    for (const stage of ["online", "ready", "incomplete"] as const) {
      expect(toStageWhere(stage), stage).toMatchObject({
        archivedAt: null,
        commercialStatus: { not: "SOLD" },
      });
    }
    expect(toStageWhere("sold")).toEqual({ commercialStatus: "SOLD" });
  });

  it("sépare « prêt » et « à compléter » par la même condition, l'une affirmée, l'autre niée", () => {
    const ready = toStageWhere("ready") as { media: unknown; prices: unknown; isPublished: boolean };
    const incomplete = toStageWhere("incomplete") as {
      NOT: { media: unknown; prices: unknown };
      isPublished: boolean;
    };

    expect(ready.isPublished).toBe(false);
    expect(incomplete.isPublished).toBe(false);
    expect(incomplete.NOT).toEqual({ media: ready.media, prices: ready.prices });
  });

  it("combine l'étape et la recherche sans que l'une écrase l'autre", () => {
    const where = toVehicleWhere({ search: "hilux", stage: "incomplete" }) as { AND: object[] };

    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND[0])).toContain("hilux");
    expect(where.AND[1]).toEqual(toStageWhere("incomplete"));
  });

  it("garde la forme d'origine quand aucune étape n'est demandée", () => {
    expect(toVehicleWhere({ search: "hilux" })).not.toHaveProperty("AND");
    expect(toVehicleWhere({})).toEqual({});
  });
});
