"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { isCustomRequestStatus } from "@/components/admin/CustomRequestView";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { staffRequestMessages as msg } from "@/lib/i18n/staff-requests.fr";
import { updateCustomRequestStatus } from "@/services/custom-request.service";

/**
 * Server Action de l'écran Demandes sur mesure (lot 5 §4-§5).
 *
 * Même patron que `app/admin/actions.ts` : session résolue côté serveur, puis le service applique le
 * statut du compte et la permission. Conformément au contrat §4, aucune permission `custom_request.*`
 * n'existe : la gouvernance est `lead.update`, appliquée par le service. Cette action ne contient
 * aucune règle métier.
 */

const REQUEST_LIST = "/admin/demandes";

function failure(error: unknown): AdminActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });
  return { error: envelope.error };
}

function requiredText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Changement de statut d'une demande sur mesure ; permission `lead.update` au service. */
export async function updateCustomRequestStatusAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const id = requiredText(formData, "requestId");
  const raw = readString(formData, "status") ?? "";

  try {
    if (!isCustomRequestStatus(raw)) {
      throw new AppError("VALIDATION", msg.fieldErrors.status);
    }

    await updateCustomRequestStatus(actor, id, raw);
    revalidatePath(REQUEST_LIST);
    return ok({ message: msg.status.updated });
  } catch (error) {
    return failure(error);
  }
}
