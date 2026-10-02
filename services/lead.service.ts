import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createLeadActivityRepository } from "@/repositories/lead-activity.repository";
import { createLeadNoteRepository } from "@/repositories/lead-note.repository";
import { createLeadRepository } from "@/repositories/lead.repository";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import {
  canTransitionLeadStatus,
  leadStatusTransitions,
  type LeadStatus,
} from "@/services/transitions.service";

/**
 * CRM — prospects (doc 03 §11, contrat lot 5 §3 et §5).
 *
 * Le back-office lit/assigne/qualifie les `leads`, tient un journal privé (`lead_notes`) et
 * l'historique d'activités (`lead_activities`). Aucune donnée prospect n'est exposée hors personnel :
 * tout point d'entrée exige une permission via `services/access.service.ts` (`lead.view`,
 * `lead.assign`, `lead.update`), et une ressource non visible renvoie un refus **neutre**
 * (`NOT_FOUND`, T11/T12) — jamais FORBIDDEN, pour ne pas révéler l'existence d'une fiche privée.
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit des repositories (ports), comme
 * `services/custom-request.service.ts`. Chaque écriture de statut produit en plus une entrée
 * d'historique `LeadActivityType.STATUS_CHANGE` — il n'existe **aucune** action d'audit canonique
 * pour les prospects, aucune n'est donc inventée (`AUDITED_ACTIONS`).
 */

export type { LeadStatus };
export { canTransitionLeadStatus, leadStatusTransitions };

/** Types d'activité prospect — enum corpus `LeadActivityType`, aucune valeur inventée. */
export type LeadActivityType = "CALL" | "WHATSAPP" | "EMAIL" | "MEETING" | "STATUS_CHANGE";

export type LeadActivityView = {
  id: string;
  type: LeadActivityType;
  description: string;
  performedBy: string | null;
  createdAt: Date;
};

export type LeadNoteView = {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date;
};

/** Ligne telle que retournée par le repository `lead.repository.ts`. */
export type LeadRow = {
  id: string;
  reference: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  source: string | null;
  customerId: string | null;
  vehicleId: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  assignedSalespersonId: string | null;
  nextFollowUpAt: Date | null;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Vue d'une fiche prospect servie au personnel. `notes` et `activities` sont peuplés par `readLead`
 * (fiche détaillée) et valent `[]` dans `listLeads` (la liste ne charge pas le journal).
 */
export type LeadView = LeadRow & {
  notes: LeadNoteView[];
  activities: LeadActivityView[];
};

export type LeadActivityInput = {
  type: LeadActivityType;
  description: string;
};

export type LeadNoteCreateData = {
  leadId: string;
  authorId: string;
  content: string;
};

export type LeadActivityCreateData = {
  leadId: string;
  type: LeadActivityType;
  description: string;
  performedBy: string | null;
};

export type LeadFilters = {
  status?: LeadStatus;
  assignedSalespersonId?: string;
  search?: string;
};

/** Port d'accès aux `leads` (`repositories/lead.repository.ts`). */
export type LeadRepository = {
  list(filters: LeadFilters): Promise<LeadRow[]>;
  findById(id: string): Promise<LeadRow | null>;
  updateStatus(id: string, status: LeadStatus): Promise<LeadRow>;
  assign(id: string, staffId: string | null): Promise<LeadRow>;
};

/** Port d'accès au journal privé (`repositories/lead-note.repository.ts`). */
export type LeadNoteRepository = {
  listByLead(leadId: string): Promise<LeadNoteView[]>;
  create(data: LeadNoteCreateData): Promise<{ id: string }>;
};

/** Port d'accès à l'historique d'activités (`repositories/lead-activity.repository.ts`). */
export type LeadActivityRepository = {
  listByLead(leadId: string): Promise<LeadActivityView[]>;
  create(data: LeadActivityCreateData): Promise<{ id: string }>;
};

export type LeadDependencies = {
  leads: LeadRepository;
  notes: LeadNoteRepository;
  activities: LeadActivityRepository;
};

let dependencies: LeadDependencies = {
  leads: createLeadRepository(),
  notes: createLeadNoteRepository(),
  activities: createLeadActivityRepository(),
};

/** Remplace un repository (tests unitaires, ou composition serveur). */
export function configureLeadDependencies(next: Partial<LeadDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les repositories Prisma par défaut. */
export function resetLeadDependencies(): void {
  dependencies = {
    leads: createLeadRepository(),
    notes: createLeadNoteRepository(),
    activities: createLeadActivityRepository(),
  };
}

// ---------------------------------------------------------------------------
// Analyse des entrées
// ---------------------------------------------------------------------------

const NOT_FOUND_MESSAGE = "Ressource introuvable.";
const CONTENT_MAX_LENGTH = 2000;
const ACTIVITY_DESCRIPTION_MAX_LENGTH = 500;
const SEARCH_MAX_LENGTH = 120;

const LEAD_STATUSES: readonly LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "NEGOTIATION",
  "ORDER_CONFIRMED",
  "LOST",
  "COMPLETED",
];

const idField = z.string().trim().min(1).max(120);

const leadFiltersSchema = z
  .object({
    status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATION", "ORDER_CONFIRMED", "LOST", "COMPLETED"]).optional(),
    assignedSalespersonId: idField.optional(),
    search: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
  })
  .strict();

const noteSchema = z.string().trim().min(1).max(CONTENT_MAX_LENGTH);

const activitySchema = z
  .object({
    type: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING", "STATUS_CHANGE"]),
    description: z.string().trim().min(1).max(ACTIVITY_DESCRIPTION_MAX_LENGTH),
  })
  .strict();

function idOf(value: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant invalide.");
  }

  return result.data;
}

