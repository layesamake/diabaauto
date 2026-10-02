import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

/**
 * Traduction des erreurs de contrainte Prisma en erreurs fonctionnelles (docs/10 : codes
 * `CONFLICT`, `VALIDATION`, `NOT_FOUND`). Aucun détail SQL ni nom de contrainte n'est exposé.
 */
export function translatePrismaError(error: unknown, conflictMessage: string): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new AppError("CONFLICT", conflictMessage);
    }
    if (error.code === "P2003" || error.code === "P2014") {
      return new AppError("VALIDATION", "Référentiel inconnu ou déjà utilisé.");
    }
    if (error.code === "P2025") {
      return new AppError("NOT_FOUND", "Ressource introuvable.");
    }
  }

  return null;
}