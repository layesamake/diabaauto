import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ResellerApplicationsPanel } from "@/components/admin/ResellerApplicationsPanel";
import { LogoutButton } from "@/components/profile/LogoutButton";
import {
  RESELLER_APPLICATION_STATUSES,
  resellerApplicationStatusLabel,
  resellerFr as msg,
} from "@/lib/i18n/reseller.fr";
import {
  listResellerApplications,
  type ResellerApplicationStatus,
} from "@/services/reseller-application.service";

/**
 * Demandes Revendeur du back-office (contrat lot 5 §1, §4 et §5).
 *
 * Garde serveur `reseller.view` ; en cas de refus, AUCUNE donnée n'est lue ni affichée. Le filtre par
 * statut est passé en GET (partageable, aucun état client). Les actions de revue (prise en charge,
 * approbation, refus, annulation) sont portées par la machine à états et par les permissions
 * respectives (`reseller.view` / `reseller.approve` / `reseller.reject`) — la garde réelle reste
 * appliquée par `reviewResellerApplication`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Revendeurs — Back-office Diaba Auto",
  "Prise en charge, approbation et refus des demandes Revendeur.",
);

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseStatus(params: SearchParams): ResellerApplicationStatus | undefined {
  const raw = firstParam(params, "statut");
  return RESELLER_APPLICATION_STATUSES.find((value) => value === raw);
}

export default async function AdminResellersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("reseller.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title={msg.pageTitle}
          subtitle={msg.accessDeniedSubtitle}
          current="revendeurs"
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const permissions = access.actor.permissions;
  const params = await searchParams;
  const status = parseStatus(params);

  let content: React.ReactNode;
  try {
    const rows = await listResellerApplications(access.actor, status ? { status } : undefined);
    content = (
      <ResellerApplicationsPanel
        rows={rows}
        permissions={permissions}
        canViewCustomer={permissions.includes("customer.view")}
      />
    );
  } catch {
    content = (
      <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.title}</h2>
        <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.body}</p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={msg.pageTitle}
        subtitle={msg.pageSubtitle}
        current="revendeurs"
        logout={<LogoutButton action={logoutAction} />}
      />

      <form
        method="get"
        action="/admin/revendeurs"
        className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="filtre-statut-revendeur" className="text-sm font-medium text-[#011D4F]">
            {msg.filter.statusLabel}
          </label>
          <select
            id="filtre-statut-revendeur"
            name="statut"
            defaultValue={firstParam(params, "statut")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">{msg.filter.allStatuses}</option>
            {RESELLER_APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {resellerApplicationStatusLabel(value)}
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
            href="/admin/revendeurs"
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
