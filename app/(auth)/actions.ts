"use server";

/**
 * Server Actions d'authentification (inscription, connexion, récupération, réinitialisation, déconnexion).
 *
 * Principes imposés (doc 11, CLAUDE.md §5-§6) :
 * - Supabase Auth est la seule source d'identité : aucun mot de passe n'est stocké ni journalisé ici.
 * - Seuls les champs personnels sont lus (`email`, `password`, `confirmPassword`, `firstName`, `lastName`) :
 *   un champ privilégié envoyé par le navigateur (`userType`, `status`, `resellerStatus`, `roleId`) n'est
 *   jamais lu, donc jamais transmis.
 * - Aucun message ne permet de déduire l'existence d'un compte.
 * - La réponse respecte l'enveloppe normalisée `data` / `error { code, message, correlationId }` (T11).
 * - La limitation de fréquence est lue depuis l'environnement à l'intérieur de l'action, avec repli sur
 *   les règles par défaut : `lib/env.ts` ne doit jamais être appelé au chargement du module.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AFTER_LOGIN_PATH, internalPath, NEXT_PATH_PARAM } from "@/components/auth/auth-navigation";
import { AppError, newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import { rateLimitRulesFromEnv, readServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createRateLimiter,
  defaultRateLimitRules,
  type RateLimiter,
  type RateLimitRules,
} from "@/services/rate-limit.service";

export type AuthActionError = ErrorEnvelope["error"] & {
  /** Champs en cause lorsque l'erreur est une erreur de validation (libellés internes, jamais des valeurs). */
  fields?: string[];
};

export type AuthActionState =
  | { data: { message: string; redirectTo: string | null } }
  | { error: AuthActionError };

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;
const NAME_MAX_LENGTH = 80;

const UNAVAILABLE_MESSAGE =
  "Le service d'authentification n'est pas disponible pour le moment. Réessayez plus tard.";
const INVALID_CREDENTIALS_MESSAGE = "Adresse e-mail ou mot de passe incorrect.";
const GENERIC_SIGNUP_FAILURE_MESSAGE =
  "L'inscription n'a pas pu aboutir. Vérifiez les informations saisies, ou connectez-vous si vous possédez déjà un compte.";
const RATE_LIMITED_MESSAGE = "Trop de tentatives. Patientez quelques minutes avant de réessayer.";

/** Message volontairement identique dans tous les cas : il ne révèle pas l'existence d'un compte. */
const RECOVERY_MESSAGE =
  "Si un compte correspond à cette adresse, un e-mail de réinitialisation vient d'être envoyé.";

const INVALID_RESET_LINK_MESSAGE =
  "Ce lien de réinitialisation est invalide ou expiré. Demandez un nouveau lien.";

/* ------------------------------------------------------------------ */
/* Erreurs et réponses                                                 */
/* ------------------------------------------------------------------ */

/** Erreur de validation de formulaire : seuls les NOMS de champs sont exposés, jamais les valeurs. */
class AuthValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "AuthValidationError";
    this.fields = fields;
  }
}

function correlationId(): string {
  return newCorrelationId();
}

function authSuccess(message: string, redirectTo: string | null = null): AuthActionState {
  return ok({ message, redirectTo });
}

function authFailure(error: unknown): AuthActionState {
  const envelope: ErrorEnvelope = toErrorResponse(error, { correlationId: correlationId() });

  if (error instanceof AuthValidationError) {
    return { error: { ...envelope.error, fields: error.fields } };
  }

  return { error: envelope.error };
}

/** Un champ inconnu est signalé par zod via `keys` (et non via `path`) : les deux cas sont couverts. */
function issueFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.flatMap((issue) => fieldNames(issue)))].sort();
}

function fieldNames(issue: { path: PropertyKey[]; keys?: string[] }): string[] {
  if (Array.isArray(issue.keys) && issue.keys.length > 0) {
    return issue.keys;
  }

  return [String(issue.path[0] ?? "unknown")];
}

/* ------------------------------------------------------------------ */
/* Limitation de fréquence                                             */
/* ------------------------------------------------------------------ */

let rateLimiter: RateLimiter | null = null;

/**
 * Limiteur créé au premier appel d'action (jamais au chargement du module) : les règles proviennent de
 * l'environnement lorsqu'il est complet, sinon des seuils par défaut documentés (D07).
 */
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

async function enforceRateLimit(ruleName: string): Promise<void> {
  if (rateLimitDisabled()) {
    return;
  }

  const result = getRateLimiter().check(ruleName, await clientKey());
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
/* Configuration et redirections                                       */
/* ------------------------------------------------------------------ */

async function requireSupabaseClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new AppError("INTERNAL", UNAVAILABLE_MESSAGE);
  }

  return supabase;
}

function publicAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return value && value.length > 0 ? value : "http://localhost:3000";
}

/**
 * URL de retour utilisée par Supabase pour les e-mails de confirmation et de réinitialisation.
 * `AUTH_REDIRECT_URL` (serveur) est prioritaire ; l'URL publique de l'application sert de repli
 * lorsque l'environnement est incomplet (cas du développement local sans variables Supabase).
 */
function callbackUrl(path: string): string {
  const query = `${NEXT_PATH_PARAM}=${encodeURIComponent(path)}`;

  try {
    const url = new URL(readServerEnv().AUTH_REDIRECT_URL);
    url.search = query;
    return url.toString();
  } catch {
    // Environnement incomplet ou URL invalide : repli ci-dessous.
  }

  try {
    const url = new URL("/auth/callback", publicAppUrl());
    url.search = query;
    return url.toString();
  } catch {
    return `/auth/callback?${query}`;
  }
}

