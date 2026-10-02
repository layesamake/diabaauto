"use client";

import { updateLeadStatusAction } from "@/app/admin/prospects/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField } from "@/components/admin/AdminFields";
import { labelFor, type SelectOption } from "@/components/admin/admin-view";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";
import type { LeadStatus } from "@/services/lead.service";

/**
 * Panneau de statut d'un prospect.
 *
 * Les transitions proposées proviennent de `leadStatusTransitions()` (machine à états, doc 09 §4),
 * calculées côté serveur et transmises ici : ce composant n'affiche que des cibles autorisées et
 * n'importe aucune logique serveur. Le service revérifie la transition et la permission
 * `lead.update` — masquer une transition ne protège rien.
 */
export function LeadStatusPanel({
  leadId,
  currentStatus,
  transitions,
  canUpdate,
}: {
  leadId: string;
  currentStatus: LeadStatus;
  transitions: readonly LeadStatus[];
  canUpdate: boolean;
}) {
  const options: SelectOption[] = transitions.map((status) => ({
    value: status,
    label: labelFor(msg.statusLabels, status),
  }));

  return (
    <section aria-labelledby="lead-status" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="lead-status" className="text-lg font-semibold text-[#011D4F]">
        {msg.status.title}
      </h2>
      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">{msg.status.current}</dt>
          <dd className="font-medium text-[#011D4F]">{labelFor(msg.statusLabels, currentStatus)}</dd>
        </div>
      </dl>

      {!canUpdate ? (
        <p className="mt-4 text-sm text-slate-600">{msg.status.readOnly}</p>
      ) : options.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{msg.status.terminal}</p>
      ) : (
        <AdminForm
          action={updateLeadStatusAction}
          submitLabel={msg.status.submit}
          pendingLabel={msg.status.pending}
          className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4"
        >
          <input type="hidden" name="leadId" value={leadId} />
          <AdminSelectField
            id="lead-status-next"
            name="status"
            label={msg.status.newStatus}
            required
            options={options}
          />
          <p className="text-xs text-slate-600">{msg.status.historyHint}</p>
        </AdminForm>
      )}
    </section>
  );
}
