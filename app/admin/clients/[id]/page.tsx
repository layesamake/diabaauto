import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { CustomerForm } from "@/components/admin/CustomerForm";
import { CustomerResellerStatusForm } from "@/components/admin/CustomerResellerStatusForm";
import { formatDate, formatDateTime, orEmpty } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import {
  PRICING_PROFILE_LABELS,
  customerSegmentLabel,
  resellerStatusLabel,
  staffCustomersFr as msg,
} from "@/lib/i18n/staff-customers.fr";
import { readCustomer } from "@/services/staff-customer.service";

/**
 * Fiche client du back-office (contrat lot 5 §1, §4 et §5).
 *
 * Garde serveur `customer.view` ; en cas de refus, AUCUNE donnée n'est lue ni affichée. Les
 * formulaires d'écriture (segment, coordonnées, statut Revendeur) ne sont proposés qu'aux porteurs de
 * `customer.edit`, mais la garde réelle reste appliquée par `services/staff-customer.service.ts`.
 * Le profil tarifaire est affiché, jamais modifiable ici : il est accordé par l'approbation d'une
 * demande Revendeur.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Fiche client — Back-office Diaba Auto",
  "Segment, coordonnées et statut Revendeur.",
);

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await resolveAdminAccess("customer.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader permissions={[]} title={msg.detailTitle} subtitle={msg.accessDeniedSubtitle} current="clients" />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const { id } = await params;
  const permissions = access.actor.permissions;
  const canEdit = permissions.includes("customer.edit");

  let customer;
  try {
    customer = await readCustomer(access.actor, id);
  } catch {
    customer = undefined;
  }

  if (!customer) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader
          permissions={permissions}
          title={msg.detailTitle}
          subtitle={msg.listSubtitle}
          current="clients"
          logout={<LogoutButton action={logoutAction} />}
        />
        <div className="mt-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-[#011D4F]">{msg.unavailable.notFoundTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{msg.unavailable.notFoundBody}</p>
            <Link
              href="/admin/clients"
              className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
            >
              Retour à la liste des clients
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={`${customer.firstName} ${customer.lastName}`.trim()}
        subtitle={msg.detailTitle}
        current="clients"
        logout={<LogoutButton action={logoutAction} />}
      />

      <div className="mt-8 grid gap-6">
        <section aria-labelledby="customer-summary" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="customer-summary" className="text-lg font-semibold text-[#011D4F]">
            {msg.detail.identity}
          </h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label={msg.detail.firstName} value={orEmpty(customer.firstName)} />
            <Fact label={msg.detail.lastName} value={orEmpty(customer.lastName)} />
            <Fact label={msg.detail.phone} value={orEmpty(customer.phone)} />
            <Fact label={msg.detail.whatsapp} value={orEmpty(customer.whatsapp)} />
            <Fact label={msg.detail.city} value={orEmpty(customer.city)} />
            <Fact label={msg.detail.country} value={orEmpty(customer.country)} />
            <Fact label={msg.detail.companyName} value={orEmpty(customer.companyName)} />
            <Fact label={msg.detail.segment} value={customerSegmentLabel(customer.segment)} />
            <Fact
              label={msg.detail.pricingProfile}
              value={PRICING_PROFILE_LABELS[customer.pricingProfile] ?? customer.pricingProfile}
            />
            <Fact label={msg.detail.resellerStatus} value={resellerStatusLabel(customer.resellerStatus)} />
            <Fact label={msg.detail.createdAt} value={formatDate(customer.createdAt)} />
            <Fact label={msg.detail.updatedAt} value={formatDateTime(customer.updatedAt)} />
          </dl>
        </section>

        <section aria-labelledby="customer-edit" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="customer-edit" className="text-lg font-semibold text-[#011D4F]">
            {msg.detail.editTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{msg.detail.editHint}</p>
          {canEdit ? (
            <div className="mt-4">
              <CustomerForm customer={customer} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{msg.detail.readonlyNotice}</p>
          )}
        </section>

        <section aria-labelledby="customer-reseller" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="customer-reseller" className="text-lg font-semibold text-[#011D4F]">
            {msg.detail.resellerTitle}
          </h2>
          {canEdit ? (
            <div className="mt-4">
              <CustomerResellerStatusForm customer={customer} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{msg.detail.readonlyNotice}</p>
          )}
        </section>
      </div>
    </main>
  );
}

/** Couple libellé / valeur de la fiche, en lecture seule. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-[#071525]">{value}</dd>
    </div>
  );
}
