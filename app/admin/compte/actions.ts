"use server";

/**
 * Server Action du changement de mot de passe d'un membre du personnel authentifié
 * (« Mon compte » du back-office).
 *
 * Principes :
 * - **Aucun mot de passe n'est stocké ni journalisé** : seuls les trois champs connus sont lus, et
 *   aucune valeur n'apparaît dans un message, une erreur ou une trace.
 * - **Re-authentification obligatoire** : Supabase ne contrôle pas l'ancien mot de passe dans
 *   `updateUser`, donc l'action vérifie d'abord le mot de passe actuel par une connexion. Sans cela,
 *   une session volée suffirait à verrouiller le compte de son propriétaire.
 * - La limitation de fréquence est lue dans l'action (jamais au chargement du module).
 */

import { headers } from "next/headers";
import type { AuthActionState } from "@/app/(auth)/actions";
import { AppError, newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import { rateLimitRulesFromEnv, readServerEnv } from "@/lib/env";
import { getCurrentActor } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parsePasswordChangeInput,
  PasswordChangeValidationError,
} from "@/lib/auth/password-policy";
import {
  createRateLimiter,
  defaultRateLimitRules,
  type RateLimiter,
  type RateLimitRules,
} from "@/services/rate-limit.service";

/** Même enveloppe que les actions d'authentification : un seul contrat pour tous les formulaires. */
export type AccountActionState = AuthActionState;

const RATE_LIMITED_MESSAGE = "Trop de tentatives. Patientez quelques instants avant de réessayer.";
const CURRENT_PASSWORD_INVALID_MESSAGE =
  "Le mot de passe actuel est incorrect. Aucune modification n'a été appliquée.";
const UPDATE_FAILED_MESSAGE =
  "Le mot de passe n'a pas pu être mis à jour. Réessayez ou utilisez la récupération de compte.";
const UNAUTHENTICATED_MESSAGE =
  "Votre session n'est plus valide. Reconnectez-vous pour changer votre mot de passe.";
const STAFF_ONLY_MESSAGE = "Cette action est réservée au personnel.";
const SUCCESS_MESSAGE = "Votre mot de passe a été modifié.";
const UNAVAILABLE_MESSAGE =
  "Le service d'authentification n'est pas disponible pour le moment. Réessayez plus tard.";

/** Le client Supabase est nul lorsque la configuration d'environnement est incomplète. */
async function requireSupabaseClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new AppError("INTERNAL", UNAVAILABLE_MESSAGE);
  }

  return supabase;
}

/* ------------------------------------------------------------------ */
/* Limitation de fréquence                                             */
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

/** Clé de limitation dérivée des en-têtes : aucune donnée personnelle n'est utilisée. */
async function clientKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for") ?? "";
  const address =
    forwarded.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "inconnue";
  const agent = requestHeaders.get("user-agent") ?? "";

  return `${address}|${agent.slice(0, 48)}`;
}

async function enforceRateLimit(ruleName: string): Promise<void> {
  if (rateLimitDisabled()) {
    return;
  }

  const result = getRateLimiter().check(ruleName, await clientKey());
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", RATE_LIMITED_MESSAGE);
  }
}

/* ------------------------------------------------------------------ */
/* Réponses                                                            */
/* ------------------------------------------------------------------ */

function accountFailure(error: unknown): AccountActionState {
  const envelope: ErrorEnvelope = toErrorResponse(error, { correlationId: newCorrelationId() });

  if (error instanceof PasswordChangeValidationError) {
    return { error: { ...envelope.error, fields: error.fields } };
  }

  return { error: envelope.error };
}

/* ------------------------------------------------------------------ */
/* Action                                                              */
/* ------------------------------------------------------------------ */

export async function changePasswordAction(formData: FormData): Promise<AccountActionState> {
  try {
    await enforceRateLimit("sensitive");

    const input = parsePasswordChangeInput(formData);

    const actor = await getCurrentActor();
    if (actor.kind !== "staff") {
      throw new AppError("FORBIDDEN", STAFF_ONLY_MESSAGE);
    }

    const supabase = await requireSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) {
      throw new AppError("UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
    }

    // Re-authentification : le mot de passe actuel est vérifié, jamais conservé ni affiché.
    const verification = await supabase.auth.signInWithPassword({
      email: data.user.email,
      password: input.currentPassword,
    });
    if (verification.error) {
      throw new AppError("VALIDATION", CURRENT_PASSWORD_INVALID_MESSAGE);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: input.newPassword });
    if (updateError) {
      throw new AppError("VALIDATION", UPDATE_FAILED_MESSAGE);
    }

    return ok({ message: SUCCESS_MESSAGE, redirectTo: null });
  } catch (error) {
    return accountFailure(error);
  }
}
