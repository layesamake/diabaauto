import { describe, expect, it } from "vitest";
import {
  STAFF_TABS,
  countStaffByTab,
  filterStaffByTab,
  parseStaffTab,
  staffTabHref,
} from "@/components/admin/staff-list-view";

const accounts = [
  { id: "a", status: "ACTIVE" as const },
  { id: "b", status: "ACTIVE" as const },
  { id: "c", status: "SUSPENDED" as const },
  { id: "d", status: "DISABLED" as const },
];

describe("onglets du personnel", () => {
  it("sépare ceux qui travaillent des autres, sans en perdre", () => {
    expect(filterStaffByTab(accounts, "en-poste").map((a) => a.id)).toEqual(["a", "b"]);
    expect(filterStaffByTab(accounts, "hors-service").map((a) => a.id)).toEqual(["c", "d"]);
    expect(filterStaffByTab(accounts, "tous")).toHaveLength(4);
  });

  it("compte chaque onglet, et les deux phases additionnées valent « Tous »", () => {
    const counts = countStaffByTab(accounts);

    expect(counts).toEqual({ "en-poste": 2, "hors-service": 2, tous: 4 });
    expect(counts["en-poste"] + counts["hors-service"]).toBe(counts.tous);
  });

  it("retombe sur « En poste » pour toute valeur inconnue", () => {
    for (const value of ["", "admin", null, undefined, 4]) {
      expect(parseStaffTab(value), String(value)).toBe("en-poste");
    }
    for (const tab of STAFF_TABS) expect(parseStaffTab(tab)).toBe(tab);
  });

  it("donne l'adresse nue à l'onglet par défaut", () => {
    expect(staffTabHref("en-poste")).toBe("/admin/personnel");
    expect(staffTabHref("hors-service")).toBe("/admin/personnel?compte=hors-service");
  });
});
