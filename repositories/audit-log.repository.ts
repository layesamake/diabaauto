import { prisma } from "@/lib/prisma/client";

/**
 * Lecture de la piste d'audit (`audit_logs`, append-only — migration M04).
 *
 * Lecture SEULE : aucune fonction d'écriture ici (l'écriture passe par `audit.repository.ts`, et la
 * base refuse en plus UPDATE/DELETE). Colonnes explicitement sélectionnées : `ip_address` et
 * `user_agent` ne sont jamais lus, donc jamais transmis à un écran.
 */

export type AuditLogRow = {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  /** Nom de l'auteur quand son profil est un profil nommé (personnel ou client) ; `null` sinon. */
  actorName: string | null;
};

export type AuditLogQuery = {
  actions?: readonly string[];
  since?: Date | null;
  page: number;
  pageSize: number;
};

export type AuditLogRepository = {
  list(query: AuditLogQuery): Promise<{ rows: AuditLogRow[]; total: number }>;
  /** Effectif par action, sur la période : de quoi compter les familles en une requête. */
  countByAction(since: Date | null): Promise<Record<string, number>>;
};

function whereOf(query: { actions?: readonly string[]; since?: Date | null }) {
  return {
    ...(query.actions ? { action: { in: [...query.actions] } } : {}),
    ...(query.since ? { createdAt: { gte: query.since } } : {}),
  };
}

export function createAuditLogRepository(): AuditLogRepository {
  return {
    async list(query) {
      const where = whereOf(query);

      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            createdAt: true,
            action: true,
            entityType: true,
            entityId: true,
            oldValues: true,
            newValues: true,
            actor: {
              select: {
                staff: { select: { firstName: true, lastName: true } },
                customer: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      return {
        total,
        rows: rows.map((row) => {
          const person = row.actor?.staff ?? row.actor?.customer ?? null;

          return {
            id: row.id,
            createdAt: row.createdAt,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            oldValues: row.oldValues,
            newValues: row.newValues,
            actorName: person ? `${person.firstName} ${person.lastName}`.trim() : null,
          };
        }),
      };
    },

    async countByAction(since) {
      const groups = await prisma.auditLog.groupBy({
        by: ["action"],
        where: whereOf({ since }),
        _count: { _all: true },
      });

      return Object.fromEntries(groups.map((group) => [group.action, group._count._all]));
    },
  };
}
