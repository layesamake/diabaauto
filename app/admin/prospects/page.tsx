import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDateTime, labelFor, orEmpty, type SelectOption } from "@/components/admin/admin-view";
import { LEAD_STATUSES } from "@/components/admin/LeadView";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";
import { listLeads, type LeadFilters, type LeadView } from "@/services/lead.service";

/**
 * Liste des prospects du back-office (lot 5 §4-§5, doc 03 §11).
 *
 * Garde serveur `lead.view` ; en cas de refus, aucune donnée n'est lue ni affichée. Les filtres sont
 * passés en GET (partageables, aucun état client) : recherche libre et statut. `listLeads` ne charge
 * ni journal ni historique.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Prospects — Back-office Diaba Auto",
  "Liste et suivi commercial des prospects.",
);

const STATUS_FILTER_OPTIONS: SelectOption[] = LEAD_STATUSES.map((status) => ({
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

function parseFilters(params: SearchParams): LeadFilters {
  const search = firstParam(params, "recherche").trim();
  const statusRaw = firstParam(params, "statut");

  const filters: LeadFilters = {};
  if (search.length > 0) {
    filters.search = search;
  }

  const status = LEAD_STATUSES.find((value) => value === statusRaw);
  if (status) {
    filters.status = status;
  }

  return filters;
}

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
  const params = await searchParams;
  const filters = parseFilters(params);

  let content: React.ReactNode;
  try {
    const leads = await listLeads(access.actor, filters);
    content = <LeadTable leads={leads} />;
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

      <form method="get" action="/admin/prospects" className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="filtre-recherche" className="text-sm font-medium text-[#011D4F]">
            {msg.list.searchLabel}
          </label>
          <input
            id="filtre-recherche"
            name="recherche"
            type="search"
            defaultValue={firstParam(params, "recherche")}
            placeholder={msg.list.searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          />
        </div>
        <div className="flex flex-col gap-1">
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
            href="/admin/prospects"
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

function LeadTable({ leads }: { leads: LeadView[] }) {
  if (leads.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{msg.list.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{msg.list.count(leads.length)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.list.title}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.list.columns.reference}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.name}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.phone}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.source}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.status}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.assignee}</th>
              <th scope="col" className="py-2 pr-3">{msg.list.columns.nextFollowUp}</th>
              <th scope="col" className="py-2">{msg.list.columns.open}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium text-[#011D4F]">{lead.reference}</td>
                <td className="py-2 pr-3">{lead.name}</td>
                <td className="py-2 pr-3">{orEmpty(lead.phone)}</td>
                <td className="py-2 pr-3">{orEmpty(lead.source)}</td>
                <td className="py-2 pr-3">{labelFor(msg.statusLabels, lead.status)}</td>
                <td className="py-2 pr-3">{lead.assignedSalespersonId ?? msg.list.notAssigned}</td>
                <td className="py-2 pr-3">{formatDateTime(lead.nextFollowUpAt)}</td>
                <td className="py-2">
                  <Link
                    href={`/admin/prospects/${lead.id}`}
                    className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
                  >
                    {msg.list.open}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
