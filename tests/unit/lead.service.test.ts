import { afterEach, describe, expect, it } from "vitest";
import {
  addLeadActivity,
  addLeadNote,
  assignLead,
  configureLeadDependencies,
  listLeads,
  parseLeadActivityInput,
  parseLeadFilters,
  parseLeadNote,
  readLead,
  resetLeadDependencies,
  toLeadView,
  updateLeadStatus,
  type LeadActivityCreateData,
  type LeadActivityRepository,
  type LeadActivityView,
  type LeadFilters,
  type LeadNoteCreateData,
  type LeadNoteRepository,
  type LeadNoteView,
  type LeadRepository,
  type LeadRow,
  type LeadStatus,
} from "@/services/lead.service";
import type { Actor } from "@/services/identity.service";
import { customerActor, staffActor, visitorActor } from "./support/actors";

const leadManager: Actor = staffActor(["lead.view", "lead.assign", "lead.update"]);
const leadReader: Actor = staffActor(["lead.view"]);
const noLeadRights: Actor = staffActor(["vehicle.view"]);

function leadRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-1",
    reference: "LEAD-2026-000001",
    name: "Awa Diop",
    phone: "+221770000000",
    whatsapp: null,
    email: null,
    source: null,
    customerId: null,
    vehicleId: null,
    budgetMin: null,
    budgetMax: null,
    assignedSalespersonId: null,
    nextFollowUpAt: null,
    status: "NEW",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function leadRepository(initial: LeadRow[] = [leadRow()]) {
  const rows = [...initial];
  const statusUpdates: { id: string; status: LeadStatus }[] = [];
  const assignments: { id: string; staffId: string | null }[] = [];
  const listedFilters: LeadFilters[] = [];
  const repo: LeadRepository = {
    async list(filters) {
      listedFilters.push(filters);
      return rows.map((row) => ({ ...row }));
    },
    async findById(id) {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? { ...row } : null;
    },
    async updateStatus(id, status) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw new Error("missing lead");
      row.status = status;
      statusUpdates.push({ id, status });
      return { ...row };
    },
    async assign(id, staffId) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw new Error("missing lead");
      row.assignedSalespersonId = staffId;
      assignments.push({ id, staffId });
      return { ...row };
    },
  };
  return { repo, rows, statusUpdates, assignments, listedFilters };
}

function noteRepository() {
  const created: LeadNoteCreateData[] = [];
  const notes: LeadNoteView[] = [];
  const repo: LeadNoteRepository = {
    async listByLead() {
      return [...notes];
    },
    async create(data) {
      created.push(data);
      const view: LeadNoteView = {
        id: `note-${created.length}`,
        content: data.content,
        authorId: data.authorId,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      };
      notes.push(view);
      return { id: view.id };
    },
  };
  return { repo, created, notes };
}

function activityRepository() {
  const created: LeadActivityCreateData[] = [];
  const activities: LeadActivityView[] = [];
  const repo: LeadActivityRepository = {
    async listByLead() {
      return [...activities];
    },
    async create(data) {
      created.push(data);
      const view: LeadActivityView = {
        id: `act-${created.length}`,
        type: data.type,
        description: data.description,
        performedBy: data.performedBy,
        createdAt: new Date("2026-01-03T00:00:00Z"),
      };
      activities.push(view);
      return { id: view.id };
    },
  };
  return { repo, created, activities };
}

function setup(initial: LeadRow[] = [leadRow()]) {
  const leads = leadRepository(initial);
  const notes = noteRepository();
  const activities = activityRepository();
  configureLeadDependencies({ leads: leads.repo, notes: notes.repo, activities: activities.repo });
  return { leads, notes, activities };
}

afterEach(() => resetLeadDependencies());

