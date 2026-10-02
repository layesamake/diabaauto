"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { staffAccountsFr as msg } from "@/lib/i18n/staff-accounts.fr";
import {
  parseStaffAccountCreateInput,
  parseStaffAccountStatusInput,
  parseStaffAccountUpdateInput,
} from "@/lib/staff/staff-account-form";
import {
  createStaffAccount,
  setStaffAccountStatus,
  updateStaffAccount,
} from "@/services/staff-account.service";

/**
 * Server Actions de l'écran « Personnel » (contrat lot 7 §4).
 *
 * Même ordre imposé que `app/admin/clients/actions.ts` : la session est résolue côté serveur par
 * `getCurrentActor()`, puis `services/staff-account.service.ts` applique le statut du compte, la
 * permission (`user.manage`, seule et déjà appliquée par le service) et la validation stricte. Ces
 * actions ne contiennent AUCUNE règle métier, AUCUN contrôle d'autorisation, et ne lisent AUCUNE
 * autorisation depuis le formulaire.
 *
 * Le `FormData` est analysé par `lib/staff/staff-account-form.ts` (module pur) : seuls les champs
 * connus sont lus, un champ privilégié (`userType`, `status` sur create/update, `id`, `active`…) est
 * ignoré puis refusé par le service. **Aucune valeur de mot de passe n'est renvoyée, journalisée ni
 * réaffichée** : l'enveloppe d'erreur ne porte que des codes et des messages neutres.
 */

const LIST = "/admin/personnel";

function failure(error: unknown): AdminActionState {
  return { error: toErrorResponse(error, { correlationId: newCorrelationId() }).error };
}

/**
 * Création d'un compte interne. Le champ de confirmation n'est pas renvoyé par l'analyse (il n'a
 * servi qu'au contrôle d'égalité) ; le service, dont le schéma exige `confirmPassword`, reçoit la
 * valeur déjà vérifiée égale au mot de passe — aucune nouvelle valeur n'est introduite.
 */
export async function createStaffAccountAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const input = parseStaffAccountCreateInput(formData);
    await createStaffAccount(actor, { ...input, confirmPassword: input.password });
    revalidatePath(LIST);
    return ok({ message: msg.messages.createSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Modification de l'identité et des rôles d'un compte interne ; le service revérifie tout. */
export async function updateStaffAccountAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const input = parseStaffAccountUpdateInput(formData);
    await updateStaffAccount(actor, input);
    revalidatePath(LIST);
    return ok({ message: msg.messages.updateSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Activation / désactivation d'un compte interne ; le motif obligatoire est appliqué par le service. */
export async function setStaffAccountStatusAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const input = parseStaffAccountStatusInput(formData);
    await setStaffAccountStatus(actor, input);
    revalidatePath(LIST);
    return ok({ message: msg.messages.statusSuccess });
  } catch (error) {
    return failure(error);
  }
}
