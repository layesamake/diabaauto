"use server";

import { revalidatePath } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import {
  LOGISTICS_EVENT_TYPES,
  ORDER_STATUSES,
  staffOrdersFr as msg,
} from "@/lib/i18n/staff-orders.fr";
import { addLogisticsEvent, createOrder, updateOrderStatus } from "@/services/order.service";
import {
  cancelReservation,
  confirmReservation,
  createReservation,
  expireReservation,
  rejectDeposit,
  reportDeposit,
  verifyDeposit,
} from "@/services/reservation.service";
import type { LogisticsEventType, OrderStatus } from "@/services/order.service";

/**
 * Server Actions de l'écran « Commandes » (contrat lot 6 §3, §4, §5 et §6).
 *
 * Même ordre imposé que `app/admin/actions.ts` : la session est résolue côté serveur par
 * `getCurrentActor()`, puis le service applique, dans l'ordre, le statut du compte, la permission de
 * l'action (`order.create` pour la vente, `order.update` pour les transitions et le suivi
 * logistique, `vehicle.reserve` pour toutes les opérations de réservation) et les règles métier.
 * Ces actions ne contiennent AUCUNE règle métier et ne lisent AUCUNE autorisation depuis le
 * formulaire : masquer un bouton ne protège rien, le service est le seul point d'entrée réel.
 *
 * Les identifiants de ressource (commande, véhicule, client, réservation) proviennent bien du
 * formulaire, mais ils ne servent qu'à désigner la cible : toute autorisation est vérifiée par le
 * service, jamais déduite de la valeur transmise.
 *
 * Réponses : enveloppe normalisée `data { message, redirectTo? }` en succès et
 * `error { code, message, correlationId }` en échec (même contrat que `AdminActionState`), afin de
 * réutiliser `AdminForm`. Seul un message d'erreur neutre est exposé : jamais un objet Prisma brut,
 * jamais une valeur transmise par le navigateur.
 */

const LIST = "/admin/commandes";

function failure(error: unknown): AdminActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });
  return { error: envelope.error };
}

// ---------------------------------------------------------------------------
// Lecture des entrées de formulaire (aucune règle métier : la validation est au service)
// ---------------------------------------------------------------------------

/** Chaîne présente : `undefined` si le champ est absent ou vide (clé omise de l'entrée stricte). */
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

function readCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/** Date optionnelle : la validité du format est tranchée ici, la règle métier par le service. */
function readDate(formData: FormData, name: string): Date | undefined {
  const raw = readString(formData, name);
  if (raw === undefined) {
    return undefined;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION", msg.fieldErrors.date);
  }

  return date;
}

/** Statut de commande : seules les valeurs de la machine à états sont transmises au service. */
function readOrderStatus(formData: FormData): OrderStatus {
  const raw = requiredText(formData, "status");
  const status = ORDER_STATUSES.find((value) => value === raw);
  if (!status) {
    throw new AppError("VALIDATION", msg.fieldErrors.status);
  }

  return status;
}

/** Type d'événement logistique : liste verbatim du corpus (doc 03 §15). */
function readLogisticsEventType(formData: FormData): LogisticsEventType {
  const raw = requiredText(formData, "eventType");
  const eventType = LOGISTICS_EVENT_TYPES.find((value) => value === raw);
  if (!eventType) {
    throw new AppError("VALIDATION", msg.fieldErrors.eventType);
  }

  return eventType;
}

// ---------------------------------------------------------------------------
// Commande — vente et transitions (order.create / order.update)
// ---------------------------------------------------------------------------

/** Vente : commande + véhicule `SOLD` + conversion de réservation + bascule du prospect (service). */
export async function createOrderAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const input: Record<string, unknown> = {
      customerId: requiredText(formData, "customerId"),
      vehicleId: requiredText(formData, "vehicleId"),
      agreedVehiclePrice: requiredText(formData, "agreedVehiclePrice"),
    };

    const leadId = readString(formData, "leadId");
    if (leadId !== undefined) input.leadId = leadId;
    const reservationId = readString(formData, "reservationId");
    if (reservationId !== undefined) input.reservationId = reservationId;
    const agreedTransportPrice = readString(formData, "agreedTransportPrice");
    if (agreedTransportPrice !== undefined) input.agreedTransportPrice = agreedTransportPrice;
    const currency = readString(formData, "currency");
    if (currency !== undefined) input.currency = currency;

    const created = await createOrder(actor, input);
    revalidatePath(LIST);
    return ok({
      message: `${msg.messages.createSuccess} ${created.reference}.`,
      redirectTo: `${LIST}?commande=${encodeURIComponent(created.id)}`,
    });
  } catch (error) {
    return failure(error);
  }
}

