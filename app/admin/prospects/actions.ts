"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { isLeadStatus, isManualLeadActivityType } from "@/components/admin/LeadView";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";
import {
  addLeadActivity,
  addLeadNote,
  assignLead,
  updateLeadStatus,
} from "@/services/lead.service";

/**
 * Server Actions des écrans Prospects (lot 5 §4-§5).
 *
 * Même patron que `app/admin/actions.ts` : la session est résolue côté serveur par
 * `getCurrentActor()`, puis le service applique le statut du compte, la permission et la machine à
 * états. Ces actions ne contiennent AUCUNE règle métier et ne lisent AUCUNE autorisation depuis le
 * formulaire : masquer un bouton ne protège rien, le service est le seul point d'entrée réel
 * (`lead.view`, `lead.assign`, `lead.update`).
 *
 * Réponses : enveloppe normalisée `data { message, redirectTo? }` / `error { code, message,
 * correlationId }`, identique à celle attendue par `components/admin/AdminForm.tsx`.
 */

const LEAD_LIST = "/admin/prospects";
const LEAD_DETAIL_PATTERN = "/admin/prospects/[id]";

function failure(error: unknown): AdminActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });
  return { error: envelope.error };
}

/** Chaîne présente : `undefined` si le champ est absent ou vide. */
function readString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Identifiant de ressource cible : tel quel, vide si absent. La validité est tranchée par le service. */
function requiredText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateLead(leadId: string): void {
  revalidatePath(LEAD_LIST);
  revalidatePath(`${LEAD_LIST}/${leadId}`);
  revalidatePath(LEAD_DETAIL_PATTERN, "page");
}

/** Transition de statut : la machine à états (doc 09 §4) est appliquée par le service. */
export async function updateLeadStatusAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const leadId = requiredText(formData, "leadId");
  const raw = readString(formData, "status") ?? "";

  try {
    if (!isLeadStatus(raw)) {
      throw new AppError("VALIDATION", msg.fieldErrors.status);
    }

    await updateLeadStatus(actor, leadId, raw);
    revalidateLead(leadId);
    return ok({ message: msg.status.updated });
  } catch (error) {
    return failure(error);
  }
}

/** Assignation à un commercial (vide ⇒ désassignation) ; permission `lead.assign` au service. */
export async function assignLeadAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const leadId = requiredText(formData, "leadId");
  const staffId = readString(formData, "staffId") ?? null;

  try {
    await assignLead(actor, leadId, staffId);
    revalidateLead(leadId);
    return ok({ message: staffId === null ? "Prospect désassigné." : "Prospect assigné." });
  } catch (error) {
    return failure(error);
  }
}

/** Note privée (`lead_notes`) ; permission `lead.update` au service. */
export async function addLeadNoteAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const leadId = requiredText(formData, "leadId");
  const content = readString(formData, "content") ?? "";

  try {
    await addLeadNote(actor, leadId, content);
    revalidateLead(leadId);
    return ok({ message: msg.notes.added });
  } catch (error) {
    return failure(error);
  }
}

/** Activité d'historique (`lead_activities`) ; permission `lead.update` au service. */
export async function addLeadActivityAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const leadId = requiredText(formData, "leadId");
  const type = readString(formData, "type") ?? "";
  const description = readString(formData, "description") ?? "";

  try {
    if (!isManualLeadActivityType(type)) {
      throw new AppError("VALIDATION", msg.fieldErrors.activityType);
    }

    await addLeadActivity(actor, leadId, { type, description });
    revalidateLead(leadId);
    return ok({ message: msg.activities.added });
  } catch (error) {
    return failure(error);
  }
}
