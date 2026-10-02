"use server";

/**
 * Server Action de la demande personnalisée (`/commander`, contrat lot 4 §2 Sous-agent C).
 *
 * Ordre imposé (dev.md §6) : 1) session (`getCurrentActor()`), 2) statut de compte (porté par
 * l'acteur), 3) permission (aucune permission n'est requise : la route est publique), 4) portée —
 * la cible (`customerId`) vient toujours de l'acteur résolu côté serveur, jamais du formulaire —,
 * 5) validation stricte (`services/custom-request.service.ts`), 6) exécution.
 *
 * Limitation de fréquence : nouvelle règle `customRequest` (T36), même mécanisme que
 * `registration`/`recovery` (`app/(auth)/actions.ts`). La clé est dérivée des en-têtes de requête,
 * jamais d'une donnée personnelle.
 *
 * Réponse : même enveloppe normalisée que les autres Server Actions du projet (T11) —
 * `data { message }` en succès, `error { code, message, correlationId, fields? }` en échec.
 */

import { headers } from "next/headers";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { rateLimitRulesFromEnv, readServerEnv } from "@/lib/env";
import {
  createRateLimiter,
  defaultRateLimitRules,
  type RateLimiter,
  type RateLimitRules,
} from "@/services/rate-limit.service";
import { CustomRequestValidationError, submitCustomRequest } from "@/services/custom-request.service";

export type CustomRequestActionError = ErrorEnvelope["error"] & {
  /** Champs en cause lorsque l'erreur est une erreur de validation (noms uniquement, jamais les valeurs). */
  fields?: string[];
};

export type CustomRequestActionState = { data: { message: string } } | { error: CustomRequestActionError };

const RATE_LIMITED_MESSAGE = "Trop de demandes envoyées. Patientez avant de réessayer.";
const SUCCESS_MESSAGE = "Votre demande a été envoyée. Diaba Auto vous recontacte prochainement.";

/* ------------------------------------------------------------------ */
/* Limitation de fréquence (même mécanique que app/(auth)/actions.ts) */
/* ------------------------------------------------------------------ */

let rateLimiter: RateLimiter | null = null;

function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = createRateLimiter({ rules: resolveRateLimitRules() });
  }

  return rateLimiter;
}

function resolveRateLimitRules(): RateLimitRules {
  try {
    return rateLimitRulesFromEnv(readServerEnv());
  } catch {
    return defaultRateLimitRules;
  }
}

function rateLimitDisabled(): boolean {
  try {
    return readServerEnv().RATE_LIMIT_ENABLED === "false";
  } catch {
    return false;
  }
}

async function enforceRateLimit(): Promise<void> {
  if (rateLimitDisabled()) {
    return;
  }

  const result = getRateLimiter().check("customRequest", await clientKey());
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", RATE_LIMITED_MESSAGE);
  }
}

/** Clé de limitation dérivée des en-têtes de la requête : aucune donnée personnelle n'est utilisée. */
async function clientKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "inconnue";
  const agent = requestHeaders.get("user-agent") ?? "";

  return `${address}|${agent.slice(0, 48)}`;
}

/* ------------------------------------------------------------------ */
/* Lecture des champs du formulaire                                    */
/* ------------------------------------------------------------------ */

/** Seuls les champs connus sont extraits : tout le reste est ignoré côté serveur. */
function readCriteria(formData: FormData): Record<string, unknown> {
  const criteria: Record<string, unknown> = {};
  for (const key of ["brand", "model", "notes"] as const) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim().length > 0) {
      criteria[key] = value;
    }
  }

  return criteria;
}

function optionalField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/* ------------------------------------------------------------------ */
/* Server Action                                                       */
/* ------------------------------------------------------------------ */

/**
 * Soumission d'une demande personnalisée. Accessible sans session. Si le client est connecté, le
 * contact envoyé par le formulaire (s'il y en avait) est ignoré par le service : les coordonnées
 * proviennent exclusivement du profil serveur.
 */
export async function submitCustomRequestAction(formData: FormData): Promise<CustomRequestActionState> {
  const correlationId = newCorrelationId();

  try {
    await enforceRateLimit();
    const actor = await getCurrentActor();

    await submitCustomRequest(actor, {
      criteria: readCriteria(formData),
      budgetMin: optionalField(formData, "budgetMin"),
      budgetMax: optionalField(formData, "budgetMax"),
      contactName: optionalField(formData, "contactName"),
      contactPhone: optionalField(formData, "contactPhone"),
    });

    return ok({ message: SUCCESS_MESSAGE });
  } catch (error) {
    const envelope = toErrorResponse(error, { correlationId });

    if (error instanceof CustomRequestValidationError) {
      return { error: { ...envelope.error, fields: error.fields } };
    }

    return { error: envelope.error };
  }
}
