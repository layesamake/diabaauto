"use client";

import { assignLeadAction } from "@/app/admin/prospects/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminTextField } from "@/components/admin/AdminFields";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";

/**
 * Panneau d'affectation commerciale d'un prospect.
 *
 * L'annuaire du personnel n'est pas exposé à ce lot : l'affectation à un tiers se fait par
 * l'identifiant du profil commercial (`staff_profiles`), vérifié par le service. L'acteur peut en
 * revanche s'assigner le prospect lui-même, son identifiant étant connu côté serveur. La permission
 * `lead.assign` est revérifiée par le service à chaque appel.
 */
export function LeadAssignmentPanel({
  leadId,
  assignedSalespersonId,
  currentStaffId,
  canAssign,
}: {
  leadId: string;
  assignedSalespersonId: string | null;
  currentStaffId: string;
  canAssign: boolean;
}) {
  const assigned = assignedSalespersonId;
  const assignedToSelf = assigned !== null && assigned === currentStaffId;

  return (
    <section aria-labelledby="lead-assignment" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="lead-assignment" className="text-lg font-semibold text-[#011D4F]">
        {msg.assignment.title}
      </h2>
      <dl className="mt-2 text-sm">
        <div>
          <dt className="text-slate-500">{msg.assignment.current}</dt>
          <dd className="font-medium text-[#011D4F]">{assigned ?? msg.list.notAssigned}</dd>
        </div>
      </dl>

      {!canAssign ? (
        <p className="mt-4 text-sm text-slate-600">{msg.assignment.readOnly}</p>
      ) : (
        <div className="mt-4 grid gap-6 border-t border-slate-200 pt-4 lg:grid-cols-3">
          {assigned === null ? (
            <AdminForm
              action={assignLeadAction}
              submitLabel={msg.assignment.assignToSelf}
              pendingLabel={msg.assignment.assignToSelfPending}
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="staffId" value={currentStaffId} />
            </AdminForm>
          ) : null}

          <AdminForm
            action={assignLeadAction}
            submitLabel={msg.assignment.assignSubmit}
            pendingLabel={msg.assignment.assigning}
            className="flex flex-col gap-3"
            resetOnSuccess
          >
            <input type="hidden" name="leadId" value={leadId} />
            <AdminTextField
              id="lead-assignee"
              name="staffId"
              label={msg.assignment.assignLabel}
              hint={msg.assignment.assignHint}
              required
            />
          </AdminForm>

          {assigned !== null && !assignedToSelf ? (
            <AdminForm
              action={assignLeadAction}
              submitLabel={msg.assignment.unassign}
              pendingLabel={msg.assignment.unassigning}
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="staffId" value="" />
            </AdminForm>
          ) : null}
        </div>
      )}
    </section>
  );
}