describe("lead guards", () => {
  it("refuses a visitor and a customer (staff-only CRM)", async () => {
    setup();
    await expect(listLeads(visitorActor)).rejects.toThrowError(/authent/i);
    await expect(listLeads(customerActor)).rejects.toThrowError(/refus/i);
    await expect(readLead(customerActor, "lead-1")).rejects.toThrowError(/refus/i);
  });

  it("refuses a staff member without lead.view", async () => {
    setup();
    let code = "";
    try {
      await listLeads(noLeadRights);
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("FORBIDDEN");
  });
});

describe("listLeads / readLead", () => {
  it("lists with empty journal and history and passes validated filters", async () => {
    const { leads } = setup();
    const views = await listLeads(leadReader, { status: "NEW" });
    expect(views).toHaveLength(1);
    expect(views[0].notes).toEqual([]);
    expect(views[0].activities).toEqual([]);
    expect(leads.listedFilters).toEqual([{ status: "NEW" }]);
  });

  it("returns a detailed lead with its private journal and activity history", async () => {
    const { notes, activities } = setup();
    await addLeadNote(leadManager, "lead-1", "Rappel demain.");
    await addLeadActivity(leadManager, "lead-1", { type: "CALL", description: "Premier appel." });

    const view = await readLead(leadReader, "lead-1");
    expect(view.reference).toBe("LEAD-2026-000001");
    expect(view.notes).toHaveLength(1);
    expect(view.notes[0].content).toBe("Rappel demain.");
    expect(view.activities).toHaveLength(1);
    expect(notes.created).toHaveLength(1);
    expect(activities.created).toHaveLength(1);
  });

  it("never reveals whether an unknown lead exists (neutral NOT_FOUND)", async () => {
    setup();
    let error: { code: string; message: string } | null = null;
    try {
      await readLead(leadReader, "missing");
    } catch (caught) {
      error = caught as { code: string; message: string };
    }
    expect(error?.code).toBe("NOT_FOUND");
    expect(error?.message).not.toContain("missing");
  });

  it("rejects unknown filter fields", () => {
    expect(() => parseLeadFilters({ unknown: "x" } as never)).toThrowError(/invalides/i);
  });
});

describe("updateLeadStatus", () => {
  it("applies an allowed transition and records a STATUS_CHANGE activity", async () => {
    const { leads, activities } = setup();
    const view = await updateLeadStatus(leadManager, "lead-1", "CONTACTED");

    expect(view.status).toBe("CONTACTED");
    expect(leads.statusUpdates).toEqual([{ id: "lead-1", status: "CONTACTED" }]);
    expect(activities.created).toEqual([
      {
        leadId: "lead-1",
        type: "STATUS_CHANGE",
        description: "Statut : NEW → CONTACTED",
        performedBy: "staff-1",
      },
    ]);
  });

  it("refuses a skipped transition without writing anything", async () => {
    const { leads, activities } = setup();
    let code = "";
    try {
      await updateLeadStatus(leadManager, "lead-1", "COMPLETED");
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(leads.statusUpdates).toEqual([]);
    expect(activities.created).toEqual([]);
  });

  it("refuses an unknown status value", async () => {
    setup();
    await expect(updateLeadStatus(leadManager, "lead-1", "BOGUS" as LeadStatus)).rejects.toThrowError(/inconnu/i);
  });

  it("requires lead.update", async () => {
    setup();
    await expect(updateLeadStatus(leadReader, "lead-1", "CONTACTED")).rejects.toThrowError(/refus/i);
  });

  it("returns a neutral NOT_FOUND for an unknown lead", async () => {
    setup();
    await expect(updateLeadStatus(leadManager, "missing", "CONTACTED")).rejects.toThrowError(/introuvable/i);
  });
});

describe("assignLead", () => {
  it("assigns and unassigns a salesperson; requires lead.assign", async () => {
    const { leads } = setup();

    const assigned = await assignLead(leadManager, "lead-1", "staff-42");
    expect(assigned.assignedSalespersonId).toBe("staff-42");
    const cleared = await assignLead(leadManager, "lead-1", null);
    expect(cleared.assignedSalespersonId).toBeNull();
    expect(leads.assignments).toEqual([
      { id: "lead-1", staffId: "staff-42" },
      { id: "lead-1", staffId: null },
    ]);

    await expect(assignLead(leadReader, "lead-1", "staff-42")).rejects.toThrowError(/refus/i);
  });
});

describe("addLeadNote / addLeadActivity", () => {
  it("creates a private note with the author taken from the staff actor", async () => {
    const { notes } = setup();
    const result = await addLeadNote(leadManager, "lead-1", "  Client sérieux.  ");
    expect(result.id).toBe("note-1");
    expect(notes.created[0]).toEqual({ leadId: "lead-1", authorId: "staff-1", content: "Client sérieux." });
  });

  it("rejects an empty or oversized note; requires lead.update", async () => {
    setup();
    expect(() => parseLeadNote("   ")).toThrowError(/invalide/i);
    expect(() => parseLeadNote("x".repeat(2001))).toThrowError(/invalide/i);
    await expect(addLeadNote(leadReader, "lead-1", "contenu")).rejects.toThrowError(/refus/i);
  });

  it("validates the activity type and description", async () => {
    const { activities } = setup();
    await addLeadActivity(leadManager, "lead-1", { type: "WHATSAPP", description: "Message envoyé." });
    expect(activities.created[0]).toEqual({
      leadId: "lead-1",
      type: "WHATSAPP",
      description: "Message envoyé.",
      performedBy: "staff-1",
    });

    expect(() => parseLeadActivityInput({ type: "SMS", description: "x" })).toThrowError(/invalide/i);
    expect(() => parseLeadActivityInput({ type: "CALL", description: "" })).toThrowError(/invalide/i);
    expect(() => parseLeadActivityInput({ type: "CALL", description: "x", extra: 1 })).toThrowError(/invalide/i);
  });
});

describe("toLeadView", () => {
  it("copies the row and the provided journal/history", () => {
    const note: LeadNoteView = { id: "n1", content: "c", authorId: "s1", createdAt: new Date() };
    const view = toLeadView(leadRow({ status: "QUALIFIED" }), [note], []);
    expect(view.status).toBe("QUALIFIED");
    expect(view.notes).toEqual([note]);
    expect(view.activities).toEqual([]);
    expect(Object.keys(view).sort()).toEqual(
      [
        "activities",
        "assignedSalespersonId",
        "budgetMax",
        "budgetMin",
        "createdAt",
        "customerId",
        "email",
        "id",
        "name",
        "nextFollowUpAt",
        "notes",
        "phone",
        "reference",
        "source",
        "status",
        "updatedAt",
        "vehicleId",
        "whatsapp",
      ].sort(),
    );
  });
});
