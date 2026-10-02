"use client";

import { addLeadActivityAction } from "@/app/admin/prospects/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField, AdminTextareaField } from "@/components/admin/AdminFields";
import { formatDateTime, labelFor, type SelectOption } from "@/components/admin/admin-view";
import { LEAD_MANUAL_ACTIVITY_TYPES } from "@/components/admin/LeadView";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";
import type { LeadActivityView } from "@/services/lead.service";

/**
 * Historique d'activités d'un prospect (`lead_activities`).
 *
 * Liste chronologique et saisie manuelle. Seuls les types d'échange (`CALL`, `WHATSAPP`, `EMAIL`,
 * `MEETING`) sont proposés : `STATUS_CHANGE` est écrit automatiquement par le service lors d'une
 * transition de statut, jamais saisi à la main. La permission `lead.update` est revérifiée au service.
 */
export function LeadActivitiesPanel({
  leadId,
  activities,
  canUpdate,
}: {
  leadId: string;
  activities: LeadActivityView[];
  canUpdate: boolean;
}) {
  const typeOptions: SelectOption[] = LEAD_MANUAL_ACTIVITY_TYPES.map((type) => ({
    value: type,
    label: labelFor(msg.activityLabels, type),
  }));

  return (
    <section aria-labelledby="lead-activities" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="lead-activities" className="text-lg font-semibold text-[#011D4F]">
        {msg.activities.title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{msg.activities.intro}</p>

      {canUpdate ? (
        <AdminForm
          action={addLeadActivityAction}
          submitLabel={msg.activities.submit}
          pendingLabel={msg.activities.pending}
          resetOnSuccess
          className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-[#f9fafc] p-4"
        >
          <input type="hidden" name="leadId" value={leadId} />
          <AdminSelectField
            id="lead-activity-type"
            name="type"
            label={msg.activities.typeLabel}
            required
            options={typeOptions}
          />
          <AdminTextareaField
            id="lead-activity-description"
            name="description"
            label={msg.activities.descriptionLabel}
            placeholder={msg.activities.descriptionPlaceholder}
            hint={msg.activities.descriptionHint}
            required
          />
        </AdminForm>
      ) : (
        <p className="mt-4 text-sm text-slate-600">{msg.activities.readOnly}</p>
      )}

      {activities.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{msg.activities.empty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {activities.map((activity) => (
            <li key={activity.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">
                {formatDateTime(activity.createdAt)} — {labelFor(msg.activityLabels, activity.type)}
                {activity.performedBy ? ` — par ${activity.performedBy}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-[#071525]">{activity.description}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
