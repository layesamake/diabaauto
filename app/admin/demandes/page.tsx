import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDateTime, labelFor, type SelectOption } from "@/components/admin/admin-view";
import { CustomRequestStatusPanel } from "@/components/admin/CustomRequestStatusPanel";
import {
  CUSTOM_REQUEST_STATUSES,
  isCustomRequestStatus,
} from "@/components/admin/CustomRequestView";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { staffRequestMessages as msg } from "@/lib/i18n/staff-requests.fr";
import {
  listCustomRequests,
  type CustomRequestFilters,
  type CustomRequestView,
} from "@/services/custom-request.service";

/**
 * Demandes sur mesure du back-office (lot 5 §4-§5, doc 03 §11).
 *
 * Garde serveur `lead.view` (contrat §4 : aucune permission `custom_request.*` n'existe) ; en cas de
 * refus, aucune donnée n'est lue ni affichée. Le filtre de statut est passé en GET. Le changement de
 * statut est gouverné par `lead.update`, revérifié par le service ; la vue personnel ne projette
 * jamais de coordonnées ni d'identifiant de client.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Demandes sur mesure — Back-office Diaba Auto",
  "Qualification commerciale des demandes de véhicules personnalisés.",
);

const STATUS_FILTER_OPTIONS: SelectOption[] = CUSTOM_REQUEST_STATUSES.map((status) => ({
  value: status,
  label: labelFor(msg.statusLabels, status),
}));

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseFilters(params: SearchParams): CustomRequestFilters {
  const statusRaw = firstParam(params, "statut");
  const filters: CustomRequestFilters = {};
  if (isCustomRequestStatus(statusRaw)) {
    filters.status = statusRaw;
  }

  return filters;
}

/** Résumé textuel des critères : uniquement les clés projetées par le service, aucune supposition. */
function criteriaSummary(request: CustomRequestView): string[] {
  const lines: string[] = [];
  if (request.criteria.brand) lines.push(`${msg.list.brandPrefix} : ${request.criteria.brand}`);
  if (request.criteria.model) lines.push(`${msg.list.modelPrefix} : ${request.criteria.model}`);
  if (request.criteria.notes) lines.push(`${msg.list.notesPrefix} : ${request.criteria.notes}`);
  return lines;
}

export default async function AdminCustomRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("lead.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title={msg.list.title}
          subtitle={msg.list.deniedSubtitle}
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const permissions = access.actor.permissions;
  const canUpdate = permissions.includes("lead.update");
  const params = await searchParams;
  const filters = parseFilters(params);

  let content: React.ReactNode;
  try {
    const requests = await listCustomRequests(access.actor, filters);
    content = <RequestTable requests={requests} canUpdate={canUpdate} />;
  } catch {
    content = (
      <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">{msg.list.unavailableTitle}</h2>
        <p className="mt-2 text-sm text-[#7a5310]">{msg.list.unavailableBody}</p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={msg.list.title}
        subtitle={msg.list.subtitle}
        logout={<LogoutButton action={logoutAction} />}
      />

      <form method="get" action="/admin/demandes" className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="filtre-statut" className="text-sm font-medium text-[#011D4F]">
            {msg.list.statusFilterLabel}
          </label>
          <select
            id="filtre-statut"
            name="statut"
            defaultValue={firstParam(params, "statut")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">{msg.list.allStatuses}</option>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            {msg.list.filter}
          </button>
          <Link
            href="/admin/demandes"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
          >
            {msg.list.reset}
          </Link>
        </div>
      </form>

      <div className="mt-8">{content}</div>
    </main>
  );
}

function RequestTable({
  requests,
  canUpdate,
}: {
  requests: CustomRequestView[];
  canUpdate: boolean;
}) {
  if (requests.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{msg.list.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{msg.list.count(requests.length)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.list.title}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.list.columns.reference}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.criteria}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.budget}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.status}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.createdAt}</th>
              <th scope="col" className="py-2">{msg.list.columns.action}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const lines = criteriaSummary(request);
              const offered = CUSTOM_REQUEST_STATUSES.filter((status) => status !== request.status);
              return (
                <tr key={request.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3 break-all font-medium text-[#011D4F]">{request.id}</td>
                  <td className="py-3 pr-3 text-slate-700">
                    {lines.length > 0 ? (
                      <ul className="flex flex-col gap-0.5">
                        {lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-500">{msg.list.noCriteria}</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-slate-700">
                    {msg.list.budgetRange(request.budgetMin, request.budgetMax)}
                  </td>
                  <td className="py-3 pr-3 font-medium text-[#011D4F]">
                    {labelFor(msg.statusLabels, request.status)}
                  </td>
                  <td className="py-3 pr-3 text-slate-700">{formatDateTime(request.createdAt)}</td>
                  <td className="py-3">
                    <CustomRequestStatusPanel
                      requestId={request.id}
                      currentStatus={request.status}
                      statuses={offered}
                      canUpdate={canUpdate}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
