"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { resellerFr as msg } from "@/lib/i18n/reseller.fr";
import {
  reviewResellerApplication,
  type ResellerReviewAction,
} from "@/services/reseller-application.service";

/**
 * Server Actions des écrans « Revendeurs » (contrat lot 5 §3, §4 et §5).
 *
 * Même ordre imposé que `app/admin/actions.ts` : la session est résolue côté serveur par
 * `getCurrentActor()`, puis `reviewResellerApplication` applique le statut du compte, la permission
 * de l'action (`reseller.view` / `reseller.approve` / `reseller.reject`) et la machine à états. Ces
 * actions ne contiennent AUCUNE règle métier et ne lisent AUCUNE autorisation depuis le formulaire :
 * masquer un bouton ne protège rien, le service est le seul point d'entrée réel.
 *
 * L'identifiant de demande provient bien du formulaire, mais il ne sert qu'à désigner la cible :
 * toute autorisation est vérifiée par le service, jamais déduite de la valeur transmise.
 *
 * Réponses : enveloppe normalisée `data { message }` en succès et `error { code, message,
 * correlationId }` en échec (même contrat que `AdminActionState`), afin de réutiliser `AdminForm`.
 */

const LIST = "/admin/revendeurs";

const REVIEW_ACTIONS: readonly ResellerReviewAction[] = ["START_REVIEW", "APPROVE", "REJECT", "CANCEL"];

const SUCCESS_MESSAGE: Readonly<Record<ResellerReviewAction, string>> = {
  START_REVIEW: msg.messages.startReviewSuccess,
  APPROVE: msg.messages.approveSuccess,
  REJECT: msg.messages.rejectSuccess,
  CANCEL: msg.messages.cancelSuccess,
};

function failure(error: unknown): AdminActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });
  return { error: envelope.error };
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Action de revue : seules les valeurs de la machine à états sont transmises au service. */
function readReviewAction(formData: FormData): ResellerReviewAction {
  const raw = readText(formData, "action");
  const action = REVIEW_ACTIONS.find((value) => value === raw);
  if (!action) {
    throw new AppError("VALIDATION", "Action de revue inconnue.");
  }

  return action;
}

/** Prise en charge, approbation, refus ou annulation d'une demande Revendeur. */
export async function reviewResellerApplicationAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const applicationId = readText(formData, "applicationId");
    const reviewAction = readReviewAction(formData);
    const rejectionReason = readText(formData, "rejectionReason");

    await reviewResellerApplication(
      actor,
      applicationId,
      reviewAction,
      reviewAction === "REJECT" ? { rejectionReason } : undefined,
    );

    revalidatePath(LIST);
    return ok({ message: SUCCESS_MESSAGE[reviewAction] });
  } catch (error) {
    return failure(error);
  }
}
