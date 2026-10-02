"use client";

import { setResellerStatusAction } from "@/app/admin/clients/actions";
import { AdminSelectField } from "@/components/admin/AdminFields";
import { AdminForm } from "@/components/admin/AdminForm";
import {
  RESELLER_STATUSES,
  resellerStatusLabel,
  staffCustomersFr as msg,
} from "@/lib/i18n/staff-customers.fr";
import type { CustomerDetail } from "@/services/staff-customer.service";

/**
 * Réglage du statut Revendeur d'un client — contrat lot 5 §4 et §5.
 *
 * Le formulaire ne transmet que `customerId` et `status`. Il ne touche jamais au profil tarifaire :
 * `setResellerStatus` n'écrit que `reseller_status`, et l'octroi du tarif professionnel
 * (`pricing_profile = RESELLER`) relève exclusivement de l'approbation d'une demande Revendeur
 * (`services/reseller-application.service.ts`). La garde réelle (`customer.edit`) est appliquée par
 * le service.
 */
export function CustomerResellerStatusForm({ customer }: { customer: CustomerDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">{msg.detail.resellerHint}</p>
      <AdminForm
        action={setResellerStatusAction}
        submitLabel={msg.form.resellerSubmit}
        pendingLabel={msg.form.resellerPending}
        fallbackError={msg.messages.genericError}
        className="flex flex-col gap-4 sm:max-w-sm"
      >
        <input type="hidden" name="customerId" value={customer.id} />
        <AdminSelectField
          id="customer-reseller-status"
          name="status"
          label={msg.detail.resellerStatus}
          required
          options={RESELLER_STATUSES.map((status) => ({
            value: status,
            label: resellerStatusLabel(status),
          }))}
          defaultValue={customer.resellerStatus}
        />
      </AdminForm>
    </div>
  );
}
