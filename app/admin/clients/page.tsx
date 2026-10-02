import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDate, orEmpty } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import {
  CUSTOMER_SEGMENTS,
  PRICING_PROFILE_LABELS,
  RESELLER_STATUSES,
  customerSegmentLabel,
  resellerStatusLabel,
  staffCustomersFr as msg,
} from "@/lib/i18n/staff-customers.fr";
import type { ResellerStatus } from "@/services/pricing.service";
import {
  listCustomers,
  type CustomerFilters,
  type CustomerSegment,
} from "@/services/staff-customer.service";

/**
 * Liste des clients du back-office (contrat lot 5 §1, §4 et §5).
 *
 * Garde serveur `customer.view` ; en cas de refus, AUCUNE donnée n'est lue ni affichée. Les filtres
 * sont passés en GET (partageables, aucun état client) : recherche libre, segment et statut
 * Revendeur. Le lien vers chaque fiche n'est qu'une aide — la fiche applique sa propre garde.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Clients — Back-office Diaba Auto",
  "Consultation et suivi des clients.",
);

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseFilters(params: SearchParams): CustomerFilters {
  const filters: CustomerFilters = {};

  const search = firstParam(params, "recherche").trim();
  if (search.length > 0) {
    filters.search = search;
  }

  const segmentRaw = firstParam(params, "segment");
  const segment = CUSTOMER_SEGMENTS.find((value) => value === segmentRaw);
  if (segment) {
    filters.segment = segment;
  }

  const resellerRaw = firstParam(params, "revendeur");
  const resellerStatus = RESELLER_STATUSES.find((value) => value === resellerRaw);
  if (resellerStatus) {
    filters.resellerStatus = resellerStatus;
  }

  return filters;
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("customer.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title={msg.listTitle}
          subtitle={msg.accessDeniedSubtitle}
          current="clients"
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
    const rows = await listCustomers(access.actor, filters);
    content = <CustomerTable rows={rows} />;
  } catch {
    content = (
      <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.listTitle}</h2>
        <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.listBody}</p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={msg.listTitle}
        subtitle={msg.listSubtitle}
        current="clients"
        logout={<LogoutButton action={logoutAction} />}
      />

      <form
        method="get"
        action="/admin/clients"
        className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="filtre-recherche-client" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.searchLabel}
          </label>
          <input
            id="filtre-recherche-client"
            name="recherche"
            type="search"
            defaultValue={firstParam(params, "recherche")}
            placeholder={msg.filter.searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-segment-client" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.segmentLabel}
          </label>
          <select
            id="filtre-segment-client"
            name="segment"
            defaultValue={firstParam(params, "segment")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">{msg.filter.allSegments}</option>
            {CUSTOMER_SEGMENTS.map((segment) => (
              <option key={segment} value={segment}>
                {customerSegmentLabel(segment)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-revendeur-client" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.resellerLabel}
          </label>
          <select
            id="filtre-revendeur-client"
            name="revendeur"
            defaultValue={firstParam(params, "revendeur")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">{msg.filter.allResellerStatuses}</option>
            {RESELLER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {resellerStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 sm:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            {msg.filter.submit}
          </button>
          <Link
            href="/admin/clients"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
          >
            {msg.filter.reset}
          </Link>
        </div>
      </form>

      <div className="mt-8">{content}</div>
    </main>
  );
}

function CustomerTable({
  rows,
}: {
  rows: { id: string; firstName: string; lastName: string; phone: string | null; city: string | null; country: string; segment: CustomerSegment; pricingProfile: string; resellerStatus: ResellerStatus; createdAt: Date }[];
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{msg.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{msg.countLabel(rows.length)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.tableCaption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.table.name}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.phone}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.city}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.country}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.segment}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.pricingProfile}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.resellerStatus}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.createdAt}</th>
              <th scope="col" className="py-2">{msg.table.sheet}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium text-[#011D4F]">
                  {`${row.firstName} ${row.lastName}`.trim()}
                </td>
                <td className="py-2 pr-3">{orEmpty(row.phone)}</td>
                <td className="py-2 pr-3">{orEmpty(row.city)}</td>
                <td className="py-2 pr-3">{orEmpty(row.country)}</td>
                <td className="py-2 pr-3">{customerSegmentLabel(row.segment)}</td>
                <td className="py-2 pr-3">{PRICING_PROFILE_LABELS[row.pricingProfile] ?? row.pricingProfile}</td>
                <td className="py-2 pr-3">{resellerStatusLabel(row.resellerStatus)}</td>
                <td className="py-2 pr-3">{formatDate(row.createdAt)}</td>
                <td className="py-2">
                  <Link
                    href={`/admin/clients/${row.id}`}
                    className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
                  >
                    Ouvrir
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
