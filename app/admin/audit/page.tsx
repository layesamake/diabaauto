import type { Metadata } from "next";
import Link from "next/link";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDateTime } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_PERIODS,
  AUDIT_PERIOD_LABELS,
  auditHref,
  entityHref,
  entityLabel,
  parseAuditCategory,
  parseAuditPeriod,
  type AuditCategoryFilter,
  type AuditPeriod,
} from "@/lib/audit-view";
import { listAuditLog, type AuditEntryView, type AuditLogPage } from "@/services/audit-log.service";

/**
 * Journal d'activité du back-office : qui a fait quoi, sur quoi, quand et pourquoi.
 *
 * Garde serveur `audit.view` ; en cas de refus, AUCUNE donnée n'est lue ni affichée. Lecture seule.
 * Filtres dans l'URL (`?famille=`, `?periode=`, `?page=`) : partageables, sans état client. Les
 * valeurs affichées ont été assainies (secrets retirés, numéros masqués) à l'écriture ET à la lecture.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Journal d'activité — Back-office Diaba Auto",
  "Historique des actions sensibles du personnel.",
);

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("audit.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader title="Journal d'activité" subtitle="Accès réservé aux administrateurs." />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const category = parseAuditCategory(firstParam(params, "famille"));
  const period = parseAuditPeriod(firstParam(params, "periode"));
  const pageRaw = Number.parseInt(firstParam(params, "page"), 10);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1;

  let log: AuditLogPage | null = null;
  try {
    log = await listAuditLog(access.actor, { category, period, page });
  } catch {
    log = null;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        title="Journal d'activité"
        subtitle="Les actions sensibles du personnel, de la plus récente à la plus ancienne. Lecture seule."
        logout={<LogoutButton action={logoutAction} />}
      />

      {log ? (
        <>
          <nav aria-label="Filtrer par famille d'actions" className="mt-8 flex flex-wrap gap-2">
            {(["tout", ...AUDIT_CATEGORIES] as const).map((item) => (
              <CategoryLink key={item} item={item} active={item === category} period={period} count={log.categoryCounts[item]} />
            ))}
          </nav>

          <nav aria-label="Période" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Période :</span>
            {AUDIT_PERIODS.map((item) => (
              <Link
                key={item}
                href={auditHref(category, item)}
                aria-current={item === period ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 no-underline ${
                  item === period
                    ? "bg-[#E8F1FD] font-semibold text-[#011D4F]"
                    : "font-medium text-[#0063DF] hover:bg-[#f4f7fb]"
                }`}
              >
                {AUDIT_PERIOD_LABELS[item]}
              </Link>
            ))}
          </nav>

          <AuditTable log={log} category={category} period={period} />
        </>
      ) : (
        <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Journal momentanément indisponible</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            Le journal n&apos;a pas pu être chargé. Réessayez dans un instant ; aucune donnée n&apos;est modifiée.
          </p>
        </section>
      )}
    </main>
  );
}

function CategoryLink({
  item,
  active,
  period,
  count,
}: {
  item: AuditCategoryFilter;
  active: boolean;
  period: AuditPeriod;
  count: number;
}) {
  return (
    <Link
      href={auditHref(item, period)}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm no-underline ${
        active
          ? "border-[#0063DF] bg-[#0063DF] font-semibold text-white"
          : "border-slate-300 bg-white font-medium text-[#011D4F] hover:bg-[#f4f7fb]"
      }`}
    >
      {item === "tout" ? "Tout" : AUDIT_CATEGORY_LABELS[item]}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

function AuditTable({
  log,
  category,
  period,
}: {
  log: AuditLogPage;
  category: AuditCategoryFilter;
  period: AuditPeriod;
}) {
  if (log.entries.length === 0) {
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">Aucune action enregistrée pour ce filtre.</p>
      </section>
    );
  }

  const lastPage = Math.max(1, Math.ceil(log.total / log.pageSize));

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">
        {log.total} {log.total > 1 ? "actions" : "action"}
        {lastPage > 1 ? ` — page ${log.page} sur ${lastPage}` : ""}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Journal d&apos;activité</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">Quand</th>
              <th scope="col" className="py-2 pr-3">Qui</th>
              <th scope="col" className="py-2 pr-3">Quoi</th>
              <th scope="col" className="py-2 pr-3">Sur quoi</th>
              <th scope="col" className="py-2">Détail</th>
            </tr>
          </thead>
          <tbody>
            {log.entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex gap-4 text-sm font-semibold">
          {log.page > 1 ? (
            <Link href={auditHref(category, period, log.page - 1)} className="text-[#0063DF] hover:text-[#0354A3]">
              Page précédente
            </Link>
          ) : null}
          {log.page < lastPage ? (
            <Link href={auditHref(category, period, log.page + 1)} className="text-[#0063DF] hover:text-[#0354A3]">
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}

function AuditRow({ entry }: { entry: AuditEntryView }) {
  const href = entityHref(entry.entityType, entry.entityId);
  const target = entityLabel(entry.entityType);

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="whitespace-nowrap py-3 pr-3 text-slate-700">{formatDateTime(entry.createdAt)}</td>
      <td className="py-3 pr-3">{entry.actorName ?? <span className="text-slate-500">Système ou compte supprimé</span>}</td>
      <td className="py-3 pr-3 font-medium text-[#011D4F]">{entry.actionLabel}</td>
      <td className="py-3 pr-3">
        {href ? (
          <Link href={href} className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
            {target}
            <span className="sr-only"> — ouvrir</span>
          </Link>
        ) : (
          target
        )}
      </td>
      <td className="py-3">
        {entry.reason ? (
          <p className="mb-1 rounded-md bg-[#fdf6e6] px-2 py-1 text-xs text-[#7a5310]">
            <span className="font-semibold">Motif : </span>
            {entry.reason}
          </p>
        ) : null}
        {entry.changes.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-[#0063DF]">
              {entry.changes.length} {entry.changes.length > 1 ? "changements" : "changement"}
            </summary>
            <ul className="mt-2 list-none space-y-1 p-0 text-xs text-slate-700">
              {entry.changes.map((change) => (
                <li key={change.field}>
                  <span className="font-semibold">{change.field}</span> :{" "}
                  <span className="text-slate-500">{change.before ?? "—"}</span> → {change.after ?? "—"}
                </li>
              ))}
            </ul>
          </details>
        ) : entry.reason ? null : (
          <span className="text-slate-500">—</span>
        )}
      </td>
    </tr>
  );
}
