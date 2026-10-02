import { z } from "zod";
import { defaultRateLimitRules, type RateLimitRules } from "@/services/rate-limit.service";

/**
 * Variables d'environnement (dev.md §10 : « préparer un .env.example sans valeurs sensibles et
 * documenter le rôle de chaque variable réellement utilisée »).
 *
 * Aucune valeur n'est jamais affichée ni journalisée : les erreurs ne citent que des NOMS de variables.
 */

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Diaba Auto"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const appEnvSchema = z.enum(["development", "preview", "staging", "production"]);
export type AppEnv = z.infer<typeof appEnvSchema>;

export const serverEnvSchema = z.object({
  APP_ENV: appEnvSchema.default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  DIRECT_URL: z.string().min(1, "DIRECT_URL is required."),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required."),
  APP_SECRET: z.string().min(16, "APP_SECRET must be at least 16 characters."),
  AUTH_REDIRECT_URL: z.string().url(),
  ALLOW_PRODUCTION_DATABASE: z.enum(["true", "false"]).default("false"),
  RATE_LIMIT_ENABLED: z.enum(["true", "false"]).default("true"),
  RATE_LIMIT_AUTH_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_REGISTRATION_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_RECOVERY_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_SENSITIVE_LIMIT: z.coerce.number().int().positive().optional(),
  // Ajout additif lot 4 (T36, contrat §2 Sous-agent C) : règle `customRequest` (`/commander`).
  RATE_LIMIT_CUSTOM_REQUEST_LIMIT: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type EnvSource = Record<string, string | undefined>;

export class EnvironmentConfigurationError extends Error {
  readonly variables: string[];

  constructor(message: string, variables: string[]) {
    super(message);
    this.name = "EnvironmentConfigurationError";
    this.variables = variables;
  }
}

/** Lit et valide les variables serveur. Le message ne cite que les NOMS manquants ou invalides. */
export function readServerEnv(source: EnvSource = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "unknown")))].sort();

    throw new EnvironmentConfigurationError(
      `Configuration d'environnement invalide ou incomplète (variables concernées : ${variables.join(", ")}).`,
      variables,
    );
  }

  return result.data;
}

export function isProductionEnvironment(env: Pick<ServerEnv, "APP_ENV">): boolean {
  return env.APP_ENV === "production";
}

/**
 * Garde-fou exigé par les documents 13 / 16 et dev.md §10 : aucune migration ni écriture ne doit viser
 * la base de production sans autorisation explicite.
 */
export function assertProductionDatabaseAllowed(env: ServerEnv): void {
  if (isProductionEnvironment(env) && env.ALLOW_PRODUCTION_DATABASE !== "true") {
    throw new EnvironmentConfigurationError(
      "Opération refusée : environnement de production sans ALLOW_PRODUCTION_DATABASE=true.",
      ["ALLOW_PRODUCTION_DATABASE"],
    );
  }
}

/** Seuils de limitation de fréquence effectivement utilisés (surchargeables par l'environnement — D07). */
export function rateLimitRulesFromEnv(env: ServerEnv): RateLimitRules {
  const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;

  return {
    authentication: {
      limit: env.RATE_LIMIT_AUTH_LIMIT ?? defaultRateLimitRules.authentication.limit,
      windowMs: env.RATE_LIMIT_AUTH_LIMIT ? windowMs : defaultRateLimitRules.authentication.windowMs,
    },
    registration: {
      limit: env.RATE_LIMIT_REGISTRATION_LIMIT ?? defaultRateLimitRules.registration.limit,
      windowMs: env.RATE_LIMIT_REGISTRATION_LIMIT ? windowMs : defaultRateLimitRules.registration.windowMs,
    },
    recovery: {
      limit: env.RATE_LIMIT_RECOVERY_LIMIT ?? defaultRateLimitRules.recovery.limit,
      windowMs: env.RATE_LIMIT_RECOVERY_LIMIT ? windowMs : defaultRateLimitRules.recovery.windowMs,
    },
    sensitive: {
      limit: env.RATE_LIMIT_SENSITIVE_LIMIT ?? defaultRateLimitRules.sensitive.limit,
      windowMs: env.RATE_LIMIT_SENSITIVE_LIMIT ? windowMs : defaultRateLimitRules.sensitive.windowMs,
    },
    // Ajout additif lot 4 (T36, contrat §2 Sous-agent C) : règle `customRequest` (`/commander`).
    customRequest: {
      limit: env.RATE_LIMIT_CUSTOM_REQUEST_LIMIT ?? defaultRateLimitRules.customRequest.limit,
      windowMs: env.RATE_LIMIT_CUSTOM_REQUEST_LIMIT ? windowMs : defaultRateLimitRules.customRequest.windowMs,
    },
  };
}
