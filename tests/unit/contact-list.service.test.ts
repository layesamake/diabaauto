import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { staffActor } from "@/tests/unit/support/actors";

const listLeads = vi.fn();
const listCustomRequests = vi.fn();
const listCustomers = vi.fn();
const listResellerApplications = vi.fn();

vi.mock("@/services/lead.service", () => ({ listLeads: (...args: unknown[]) => listLeads(...args) }));
vi.mock("@/services/custom-request.service", () => ({
  listCustomRequests: (...args: unknown[]) => listCustomRequests(...args),
}));
vi.mock("@/services/staff-customer.service", () => ({
  listCustomers: (...args: unknown[]) => listCustomers(...args),
}));
vi.mock("@/services/reseller-application.service", () => ({
  listResellerApplications: (...args: unknown[]) => listResellerApplications(...args),
}));

import {
  applicationToContact,
  countByTab,
  customerToContact,
  filterByTab,
  isContactTab,
  leadToContact,
  listContacts,
  requestToContact,
  sortContacts,
  visibleTabs,
} from "@/services/contact-list.service";

/**
 * Liste unique des contacts.
 *
 * Deux propriétés comptent : (1) la liste « À traiter » ne contredit jamais l'accueil, dont elle
 * reprend les règles ; (2) un acteur ne voit que les sources qu'il a le droit de lire, sans que le
 * refus d'une source n'interrompe les autres.
 */

const NOW = new Date("2026-10-03T12:00:00Z");
const day = (iso: string) => new Date(`${iso}T08:00:00Z`);

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    reference: "LD-1",
    name: "Awa Diop",
    phone: "+221770000000",
    whatsapp: null,
    email: null,
    source: null,
    customerId: null,
    vehicleId: null,
    budgetMin: null,
    budgetMax: null,
    assignedSalespersonId: "s1",
    nextFollowUpAt: null,
    status: "CONTACTED",
    createdAt: day("2026-09-20"),
    updatedAt: day("2026-09-20"),
    notes: [],
    activities: [],
    ...overrides,
  } as never;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    criteria: { brand: "Toyota", model: "Hilux" },
    budgetMin: null,
    budgetMax: null,
    status: "RECEIVED",
    createdAt: day("2026-09-25"),
    ...overrides,
  } as never;
}

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    firstName: "Moussa",
    lastName: "Fall",
    phone: "+221771111111",
    whatsapp: null,
    city: "Dakar",
    country: "SN",
    segment: "INDIVIDUAL",
    pricingProfile: "STANDARD",
    resellerStatus: "NOT_APPLICABLE",
    createdAt: day("2026-08-01"),
    ...overrides,
  } as never;
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    customerId: "c9",
    companyName: "Garage Sow",
    businessType: "Garage",
    estimatedVolume: "10 / an",
    status: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: day("2026-09-28"),
    updatedAt: day("2026-09-28"),
    ...overrides,
  } as never;
}

beforeEach(() => {
  listLeads.mockReset().mockResolvedValue([]);
  listCustomRequests.mockReset().mockResolvedValue([]);
  listCustomers.mockReset().mockResolvedValue([]);
  listResellerApplications.mockReset().mockResolvedValue([]);
});

describe("contacts — ce qui attend une réponse", () => {
  it("signale un prospect dont la relance est arrivée", () => {
    const row = leadToContact(lead({ nextFollowUpAt: day("2026-10-01") }), NOW);

    expect(row.attention).toContain("À rappeler");
    expect(row.priority).toBe(2);
  });

  it("ne signale pas une relance future", () => {
    expect(leadToContact(lead({ nextFollowUpAt: day("2026-10-09") }), NOW).attention).toBeNull();
  });

  it("ne relance pas un prospect clos, même relance échue", () => {
    for (const status of ["LOST", "COMPLETED", "ORDER_CONFIRMED"]) {
      const row = leadToContact(lead({ status, nextFollowUpAt: day("2026-10-01") }), NOW);
      expect(row.attention, status).toBeNull();
    }
  });

  it("signale un prospect nouveau que personne ne suit, pas un prospect nouveau déjà assigné", () => {
    expect(leadToContact(lead({ status: "NEW", assignedSalespersonId: null }), NOW).attention).toContain(
      "personne ne le suit",
    );
    expect(leadToContact(lead({ status: "NEW", assignedSalespersonId: "s1" }), NOW).attention).toBeNull();
  });

  it("signale une demande reçue, pas une demande déjà qualifiée", () => {
    expect(requestToContact(request()).attention).toBe("Pas encore de réponse");
    expect(requestToContact(request({ status: "QUALIFIED" })).attention).toBeNull();
  });

  it("signale une demande Revendeur en attente, pas celle déjà examinée ou tranchée", () => {
    expect(applicationToContact(application()).attention).toContain("Décision attendue");
    for (const status of ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"]) {
      expect(applicationToContact(application({ status })).attention, status).toBeNull();
    }
  });

  it("ne marque jamais un client comme « à traiter »", () => {
    expect(customerToContact(customer()).attention).toBeNull();
  });
});

