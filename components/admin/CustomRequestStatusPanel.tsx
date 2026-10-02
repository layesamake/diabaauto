"use client";

import { updateCustomRequestStatusAction } from "@/app/admin/demandes/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField } from "@/components/admin/AdminFields";
import { labelFor, type SelectOption } from "@/components/admin/admin-view";
import { staffRequestMessages as msg } from "@/lib/i18n/staff-requests.fr";
import type { CustomRequestStatus } from "@/services/custom-request.service";

/**
 * Changement de statut d'une demande sur mesure.
 *
 * Le corpus n'impose aucune machine à états pour `RequestStatus` (E28) : les cibles proposées sont
 * calculées côté serveur (tous les statuts sauf le statut courant). La permission `lead.update` et la
 * validité de la valeur sont revérifiées par `services/custom-request.service.ts` — ce panneau n'est
 * qu'une aide.
 */
export function CustomRequestStatusPanel({
  requestId,
  currentStatus,
  statuses,
  canUpdate,
}: {
  requestId: string;
  currentStatus: CustomRequestStatus;
  statuses: readonly CustomRequestStatus[];
  canUpdate: boolean;
}) {
  const options: SelectOption[] = statuses.map((status) => ({
    value: status,
    label: labelFor(msg.statusLabels, status),
  }));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        {msg.status.current} : <span className="font-semibold text-[#011D4F]">{labelFor(msg.statusLabels, currentStatus)}</span>
      </p>

      {!canUpdate ? (
        <p className="text-xs text-slate-600">{msg.status.readOnly}</p>
      ) : options.length === 0 ? (
        <p className="text-xs text-slate-600">{msg.status.onlyStatus}</p>
      ) : (
        <AdminForm
          action={updateCustomRequestStatusAction}
          submitLabel={msg.status.submit}
          pendingLabel={msg.status.pending}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="requestId" value={requestId} />
          <AdminSelectField
            id={`custom-request-status-${requestId}`}
            name="status"
            label={msg.status.newStatus}
            required
            options={options}
          />
        </AdminForm>
      )}
    </div>
  );
}