function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/** Filtres bornés et validés (strict) ; un champ inconnu est refusé. */
export function parseLeadFilters(filters?: LeadFilters): LeadFilters {
  const result = leadFiltersSchema.safeParse(filters ?? {});
  if (!result.success) {
    throw new AppError("VALIDATION", "Filtres de prospect invalides.");
  }

  return result.data;
}

/** Contenu de note : non vide, borné ; la valeur fautive n'est jamais renvoyée dans le message. */
export function parseLeadNote(content: unknown): string {
  const result = noteSchema.safeParse(content);
  if (!result.success) {
    throw new AppError("VALIDATION", "Contenu de note invalide.");
  }

  return result.data;
}

/** Activité : type énuméré et description non vide. */
export function parseLeadActivityInput(input: unknown): LeadActivityInput {
  const result = activitySchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée d'activité invalide.");
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Projection de lecture
// ---------------------------------------------------------------------------

export function toLeadView(
  row: LeadRow,
  notes: readonly LeadNoteView[],
  activities: readonly LeadActivityView[],
): LeadView {
  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    source: row.source,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    assignedSalespersonId: row.assignedSalespersonId,
    nextFollowUpAt: row.nextFollowUpAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notes: [...notes],
    activities: [...activities],
  };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Liste des prospects ; exige `lead.view`. La liste ne charge pas journal ni historique. */
export async function listLeads(actor: Actor, filters?: LeadFilters): Promise<LeadView[]> {
  requireStaff(actor, "lead.view");
  const parsed = parseLeadFilters(filters);
  const rows = await dependencies.leads.list(parsed);
  return rows.map((row) => toLeadView(row, [], []));
}

/** Fiche détaillée d'un prospect (journal + historique) ; exige `lead.view`. */
export async function readLead(actor: Actor, leadId: string): Promise<LeadView> {
  requireStaff(actor, "lead.view");
  const id = idOf(leadId);

  const row = await dependencies.leads.findById(id);
  if (!row) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  const [notes, activities] = await Promise.all([
    dependencies.notes.listByLead(id),
    dependencies.activities.listByLead(id),
  ]);

  return toLeadView(row, notes, activities);
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Évolution de statut ; exige `lead.update`. La transition est validée par la machine à états
 * (doc 09 §4) : toute transition non listée est refusée (`CONFLICT`, comme les transitions véhicule).
 * Chaque succès ajoute une activité `STATUS_CHANGE`.
 */
export async function updateLeadStatus(actor: Actor, leadId: string, next: LeadStatus): Promise<LeadView> {
  const staff = requireStaff(actor, "lead.update");
  const id = idOf(leadId);

  if (!isLeadStatus(next)) {
    throw new AppError("VALIDATION", "Statut de prospect inconnu.");
  }

  const current = await dependencies.leads.findById(id);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  if (!canTransitionLeadStatus(current.status, next)) {
    throw new AppError("CONFLICT", `Transition impossible de « ${current.status} » vers « ${next} ».`);
  }

  const updated = await dependencies.leads.updateStatus(id, next);

  await dependencies.activities.create({
    leadId: id,
    type: "STATUS_CHANGE",
    description: `Statut : ${current.status} → ${next}`,
    performedBy: staff.staffId,
  });

  return toLeadView(updated, [], []);
}

/** Assignation à un commercial (`staffId`) ou désassignation (`null`) ; exige `lead.assign`. */
export async function assignLead(actor: Actor, leadId: string, staffId: string | null): Promise<LeadView> {
  requireStaff(actor, "lead.assign");
  const id = idOf(leadId);
  const assignee = staffId === null ? null : idOf(staffId);

  const current = await dependencies.leads.findById(id);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  const updated = await dependencies.leads.assign(id, assignee);
  return toLeadView(updated, [], []);
}

/** Ajoute une note privée ; exige `lead.update`. */
export async function addLeadNote(actor: Actor, leadId: string, content: string): Promise<{ id: string }> {
  const staff = requireStaff(actor, "lead.update");
  const id = idOf(leadId);
  const value = parseLeadNote(content);

  const current = await dependencies.leads.findById(id);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  return dependencies.notes.create({ leadId: id, authorId: staff.staffId, content: value });
}

/** Ajoute une activité à l'historique ; exige `lead.update`. */
export async function addLeadActivity(
  actor: Actor,
  leadId: string,
  input: LeadActivityInput,
): Promise<{ id: string }> {
  const staff = requireStaff(actor, "lead.update");
  const id = idOf(leadId);
  const parsed = parseLeadActivityInput(input);

  const current = await dependencies.leads.findById(id);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  return dependencies.activities.create({
    leadId: id,
    type: parsed.type,
    description: parsed.description,
    performedBy: staff.staffId,
  });
}