/* ------------------------------------------------------------------ */
/* Validation des entrées                                              */
/* ------------------------------------------------------------------ */

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const existingPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const nameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);

const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
    firstName: nameSchema,
    lastName: nameSchema,
  })
  .strict();

const signInSchema = z
  .object({
    email: emailSchema,
    password: existingPasswordSchema,
    suivant: z.string().max(2048).nullish(),
  })
  .strict();

const recoverySchema = z.object({ email: emailSchema }).strict();

const passwordResetSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .strict();

/** Seuls les champs connus sont extraits du formulaire : tout le reste est ignoré côté serveur. */
function readKnownFields(formData: FormData, keys: readonly string[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of keys) {
    input[key] = formData.get(key);
  }

  return input;
}

function parseRegistrationInput(formData: FormData) {
  const parsed = registrationSchema.safeParse(readKnownFields(formData, ["email", "password", "confirmPassword", "firstName", "lastName"]));
  if (!parsed.success) {
    throw new AuthValidationError(issueFields(parsed.error));
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    throw new AuthValidationError(["confirmPassword"]);
  }

  return parsed.data;
}

function parseSignInInput(formData: FormData) {
  const parsed = signInSchema.safeParse(readKnownFields(formData, ["email", "password", NEXT_PATH_PARAM]));
  if (!parsed.success) {
    throw new AuthValidationError(issueFields(parsed.error));
  }

  return parsed.data;
}

function parseRecoveryInput(formData: FormData) {
  const parsed = recoverySchema.safeParse(readKnownFields(formData, ["email"]));
  if (!parsed.success) {
    throw new AuthValidationError(issueFields(parsed.error));
  }

  return parsed.data;
}

function parsePasswordResetInput(formData: FormData) {
  const parsed = passwordResetSchema.safeParse(readKnownFields(formData, ["password", "confirmPassword"]));
  if (!parsed.success) {
    throw new AuthValidationError(issueFields(parsed.error));
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    throw new AuthValidationError(["confirmPassword"]);
  }

  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Server Actions                                                      */
/* ------------------------------------------------------------------ */

/** Inscription d'un client. Le domaine privilégié n'est jamais accepté depuis le navigateur. */
export async function signUpAction(formData: FormData): Promise<AuthActionState> {
  try {
    await enforceRateLimit("registration");
    const input = parseRegistrationInput(formData);
    const supabase = await requireSupabaseClient();

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { first_name: input.firstName, last_name: input.lastName },
        emailRedirectTo: callbackUrl(AFTER_LOGIN_PATH),
      },
    });

    if (error) {
      // Message unique quel que soit le motif : une adresse déjà utilisée n'est pas dévoilée.
      throw new AppError("VALIDATION", GENERIC_SIGNUP_FAILURE_MESSAGE);
    }

    if (data.session) {
      return authSuccess("Votre compte a été créé. Bienvenue chez Diaba Auto.", AFTER_LOGIN_PATH);
    }

    return authSuccess(
      "Votre compte a été créé. Consultez votre boîte e-mail pour confirmer votre adresse, puis connectez-vous.",
    );
  } catch (error) {
    return authFailure(error);
  }
}

/** Connexion. Le message d'échec est identique pour une adresse inconnue et un mot de passe erroné. */
export async function signInAction(formData: FormData): Promise<AuthActionState> {
  try {
    await enforceRateLimit("authentication");
    const input = parseSignInInput(formData);
    const supabase = await requireSupabaseClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      if (error.code === "email_not_confirmed") {
        // Atteint uniquement après vérification du mot de passe : n'apprend rien à un tiers.
        throw new AppError(
          "UNAUTHENTICATED",
          "Confirmez d'abord votre adresse e-mail : un lien de confirmation vous a été envoyé.",
        );
      }

      throw new AppError("UNAUTHENTICATED", INVALID_CREDENTIALS_MESSAGE);
    }

    return authSuccess("Connexion réussie.", internalPath(input.suivant, AFTER_LOGIN_PATH));
  } catch (error) {
    return authFailure(error);
  }
}

/** Déconnexion : supprime la session Supabase côté serveur, puis revient à l'accueil. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // La redirection est garantie même si la session est déjà absente ou le service injoignable.
    }
  }

  redirect("/");
}

/** Demande de récupération : la réponse est identique que le compte existe ou non. */
export async function requestAccountRecoveryAction(formData: FormData): Promise<AuthActionState> {
  try {
    await enforceRateLimit("recovery");
    const input = parseRecoveryInput(formData);
    const supabase = await requireSupabaseClient();

    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: callbackUrl("/reinitialiser-mot-de-passe"),
    });

    if (error) {
      // Volontairement ignoré : signaler un échec pour une adresse inconnue révélerait son absence.
      return authSuccess(RECOVERY_MESSAGE);
    }

    return authSuccess(RECOVERY_MESSAGE);
  } catch (error) {
    return authFailure(error);
  }
}

/** Réinitialisation du mot de passe, uniquement avec la session ouverte par le lien de récupération. */
export async function resetPasswordAction(formData: FormData): Promise<AuthActionState> {
  try {
    await enforceRateLimit("sensitive");
    const input = parsePasswordResetInput(formData);
    const supabase = await requireSupabaseClient();

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new AppError("UNAUTHENTICATED", INVALID_RESET_LINK_MESSAGE);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: input.password });
    if (updateError) {
      throw new AppError(
        "VALIDATION",
        "Le mot de passe n'a pas pu être mis à jour. Demandez un nouveau lien de réinitialisation.",
      );
    }

    return authSuccess("Votre mot de passe a été mis à jour.", AFTER_LOGIN_PATH);
  } catch (error) {
    return authFailure(error);
  }
}
