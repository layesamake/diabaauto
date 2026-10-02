import { describe, expect, it } from "vitest";
import { AppError, isAppError, toErrorResponse, ERROR_CODES } from "@/lib/errors";

describe("lib/errors", () => {
  it("exposes exactly the functional error codes required by the API contract", () => {
    expect(ERROR_CODES).toEqual([
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION",
      "CONFLICT",
      "RATE_LIMITED",
    ]);
  });

  it("normalises an application error into the documented envelope", () => {
    const error = new AppError("FORBIDDEN", "Accès refusé.");
    expect(error.toResponse()).toEqual({
      error: { code: "FORBIDDEN", message: "Accès refusé." },
    });
    expect(isAppError(error)).toBe(true);
  });

  it("never leaks internal details for unexpected errors", () => {
    const leaky = new Error('relation "customer_profiles" does not exist at Character 42');
    const response = toErrorResponse(leaky);
    expect(response.error.code).toBe("INTERNAL");
    expect(response.error.message).not.toContain("customer_profiles");
    expect(response.error.message).not.toContain("Character 42");
    expect(JSON.stringify(response)).not.toContain("stack");
  });

  it("keeps the functional code and adds no stack for known errors", () => {
    const response = toErrorResponse(new AppError("NOT_FOUND", "Ressource introuvable."));
    expect(response).toEqual({ error: { code: "NOT_FOUND", message: "Ressource introuvable." } });
  });

  it("attaches a correlation id when provided, without exposing internals", () => {
    const response = toErrorResponse(new AppError("VALIDATION", "Entrée invalide."), { correlationId: "corr-123" });
    expect(response.error.correlationId).toBe("corr-123");
    expect(Object.keys(response.error).sort()).toEqual(["code", "correlationId", "message"]);
  });
});
