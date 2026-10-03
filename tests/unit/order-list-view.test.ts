import { describe, expect, it } from "vitest";
import {
  ORDER_TABS,
  ORDER_TAB_LABELS,
  countOrdersByTab,
  filterOrdersByTab,
  nextStepOf,
  orderTabHref,
  parseOrderTab,
  tabOfStatus,
} from "@/components/admin/order-list-view";
import { ORDER_STATUSES } from "@/lib/i18n/staff-orders.fr";
import { canTransitionOrderStatus } from "@/services/transitions.service";

/**
 * Onglets de la liste des commandes.
 *
 * Trois propriétés : chaque commande tombe dans exactement un onglet de phase (aucune ne disparaît),
 * la « prochaine étape » affichée est toujours une transition que la machine à états autorise, et
 * l'URL ne peut pas mener à un état incohérent.
 */

const rows = ORDER_STATUSES.map((status, index) => ({ id: String(index), status }));

describe("onglets de commandes — phases", () => {
  it("range chaque statut dans exactement un onglet de phase", () => {
    for (const status of ORDER_STATUSES) {
      const tabs = (["en-cours", "livrees", "annulees"] as const).filter(
        (tab) => filterOrdersByTab([{ status }], tab).length === 1,
      );
      expect(tabs, status).toEqual([tabOfStatus(status)]);
    }
  });

  it("ne perd aucune commande : les trois phases additionnées valent « Toutes »", () => {
    const counts = countOrdersByTab(rows);

    expect(counts["en-cours"] + counts.livrees + counts.annulees).toBe(counts.toutes);
    expect(counts.toutes).toBe(ORDER_STATUSES.length);
  });

  it("tient pour « en cours » tout ce qui n'est ni livré ni annulé", () => {
    expect(tabOfStatus("DELIVERED")).toBe("livrees");
    expect(tabOfStatus("CANCELLED")).toBe("annulees");
    for (const status of ["CONFIRMED", "PROCESSING", "IN_TRANSIT", "ARRIVED"] as const) {
      expect(tabOfStatus(status), status).toBe("en-cours");
    }
  });
});

describe("onglets de commandes — prochaine étape", () => {
  it("ne propose que des transitions que la machine à états autorise", () => {
    for (const status of ORDER_STATUSES) {
      const next = nextStepOf(status);
      if (next) {
        expect(canTransitionOrderStatus(status, next.to), status).toBe(true);
      }
    }
  });

  it("ne présente jamais l'annulation comme la suite normale", () => {
    for (const status of ORDER_STATUSES) {
      expect(nextStepOf(status)?.to, status).not.toBe("CANCELLED");
    }
  });

  it("n'en propose aucune pour une commande terminée", () => {
    expect(nextStepOf("DELIVERED")).toBeNull();
    expect(nextStepOf("CANCELLED")).toBeNull();
  });

  it("nomme le statut visé", () => {
    expect(nextStepOf("CONFIRMED")?.label).toBe("Passer en « en préparation »");
    expect(nextStepOf("ARRIVED")?.label).toBe("Passer en « livrée »");
  });
});

describe("onglets de commandes — URL", () => {
  it("retombe sur « En cours » pour toute valeur inconnue", () => {
    for (const value of ["", "admin", "TOUTES", 3, null, undefined]) {
      expect(parseOrderTab(value), String(value)).toBe("en-cours");
    }
    for (const tab of ORDER_TABS) expect(parseOrderTab(tab)).toBe(tab);
  });

  it("donne un libellé à chaque onglet", () => {
    for (const tab of ORDER_TABS) expect(ORDER_TAB_LABELS[tab].length).toBeGreaterThan(2);
  });

  it("construit des liens qui gardent la recherche et encodent ses caractères", () => {
    expect(orderTabHref("en-cours", "")).toBe("/admin/commandes");
    expect(orderTabHref("livrees", "")).toBe("/admin/commandes?etat=livrees");
    expect(orderTabHref("toutes", "CMD-1")).toBe("/admin/commandes?etat=toutes&recherche=CMD-1");
    expect(new URL(orderTabHref("en-cours", "a&etat=toutes"), "https://x.test").searchParams.get("etat")).toBeNull();
  });
});
