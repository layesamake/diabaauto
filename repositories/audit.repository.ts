import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { AuditLogEntry } from "@/services/audit.service";
import type { AuditWriter } from "@/services/vehicle.service";

/**
 * Persistance de la piste d'audit (`audit_logs`, append-only — migration M04).
 *
 * ÉCART signalé : le schéma figé ne porte PAS de colonne `reason`, alors que les transitions
 * sensibles en exigent un (doc 09). En attendant une décision, le motif est replié dans
 * `new_values.reason` afin de ne pas perdre l'information ; il devra être remonté en colonne propre
 * si le modèle évolue.
 *
 * Aucune fonction de mise à jour ou de suppression n'existe ici : la base refuse en plus UPDATE/DELETE.
 */
export function createAuditWriter(client: Prisma.TransactionClient = prisma): AuditWriter {
  return async (entry: AuditLogEntry) => {
    await client.auditLog.create({
      data: {
        actorProfileId: entry.actorProfileId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: toJsonInput(entry.oldValues),
        newValues: toJsonInput(withReason(entry.newValues, entry.reason)),
        createdAt: entry.createdAt,
      },
      select: { id: true },
    });
  };
}

function withReason(newValues: unknown, reason: string | null): unknown {
  if (!reason) return newValues;
  if (newValues && typeof newValues === "object" && !Array.isArray(newValues)) {
    return { ...(newValues as Record<string, unknown>), reason };
  }

  return { value: newValues ?? null, reason };
}

/** Adapte une valeur déjà assainie par `services/audit.service.ts` au type JSON de Prisma. */
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}