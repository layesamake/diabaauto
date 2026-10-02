"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { RESELLER_STATUSES, staffCustomersFr as msg } from "@/lib/i18n/staff-customers.fr";
import type { ResellerStatus } from "@/services/pricing.service";
import { setResellerStatus, updateCustomer } from "@/services/staff-customer.service";

/**
 * Server Actions des écrans « Clients » (contrat lot 5 §4 et §5).
 *
 * Même ordre imposé que `app/admin/actions.ts` : la session est résolue côté serveur par
 * `getCurrentActor()`, puis `services/staff-customer.service.ts` applique le statut du compte, la
 * permission (`customer.view` / `customer.edit`) et la validation stricte. Ces actions ne contiennent
 * AUCUNE règle métier et ne lisent AUCUNE autorisation depuis le formulaire.
 *
 * En particulier, le statut Revendeur et le profil tarifaire ne transitent jamais par le patch de
 * fiche : `updateCustomer` refuse tout champ inconnu ou privilégié, et le passage à
 * `pricing_profile = RESELLER` relève exclusivement de l'approbation d'une demande Revendeur.
 */

const LIST = "/admin/clients";

function failure(error: unknown): AdminActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });
  return { error: envelope.error };
}

/** Chaîne présente : `undefined` si le champ est absent ou vide (champ omis du patch). */
function readString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Chaîne effaçable : vide ⇒ `null` (effacement explicite demandé à l'écran). */
function readNullableString(formData: FormData, name: string): string | null {
  return readString(formData, name) ?? null;
}

/** Identifiant de ressource cible : tel quel, vide si absent. La validité est tranchée par le service. */
function requiredText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Statut Revendeur : seules les valeurs de l'enum existant sont transmises au service. */
function readResellerStatus(formData: FormData): ResellerStatus {
  const raw = requiredText(formData, "status");
  const status = RESELLER_STATUSES.find((value) => value === raw);
  if (!status) {
    throw new AppError("VALIDATION", "Statut Revendeur inconnu.");
  }

  return status;
}

/**
 * Construit le patch de fiche : seuls les champs réellement transmis sont posés. `phone`, `whatsapp`
 * et `city` sont effaçables (`null` = effacement) ; les autres sont omis lorsqu'ils sont vides.
 */
function buildCustomerPatch(formData: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const firstName = readString(formData, "firstName");
  if (firstName !== undefined) {
    patch.firstName = firstName;
  }

  const lastName = readString(formData, "lastName");
  if (lastName !== undefined) {
    patch.lastName = lastName;
  }

  const country = readString(formData, "country");
  if (country !== undefined) {
    patch.country = country;
  }

  const segment = readString(formData, "segment");
  if (segment !== undefined) {
    patch.segment = segment;
  }

  patch.phone = readNullableString(formData, "phone");
  patch.whatsapp = readNullableString(formData, "whatsapp");
  patch.city = readNullableString(formData, "city");

  return patch;
}

/** Modification du segment et des coordonnées d'un client ; exige `customer.edit` (service). */
export async function updateCustomerAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const customerId = requiredText(formData, "customerId");
    await updateCustomer(actor, customerId, buildCustomerPatch(formData));
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${customerId}`);
    return ok({ message: msg.messages.updateSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Changement du statut Revendeur ; exige `customer.edit` (service). */
export async function setResellerStatusAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const customerId = requiredText(formData, "customerId");
    const status = readResellerStatus(formData);
    await setResellerStatus(actor, customerId, status);
    revalidatePath(LIST);
    revalidatePath(`${LIST}/${customerId}`);
    return ok({ message: msg.messages.resellerStatusSuccess });
  } catch (error) {
    return failure(error);
  }
}
