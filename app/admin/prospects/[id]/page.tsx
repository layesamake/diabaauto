import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDateTime, orEmpty } from "@/components/admin/admin-view";
import { LeadActivitiesPanel } from "@/components/admin/LeadActivitiesPanel";
import { LeadAssignmentPanel } from "@/components/admin/LeadAssignmentPanel";
import { LeadNotesPanel } from "@/components/admin/LeadNotesPanel";
import { LeadStatusPanel } from "@/components/admin/LeadStatusPanel";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";
import { leadStatusTransitions, readLead } from "@/services/lead.service";

/**
 * Fiche prospect du back-office (lot 5 §4-§5, doc 03 §11).
 *
 * Garde serveur `lead.view` ; en cas de refus, aucune donnée n'est lue ni affichée. Une ressource
 * non visible ou inexistante donne un message neutre, sans aucune donnée. Les commandes d'écriture
 * (statut, affectation, note, activité) ne sont proposées qu'aux porteurs de la permission
 * correspondante, mais chaque service revérifie la garde réelle (`lead.assign` / `lead.update`).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Fiche prospect — Back-office Diaba Auto",
  "Coordonnées, statut, affectation, notes privées et historique du prospect.",
);

export default async function AdminLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await resolveAdminAccess("lead.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader permissions={[]} title={msg.detail.title} subtitle={msg.detail.deniedSubtitle} />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const { id } = await params;
  const permissions = access.actor.permissions;
  const canAssign = permissions.includes("lead.assign");
  const canUpdate = permissions.includes("lead.update");

  let lead;
  try {
    lead = await readLead(access.actor, id);
  } catch {
    lead = undefined;
  }

  if (!lead) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader
          permissions={permissions}
          title={msg.detail.title}
          subtitle={msg.detail.deniedSubtitle}
          logout={<LogoutButton action={logoutAction} />}
        />
        <div className="mt-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-[#011D4F]">{msg.detail.notFoundTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{msg.detail.notFoundBody}</p>
            <Link
              href="/admin/prospects"
              className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
            >
              {msg.detail.backToList}
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const transitions = leadStatusTransitions(lead.status);

  const identity: { label: string; value: string }[] = [
    { label: msg.detail.fields.reference, value: lead.reference },
    { label: msg.detail.fields.name, value: lead.name },
    { label: msg.detail.fields.phone, value: orEmpty(lead.phone) },
    { label: msg.detail.fields.whatsapp, value: orEmpty(lead.whatsapp) },
    { label: msg.detail.fields.email, value: orEmpty(lead.email) },
    { label: msg.detail.fields.source, value: orEmpty(lead.source) },
    { label: msg.detail.fields.customer, value: orEmpty(lead.customerId) },
    { label: msg.detail.fields.vehicle, value: orEmpty(lead.vehicleId) },
    { label: msg.detail.fields.budget, value: msg.detail.budgetRange(lead.budgetMin, lead.budgetMax) },
    { label: msg.detail.fields.assigned, value: lead.assignedSalespersonId ?? msg.list.notAssigned },
    { label: msg.detail.fields.nextFollowUp, value: formatDateTime(lead.nextFollowUpAt) },
    { label: msg.detail.fields.createdAt, value: formatDateTime(lead.createdAt) },
    { label: msg.detail.fields.updatedAt, value: formatDateTime(lead.updatedAt) },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={msg.detail.title}
        subtitle={msg.detail.subtitle(lead.reference)}
        logout={<LogoutButton action={logoutAction} />}
      />

      <div className="mt-8 grid gap-6">
        <section aria-labelledby="lead-identity" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="lead-identity" className="text-lg font-semibold text-[#011D4F]">
            {msg.detail.identityTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{msg.detail.identityIntro}</p>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {identity.map((item) => (
              <div key={item.label}>
                <dt className="text-slate-500">{item.label}</dt>
                <dd className="font-medium break-words text-[#011D4F]">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <LeadStatusPanel
          leadId={lead.id}
          currentStatus={lead.status}
          transitions={transitions}
          canUpdate={canUpdate}
        />

        <LeadAssignmentPanel
          leadId={lead.id}
          assignedSalespersonId={lead.assignedSalespersonId}
          currentStaffId={access.actor.staffId}
          canAssign={canAssign}
        />

        <LeadNotesPanel leadId={lead.id} notes={lead.notes} canUpdate={canUpdate} />

        <LeadActivitiesPanel leadId={lead.id} activities={lead.activities} canUpdate={canUpdate} />
      </div>
    </main>
  );
}