/** Transition de commande : la machine à états et la permission `order.update` sont au service. */
export async function updateOrderStatusAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const orderId = requiredText(formData, "orderId");

  try {
    const input: Record<string, unknown> = { status: readOrderStatus(formData) };

    const note = readString(formData, "note");
    if (note !== undefined) input.note = note;
    const estimatedArrivalAt = readDate(formData, "estimatedArrivalAt");
    if (estimatedArrivalAt !== undefined) input.estimatedArrivalAt = estimatedArrivalAt;

    await updateOrderStatus(actor, orderId, input);
    revalidatePath(LIST);
    return ok({ message: msg.messages.statusSuccess });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Suivi logistique du véhicule (order.update)
// ---------------------------------------------------------------------------

/** Ajout d'un événement logistique au véhicule ; le créateur est l'acteur serveur (service). */
export async function addLogisticsEventAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const input: Record<string, unknown> = {
      vehicleId: requiredText(formData, "vehicleId"),
      eventType: readLogisticsEventType(formData),
    };

    const location = readString(formData, "location");
    if (location !== undefined) input.location = location;
    const description = readString(formData, "description");
    if (description !== undefined) input.description = description;
    const eventAt = readDate(formData, "eventAt");
    if (eventAt !== undefined) input.eventAt = eventAt;

    await addLogisticsEvent(actor, input);
    revalidatePath(LIST);
    return ok({ message: msg.messages.logisticsSuccess });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Réservations et acompte externe (vehicle.reserve)
// ---------------------------------------------------------------------------

/** Création d'une réservation `PENDING` au nom d'un client. */
export async function createReservationAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const input: Record<string, unknown> = {
      vehicleId: requiredText(formData, "vehicleId"),
      customerId: requiredText(formData, "customerId"),
      depositRequired: readCheckbox(formData, "depositRequired"),
    };

    const leadId = readString(formData, "leadId");
    if (leadId !== undefined) input.leadId = leadId;
    const expiresAt = readDate(formData, "expiresAt");
    if (expiresAt !== undefined) input.expiresAt = expiresAt;
    const agreedPrice = readString(formData, "agreedPrice");
    if (agreedPrice !== undefined) input.agreedPrice = agreedPrice;
    const depositAmount = readString(formData, "depositAmount");
    if (depositAmount !== undefined) input.depositAmount = depositAmount;
    const depositCurrency = readString(formData, "depositCurrency");
    if (depositCurrency !== undefined) input.depositCurrency = depositCurrency;

    await createReservation(actor, input);
    revalidatePath(LIST);
    return ok({ message: msg.messages.reservationCreateSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Confirmation d'une réservation : réserve le véhicule dans la même transaction (service). */
export async function confirmReservationAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const reservationId = requiredText(formData, "reservationId");

  try {
    await confirmReservation(actor, reservationId);
    revalidatePath(LIST);
    return ok({ message: msg.messages.reservationConfirmSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Annulation d'une réservation ; le véhicule réservé est libéré (service). */
export async function cancelReservationAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const reservationId = requiredText(formData, "reservationId");

  try {
    await cancelReservation(actor, reservationId);
    revalidatePath(LIST);
    return ok({ message: msg.messages.reservationCancelSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Expiration d'une réservation confirmée ; le véhicule réservé est libéré (service). */
export async function expireReservationAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const reservationId = requiredText(formData, "reservationId");

  try {
    await expireReservation(actor, reservationId);
    revalidatePath(LIST);
    return ok({ message: msg.messages.reservationExpireSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Déclaration d'un acompte externe (`REPORTED`) : aucun encaissement (BR-101/BR-102). */
export async function reportDepositAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const reservationId = requiredText(formData, "reservationId");

  try {
    const input: Record<string, unknown> = {
      externalDepositReference: requiredText(formData, "externalDepositReference"),
    };

    const depositAmount = readString(formData, "depositAmount");
    if (depositAmount !== undefined) input.depositAmount = depositAmount;
    const depositCurrency = readString(formData, "depositCurrency");
    if (depositCurrency !== undefined) input.depositCurrency = depositCurrency;

    await reportDeposit(actor, reservationId, input);
    revalidatePath(LIST);
    return ok({ message: msg.messages.depositReportSuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Vérification d'un acompte externe (`REPORTED → VERIFIED`). */
export async function verifyDepositAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const reservationId = requiredText(formData, "reservationId");

  try {
    await verifyDeposit(actor, reservationId);
    revalidatePath(LIST);
    return ok({ message: msg.messages.depositVerifySuccess });
  } catch (error) {
    return failure(error);
  }
}

/** Refus d'un acompte externe (`REPORTED → REJECTED`), avec motif facultatif. */
export async function rejectDepositAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const reservationId = requiredText(formData, "reservationId");

  try {
    const reason = readString(formData, "reason");
    await rejectDeposit(actor, reservationId, reason !== undefined ? { reason } : undefined);
    revalidatePath(LIST);
    return ok({ message: msg.messages.depositRejectSuccess });
  } catch (error) {
    return failure(error);
  }
}
