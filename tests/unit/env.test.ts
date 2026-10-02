import { describe, expect, it } from "vitest";
import {
  assertProductionDatabaseAllowed,
  EnvironmentConfigurationError,
  rateLimitRulesFromEnv,
  readServerEnv,
} from "@/lib/env";
import { defaultRateLimitRules } from "@/services/rate-limit.service";

const baseEnv = {
  APP_ENV: "development",
  DATABASE_URL: "postgresql://user:pw@localhost:5432/diaba-auto",
  DIRECT_URL: "postgresql://user:pw@localhost:5432/diaba-auto",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
  APP_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_REDIRECT_URL: "http://localhost:3000/auth/callback",
} satisfies Record<string, string | undefined>;

describe("readServerEnv", () => {
  it("accepts a complete environment and applies the documented defaults", () => {
    const env = readServerEnv(baseEnv);

    expect(env.APP_ENV).toBe("development");
    expect(env.ALLOW_PRODUCTION_DATABASE).toBe("false");
    expect(env.STORAGE_SIGNED_URL_TTL_SECONDS).toBe(300);
    expect(env.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it("coerces numeric values provided as strings", () => {
    const env = readServerEnv({ ...baseEnv, STORAGE_SIGNED_URL_TTL_SECONDS: "600", RATE_LIMIT_AUTH_LIMIT: "3" });

    expect(env.STORAGE_SIGNED_URL_TTL_SECONDS).toBe(600);
    expect(env.RATE_LIMIT_AUTH_LIMIT).toBe(3);
  });

  it("lists the missing variable names without ever exposing values", () => {
    let error: EnvironmentConfigurationError | null = null;
    try {
      readServerEnv({ APP_ENV: "development" });
    } catch (caught) {
      error = caught as EnvironmentConfigurationError;
    }

    expect(error).toBeInstanceOf(EnvironmentConfigurationError);
    expect(error?.variables).toContain("DATABASE_URL");
    expect(error?.variables).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(error?.message).not.toContain("postgresql://");
  });

  it("rejects a weak application secret", () => {
    expect(() => readServerEnv({ ...baseEnv, APP_SECRET: "short" })).toThrowError(/APP_SECRET/);
  });
});

describe("production database guard", () => {
  it("refuses a production environment unless explicitly allowed", () => {
    const env = readServerEnv({ ...baseEnv, APP_ENV: "production" });
    expect(() => assertProductionDatabaseAllowed(env)).toThrowError(/ALLOW_PRODUCTION_DATABASE/);
  });

  it("allows an explicitly authorised production environment", () => {
    const env = readServerEnv({ ...baseEnv, APP_ENV: "production", ALLOW_PRODUCTION_DATABASE: "true" });
    expect(() => assertProductionDatabaseAllowed(env)).not.toThrow();
  });

  it("leaves non-production environments untouched", () => {
    expect(() => assertProductionDatabaseAllowed(readServerEnv({ ...baseEnv, APP_ENV: "preview" }))).not.toThrow();
  });
});

describe("rateLimitRulesFromEnv", () => {
  it("keeps the provisional defaults when nothing is overridden", () => {
    expect(rateLimitRulesFromEnv(readServerEnv(baseEnv))).toEqual(defaultRateLimitRules);
  });

  it("applies environment overrides on the shared window", () => {
    const rules = rateLimitRulesFromEnv(readServerEnv({ ...baseEnv, RATE_LIMIT_AUTH_LIMIT: "4", RATE_LIMIT_WINDOW_SECONDS: "120" }));

    expect(rules.authentication).toEqual({ limit: 4, windowMs: 120_000 });
    expect(rules.recovery).toEqual(defaultRateLimitRules.recovery);
  });
});