describe("contacts — ordre et onglets", () => {
  const rows = [
    customerToContact(customer()),
    applicationToContact(application()),
    leadToContact(lead({ status: "NEW", assignedSalespersonId: null }), NOW),
    requestToContact(request()),
    leadToContact(lead({ id: "l2", nextFollowUpAt: day("2026-10-01") }), NOW),
  ];

  it("met d'abord ce qui attend, du plus urgent au moins urgent, puis le reste", () => {
    expect(sortContacts(rows).map((row) => row.key)).toEqual([
      "demande:r1",
      "prospect:l2",
      "prospect:l1",
      "revendeur:a1",
      "client:c1",
    ]);
  });

  it("départage deux urgences égales par ancienneté : celui qui attend depuis le plus longtemps d'abord", () => {
    const sorted = sortContacts([
      requestToContact(request({ id: "recente", createdAt: day("2026-10-02") })),
      requestToContact(request({ id: "ancienne", createdAt: day("2026-09-01") })),
    ]);

    expect(sorted.map((row) => row.key)).toEqual(["demande:ancienne", "demande:recente"]);
  });

  it("garde chaque clé unique même quand deux sources partagent un identifiant", () => {
    const keys = [
      leadToContact(lead({ id: "x" }), NOW),
      requestToContact(request({ id: "x" })),
      customerToContact(customer({ id: "x" })),
      applicationToContact(application({ id: "x" })),
    ].map((row) => row.key);

    expect(new Set(keys).size).toBe(4);
  });

  it("« À traiter » ne contient que des lignes avec un motif ; « Tous » les contient toutes", () => {
    expect(filterByTab(rows, "a-traiter").every((row) => row.attention !== null)).toBe(true);
    expect(filterByTab(rows, "tous")).toHaveLength(rows.length);
  });

  it("chaque onglet de genre ne garde que son genre", () => {
    expect(filterByTab(rows, "prospects").every((row) => row.kind === "prospect")).toBe(true);
    expect(filterByTab(rows, "demandes").every((row) => row.kind === "demande")).toBe(true);
    expect(filterByTab(rows, "clients").every((row) => row.kind === "client")).toBe(true);
    expect(filterByTab(rows, "revendeurs").every((row) => row.kind === "revendeur")).toBe(true);
  });

  it("compte chaque onglet", () => {
    expect(countByTab(rows)).toEqual({
      "a-traiter": 4,
      tous: 5,
      prospects: 2,
      demandes: 1,
      clients: 1,
      revendeurs: 1,
    });
  });

  it("ne propose que les onglets que l'acteur peut alimenter", () => {
    expect(visibleTabs(["revendeur"])).toEqual(["a-traiter", "tous", "revendeurs"]);
  });

  it("valide l'onglet reçu dans l'URL", () => {
    expect(isContactTab("tous")).toBe(true);
    expect(isContactTab("admin")).toBe(false);
    expect(isContactTab(undefined)).toBe(false);
  });
});

describe("contacts — droits", () => {
  it("lit les quatre sources pour un acteur qui a toutes les permissions", async () => {
    await listContacts(staffActor(), {}, NOW);

    expect(listLeads).toHaveBeenCalledOnce();
    expect(listCustomRequests).toHaveBeenCalledOnce();
    expect(listCustomers).toHaveBeenCalledOnce();
    expect(listResellerApplications).toHaveBeenCalledOnce();
  });

  it("ne lit PAS une source que l'acteur n'a pas le droit de voir", async () => {
    const result = await listContacts(staffActor(["reseller.view"]), { tab: "tous" }, NOW);

    expect(listLeads).not.toHaveBeenCalled();
    expect(listCustomRequests).not.toHaveBeenCalled();
    expect(listCustomers).not.toHaveBeenCalled();
    expect(listResellerApplications).toHaveBeenCalledOnce();
    expect(result.kinds).toEqual(["revendeur"]);
  });

  it("ne montre ni clients ni coordonnées de prospects à qui ne peut lire que les revendeurs", async () => {
    listResellerApplications.mockResolvedValue([application()]);
    listCustomers.mockResolvedValue([customer()]);

    const result = await listContacts(staffActor(["reseller.view"]), { tab: "tous" }, NOW);

    expect(result.rows.map((row) => row.kind)).toEqual(["revendeur"]);
  });

  it("refuse un acteur du personnel qui ne peut lire aucune source", async () => {
    await expect(listContacts(staffActor(["vehicle.view"]), {}, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("refuse un visiteur et un client", async () => {
    await expect(listContacts({ kind: "visitor" } as never, {}, NOW)).rejects.toBeInstanceOf(AppError);
    await expect(
      listContacts({ kind: "customer", customerId: "c1", userId: "u1" } as never, {}, NOW),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("transmet la recherche aux sources qui savent chercher", async () => {
    await listContacts(staffActor(), { search: "  awa " }, NOW);

    expect(listLeads).toHaveBeenCalledWith(expect.anything(), { search: "awa" });
    expect(listCustomers).toHaveBeenCalledWith(expect.anything(), { search: "awa" });
  });

  it("filtre sur le texte affiché les sources qui ne cherchent pas", async () => {
    listCustomRequests.mockResolvedValue([request(), request({ id: "r2", criteria: { brand: "Kia", model: "Rio" } })]);
    listResellerApplications.mockResolvedValue([application(), application({ id: "a2", companyName: "Auto Ndiaye" })]);

    const result = await listContacts(staffActor(), { tab: "tous", search: "hilux" }, NOW);

    expect(result.rows.map((row) => row.key)).toEqual(["demande:r1"]);
  });

  it("compte les onglets sur l'ensemble de la recherche, pas sur le seul onglet affiché", async () => {
    listLeads.mockResolvedValue([lead()]);
    listCustomRequests.mockResolvedValue([request()]);

    const result = await listContacts(staffActor(), { tab: "prospects" }, NOW);

    expect(result.rows).toHaveLength(1);
    expect(result.counts.tous).toBe(2);
    expect(result.counts.demandes).toBe(1);
  });

  it("laisse l'erreur d'une source remonter plutôt que d'afficher une liste incomplète", async () => {
    listCustomers.mockRejectedValue(new Error("base indisponible"));

    await expect(listContacts(staffActor(), {}, NOW)).rejects.toThrow("base indisponible");
  });
});
