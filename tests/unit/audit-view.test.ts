import { describe, expect, it } from "vitest";
import {
  ACTIONS_BY_CATEGORY,
  ACTION_LABELS,
  AUDIT_CATEGORIES,
  actionLabel,
  auditHref,
  categoryOfAction,
  describeChanges,
  entityHref,
  entityLabel,
  parseAuditCategory,
  parseAuditPeriod,
  periodStart,
  reasonOf,
} from "@/lib/audit-view";
import { AUDITED_ACTIONS } from "@/services/audit.service";

/**
 * Vocabulaire du journal d'activité.
 *
 * La propriété qui compte : **aucune action auditée ne peut échapper à l'écran**. Une action ajoutée
 * à `AUDITED_ACTIONS` sans libellé ni famille serait écrite au journal mais illisible, voire absente
 * des onglets ; ces tests le signalent avant la mise en ligne.
 */

describe("journal — couverture des actions", () => {
  it("donne un libellé à chaque action auditée", () => {
    for (const action of AUDITED_ACTIONS) {
      expect(ACTION_LABELS[action]?.length, action).toBeGreaterThan(5);
    }
  });

  it("range chaque action auditée dans exactement une famille", () => {
    for (const action of AUDITED_ACTIONS) {
      const familles = AUDIT_CATEGORIES.filter((key) => (ACTIONS_BY_CATEGORY[key] as readonly string[]).includes(action));
      expect(familles, action).toHaveLength(1);
    }
  });

  it("n'invente aucune action : chaque action rangée est une action auditée", () => {
    const rangées = AUDIT_CATEGORIES.flatMap((key) => [...ACTIONS_BY_CATEGORY[key]]);

    expect([...rangées].sort()).toEqual([...AUDITED_ACTIONS].sort());
  });

  it("retombe sur un texte neutre pour une action inconnue, sans la deviner", () => {
    expect(actionLabel("vehicle.explode")).toBe("Action inconnue");
    expect(categoryOfAction("vehicle.explode")).toBeNull();
  });
});

describe("journal — URL et période", () => {
  it("retombe sur « Tout » et 30 jours pour toute valeur inconnue", () => {
    for (const value of ["", "admin", null, undefined, 3]) {
      expect(parseAuditCategory(value), String(value)).toBe("tout");
      expect(parseAuditPeriod(value), String(value)).toBe("30j");
    }
  });

  it("calcule le début de période sur l'instant donné, ou aucun pour tout l'historique", () => {
    const now = new Date("2026-10-30T12:00:00Z");

    expect(periodStart("7j", now)?.toISOString()).toBe("2026-10-23T12:00:00.000Z");
    expect(periodStart("30j", now)?.toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(periodStart("tout", now)).toBeNull();
  });

  it("construit des liens sobres : l'adresse nue pour le réglage par défaut", () => {
    expect(auditHref("tout", "30j")).toBe("/admin/audit");
    expect(auditHref("vehicules", "30j")).toBe("/admin/audit?famille=vehicules");
    expect(auditHref("tout", "7j", 2)).toBe("/admin/audit?periode=7j&page=2");
  });
});

describe("journal — objet concerné", () => {
  it("ne fabrique de lien que vers un écran qui existe", () => {
    expect(entityHref("Vehicle", "abc")).toBe("/admin/vehicules/abc");
    expect(entityHref("Order", "abc")).toBe("/admin/commandes?commande=abc");
    expect(entityHref("CustomerProfile", "abc")).toBe("/admin/clients/abc");
    // Aucun écran n'affiche une réservation, une ligne de prix ou un profil du personnel isolé.
    for (const type of ["Reservation", "VehiclePrice", "staff_profile", "Autre"]) {
      expect(entityHref(type, "abc"), type).toBeNull();
    }
    expect(entityHref("Vehicle", null)).toBeNull();
  });

  it("encode l'identifiant : aucun caractère ne peut casser l'adresse", () => {
    expect(entityHref("Vehicle", "a/b?c")).toBe("/admin/vehicules/a%2Fb%3Fc");
  });

  it("nomme l'objet, ou rend le type tel quel s'il est inconnu", () => {
    expect(entityLabel("Vehicle")).toBe("Véhicule");
    expect(entityLabel("Inconnu")).toBe("Inconnu");
  });
});

describe("journal — changements", () => {
  it("ne liste que les champs qui diffèrent", () => {
    expect(describeChanges({ status: "NEW", city: "Dakar" }, { status: "CONTACTED", city: "Dakar" })).toEqual([
      { field: "status", before: "NEW", after: "CONTACTED" },
    ]);
  });

  it("montre un champ apparu ou disparu", () => {
    expect(describeChanges({ a: 1 }, { b: 2 })).toEqual([
      { field: "a", before: "1", after: null },
      { field: "b", before: null, after: "2" },
    ]);
  });

  it("ne mêle pas le motif aux changements : il s'affiche à part", () => {
    expect(describeChanges({ status: "A" }, { status: "B", reason: "Client injoignable" })).toEqual([
      { field: "status", before: "A", after: "B" },
    ]);
    expect(reasonOf({ status: "B", reason: "Client injoignable" })).toBe("Client injoignable");
    expect(reasonOf({ status: "B" })).toBeNull();
    expect(reasonOf(null)).toBeNull();
    expect(reasonOf("texte")).toBeNull();
    expect(reasonOf({ reason: "   " })).toBeNull();
  });

  it("supporte des valeurs absentes ou non objet sans lever d'erreur", () => {
    expect(describeChanges(null, null)).toEqual([]);
    expect(describeChanges("x", [1])).toEqual([]);
    expect(describeChanges(null, { n: { deep: true } })).toEqual([{ field: "n", before: null, after: '{"deep":true}' }]);
  });
});
