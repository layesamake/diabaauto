import { z } from "zod";
import {
  ACTIONS_BY_CATEGORY,
  AUDIT_CATEGORIES,
  AUDIT_PERIODS,
  actionLabel,
  describeChanges,
  periodStart,
  reasonOf,
  type AuditCategory,
  type AuditChange,
  type AuditCategoryFilter,
  type AuditPeriod,
} from "@/lib/audit-view";
import { AppError } from "@/lib/errors";
import { createAuditLogRepository, type AuditLogRepository } from "@/repositories/audit-log.repository";
import { requireStaff } from "@/services/access.service";
import { sanitizeAuditPayload } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";

/**
 * Journal d'activité : qui a fait quoi, sur quoi, quand et pourquoi.
 *
 * Lecture seule, exigée par `audit.view` (administrateur). Trois précautions :
 * - le journal est relu **à travers `sanitizeAuditPayload`** même s'il l'a déjà été à l'écriture : une
 *   entrée écrite avant un durcissement de la règle ne doit pas ressortir en clair ;
 * - l'adresse IP et le user-agent ne sont jamais lus ;
 * - la pagination est bornée.
 */

const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;

export type AuditEntryView = {
  id: string;
  createdAt: Date;
  action: string;
  actionLabel: string;
  category: AuditCategory | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  changes: AuditChange[];
};

export type AuditLogFilters = {
  category?: AuditCategoryFilter;
  period?: AuditPeriod;
  page?: number;
};

export type AuditLogPage = {
  entries: AuditEntryView[];
  total: number;
  page: number;
  pageSize: number;
  /** Effectif de chaque famille sur la période, indépendamment de la famille choisie. */
  categoryCounts: Record<AuditCategory | "tout", number>;
};

let repository: AuditLogRepository = createAuditLogRepository();

/** Remplace le repository (tests unitaires). */
export function configureAuditLogRepository(next: AuditLogRepository): void {
  repository = next;
}

export function resetAuditLogRepository(): void {
  repository = createAuditLogRepository();
}

const filtersSchema = z
  .object({
    category: z.enum(["tout", ...AUDIT_CATEGORIES]).optional(),
    period: z.enum(AUDIT_PERIODS).optional(),
    page: z.number().int().min(1).max(MAX_PAGE).optional(),
  })
  .strict();

export async function listAuditLog(
  actor: Actor,
  filters: AuditLogFilters = {},
  now: Date = new Date(),
): Promise<AuditLogPage> {
  requireStaff(actor, "audit.view");

  const parsed = filtersSchema.safeParse(filters);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Filtres du journal invalides.");
  }

  const category = parsed.data.category ?? "tout";
  const period = parsed.data.period ?? "30j";
  const page = parsed.data.page ?? 1;
  const since = periodStart(period, now);

  const [list, byAction] = await Promise.all([
    repository.list({
      actions: category === "tout" ? undefined : ACTIONS_BY_CATEGORY[category],
      since,
      page,
      pageSize: PAGE_SIZE,
    }),
    repository.countByAction(since),
  ]);

  const countOf = (actions: readonly string[]) => actions.reduce((sum, action) => sum + (byAction[action] ?? 0), 0);
  const categoryCounts = {
    // « Tout » compte aussi une action qu'aucune famille ne connaît : on ne cache rien.
    tout: Object.values(byAction).reduce((sum, count) => sum + count, 0),
    ...Object.fromEntries(AUDIT_CATEGORIES.map((key) => [key, countOf(ACTIONS_BY_CATEGORY[key])])),
  } as Record<AuditCategory | "tout", number>;

  return {
    page,
    pageSize: PAGE_SIZE,
    total: list.total,
    categoryCounts,
    entries: list.rows.map((row) => {
      const oldValues = sanitizeAuditPayload(row.oldValues);
      const newValues = sanitizeAuditPayload(row.newValues);

      return {
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        actionLabel: actionLabel(row.action),
        category: AUDIT_CATEGORIES.find((key) => (ACTIONS_BY_CATEGORY[key] as readonly string[]).includes(row.action)) ?? null,
        actorName: row.actorName,
        entityType: row.entityType,
        entityId: row.entityId,
        reason: reasonOf(newValues),
        changes: describeChanges(oldValues, newValues),
      };
    }),
  };
}
