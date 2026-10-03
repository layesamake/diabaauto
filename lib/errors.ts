/**
 * Codes d'erreur fonctionnels imposés par le contrat transversal (docs/10_Specifications_API_Server_Actions_Backend.docx).
 * `INTERNAL` n'est pas un code fonctionnel documenté : il n'est utilisé que pour les défaillances
 * inattendues, dont le détail reste côté serveur (jamais exposé au client).
 */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number] | "INTERNAL";

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    correlationId?: string;
  };
};

const INTERNAL_MESSAGE = "Une erreur interne est survenue.";

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  toResponse(): ErrorEnvelope {
    return { error: { code: this.code, message: this.message } };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normalise n'importe quelle erreur en enveloppe `error { code, message, correlationId }`.
 * Aucune trace, requête SQL ou identifiant interne n'est transmis au client (CLAUDE.md §6).
 */
export function toErrorResponse(error: unknown, options?: { correlationId?: string }): ErrorEnvelope {
  const base: ErrorEnvelope = isAppError(error)
    ? error.toResponse()
    : { error: { code: "INTERNAL", message: INTERNAL_MESSAGE } };

  if (options?.correlationId) {
    return { error: { ...base.error, correlationId: options.correlationId } };
  }

  return base;
}

export function ok<T>(data: T): { data: T } {
  return { data };
}

/** Identifiant de corrélation exposable au client : permet de retrouver la trace serveur sans révéler la cause. */
export function newCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `corr-${Date.now().toString(36)}`;
}
