import { describe, expect, it } from "vitest";
import { ADMIN_NAV, allowedAdminLinks, allowedAdminNav } from "@/components/admin/admin-nav";
import { RUBRIC_ICON_NAMES } from "@/components/admin/rubric-icons";
import type { PermissionCode } from "@/services/permissions.service";
import { ALL_PERMISSIONS } from "@/tests/unit/support/actors";

/**
 * Garde-fou de la navigation du back-office.
 *
 * Deux propriétés valent d'être tenues :
 * 1. **Aucun lien proposé n'est inaccessible.** Un menu qui mène à un refus est pire qu'un menu
 *    incomplet : il apprend l'organisation interne sans rien ouvrir.
 * 2. **Le premier rang reste court.** C'est tout l'objet du regroupement : si quelqu'un y rajoute
 *    une entrée plus tard, ce test le signale au lieu de laisser l'écran redevenir un annuaire.
 */

function toutesLesEntrees() {
  return ADMIN_NAV.flatMap((group) => [...group.entries]);
}

describe("navigation — catalogue", () => {
  it("donne une icône connue à chaque entrée", () => {
    for (const entry of toutesLesEntrees()) {
      expect(RUBRIC_ICON_NAMES, `icône manquante pour ${entry.label}`).toContain(entry.icon);
    }
  });

  it("pointe chaque entrée vers un écran du back-office", () => {
    for (const entry of toutesLesEntrees()) {
      expect(entry.href === "/admin" || entry.href.startsWith("/admin/"), entry.href).toBe(true);
    }
  });

  it("décrit chaque entrée en une phrase, qui sert d'aide au survol", () => {
    for (const entry of toutesLesEntrees()) {
      expect(entry.description.length, entry.label).toBeGreaterThan(10);
    }
  });

  it("garde le premier rang court : quatre entrées de travail, pas un annuaire", () => {
    const travail = ADMIN_NAV.find((group) => group.key === "travail");

    expect(travail?.entries.map((entry) => entry.label)).toEqual([
      "Aujourd'hui",
      "Véhicules",
      "Contacts",
      "Commandes",
    ]);
  });

  it("range hors du chemin quotidien ce qui se règle une fois par mois", () => {
    const reglages = ADMIN_NAV.find((group) => group.key === "reglages");

    expect(reglages?.entries.map((entry) => entry.label)).toEqual([
      "Marques et modèles",
      "Équipe",
      "Journal d'activité",
      "Paramètres",
      "Mon compte",
    ]);
  });
});

describe("navigation — permissions", () => {
  it("montre tout à un acteur qui porte toutes les permissions", () => {
    const liens = allowedAdminLinks(ALL_PERMISSIONS);

    expect(liens).toHaveLength(toutesLesEntrees().length);
  });

  it("ne propose jamais un écran que l'acteur ne peut pas ouvrir", () => {
    const permissions: PermissionCode[] = ["vehicle.view", "lead.view"];

    for (const lien of allowedAdminLinks(permissions)) {
      // « Mon compte » est ouvert à tout membre du personnel ; le reste exige sa permission.
      if (lien.anyOf) {
        expect(
          lien.anyOf.some((permission) => permissions.includes(permission)),
          lien.label,
        ).toBe(true);
        continue;
      }
      if (lien.permission === null) continue;
      expect(permissions, lien.label).toContain(lien.permission);
    }
  });

  it("fait disparaître Contacts quand aucun de ses écrans n'est permis", () => {
    const labels = allowedAdminNav(["vehicle.view"]).flatMap((group) =>
      group.entries.map((entry) => entry.label),
    );

    expect(labels).toContain("Véhicules");
    expect(labels).not.toContain("Contacts");
  });

  it("garde Contacts dès qu'une seule de ses sources est lisible", () => {
    // Un acteur qui voit les revendeurs mais ni les prospects, ni les demandes, ni les clients.
    const nav = allowedAdminNav(["vehicle.view", "reseller.view"]);
    const contacts = nav.flatMap((group) => group.entries).find((entry) => entry.label === "Contacts");

    expect(contacts?.href).toBe("/admin/contacts");
  });

  it("ne propose plus les quatre anciennes listes comme entrées de menu", () => {
    const hrefs = toutesLesEntrees().map((entry) => entry.href);

    for (const ancien of ["/admin/prospects", "/admin/demandes", "/admin/clients", "/admin/revendeurs"]) {
      expect(hrefs, ancien).not.toContain(ancien);
    }
  });

  it("ne garde que « Mon compte » pour un acteur sans aucune permission", () => {
    const groups = allowedAdminNav([]);

    expect(groups.flatMap((group) => group.entries).map((entry) => entry.label)).toEqual(["Mon compte"]);
  });
});
