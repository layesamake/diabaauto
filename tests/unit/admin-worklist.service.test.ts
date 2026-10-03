import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureWorklistCounter,
  listWorklist,
  resetWorklistCounter,
  type WorklistCounts,
} from "@/services/admin-worklist.service";
import { staffActor, visitorActor } from "@/tests/unit/support/actors";

/**
 * Liste « À traiter » de l'accueil.
 *
 * Elle remplace un annuaire de rubriques : ce qui compte est donc ce qu'elle MONTRE et ce qu'elle
 * TAIT. Un commercial ne doit pas voir une action qu'il n'a pas le droit de faire, ni une ligne à
 * zéro, et l'ordre doit rester celui de l'urgence commerciale.
 */

const RIEN: WorklistCounts = {
  requestsReceived: 0,
  resellerApplicationsPending: 0,
  leadsToFollowUp: 0,
  leadsUnassigned: 0,
  vehiclesReadyToPublish: 0,
  vehiclesPublishedWithoutImage: 0,
};

function compte(overrides: Partial<WorklistCounts> = {}): WorklistCounts {
  return { ...RIEN, ...overrides };
}

let dernierNow: Date | null = null;

function sert(counts: WorklistCounts) {
  configureWorklistCounter(async (now) => {
    dernierNow = now;
    return counts;
  });
}

beforeEach(() => {
  dernierNow = null;
  sert(RIEN);
});

afterEach(() => {
  resetWorklistCounter();
});

describe("listWorklist — ce qui s'affiche", () => {
  it("ne garde que les situations réellement en attente", async () => {
    sert(compte({ requestsReceived: 2, vehiclesReadyToPublish: 1 }));

    const items = await listWorklist(staffActor());

    expect(items.map((item) => item.key)).toEqual(["demandes-sans-reponse", "vehicules-a-publier"]);
  });

  it("rend une liste vide quand il n'y a rien à faire", async () => {
    expect(await listWorklist(staffActor())).toEqual([]);
  });

  it("accorde les libellés en nombre", async () => {
    sert(compte({ requestsReceived: 1, leadsToFollowUp: 3 }));

    const items = await listWorklist(staffActor());

    expect(items[0]?.title).toBe("1 demande sans réponse");
    expect(items[1]?.title).toBe("3 prospects à rappeler");
  });

  it("classe les personnes qui attendent avant les véhicules", async () => {
    sert(
      compte({
        requestsReceived: 1,
        leadsToFollowUp: 1,
        resellerApplicationsPending: 1,
        vehiclesPublishedWithoutImage: 1,
        vehiclesReadyToPublish: 1,
      }),
    );

    const items = await listWorklist(staffActor());

    // Un client qui attend une réponse peut aller voir ailleurs ; un véhicule attendra demain.
    expect(items.map((item) => item.key)).toEqual([
      "demandes-sans-reponse",
      "prospects-a-rappeler",
      "revendeurs-en-attente",
      "vehicules-sans-photo",
      "vehicules-a-publier",
    ]);
  });

  it("porte pour chaque entrée un lien et une action utilisables", async () => {
    sert(compte({ requestsReceived: 1, vehiclesReadyToPublish: 2 }));

    for (const item of await listWorklist(staffActor())) {
      expect(item.href.startsWith("/admin/")).toBe(true);
      expect(item.actionLabel.length).toBeGreaterThan(0);
      expect(item.count).toBeGreaterThan(0);
    }
  });
});

describe("listWorklist — permissions", () => {
  it("exige d'être du personnel habilité", async () => {
    await expect(listWorklist(visitorActor)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(listWorklist(staffActor(["customer.view"]))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ne propose jamais une action que l'acteur ne peut pas faire", async () => {
    sert(
      compte({
        requestsReceived: 2,
        leadsUnassigned: 1,
        resellerApplicationsPending: 1,
        vehiclesReadyToPublish: 1,
        vehiclesPublishedWithoutImage: 1,
      }),
    );

    // Un commercial qui voit les véhicules sans pouvoir publier, ni assigner, ni traiter les revendeurs.
    const items = await listWorklist(staffActor(["vehicle.view", "lead.view"]));

    expect(items.map((item) => item.key)).toEqual(["demandes-sans-reponse", "vehicules-sans-photo"]);
    expect(items.some((item) => item.key === "vehicules-a-publier")).toBe(false);
    expect(items.some((item) => item.key === "prospects-non-assignes")).toBe(false);
    expect(items.some((item) => item.key === "revendeurs-en-attente")).toBe(false);
  });

  it("montre « prêt à publier » au seul porteur de vehicle.publish", async () => {
    sert(compte({ vehiclesReadyToPublish: 3 }));

    expect(await listWorklist(staffActor(["vehicle.view"]))).toEqual([]);
    expect(await listWorklist(staffActor(["vehicle.view", "vehicle.publish"]))).toHaveLength(1);
  });
});

describe("listWorklist — instant de référence", () => {
  it("transmet l'instant reçu, pour que les relances dues soient calculées en base", async () => {
    const instant = new Date("2026-10-03T16:00:00Z");

    await listWorklist(staffActor(), instant);

    expect(dernierNow).toBe(instant);
  });
});
