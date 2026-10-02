"use client";

import { updateCustomerAction } from "@/app/admin/clients/actions";
import { AdminSelectField, AdminTextField } from "@/components/admin/AdminFields";
import { AdminForm } from "@/components/admin/AdminForm";
import {
  CUSTOMER_SEGMENTS,
  customerSegmentLabel,
  staffCustomersFr as msg,
} from "@/lib/i18n/staff-customers.fr";
import type { CustomerDetail } from "@/services/staff-customer.service";

/**
 * Formulaire de modification d'une fiche client (segment et coordonnées) — contrat lot 5 §4 et §5.
 *
 * React 18.3 : état local + `AdminForm` (pas de `useActionState`). Le composant ne valide rien : il
 * transmet le `FormData` à la Server Action, qui appelle `updateCustomer` (garde `customer.edit`).
 * Aucun champ privilégié (statut Revendeur, profil tarifaire, identifiant interne) n'est rendu ni
 * transmis : le statut Revendeur se règle par un formulaire distinct, `setResellerStatus`.
 */
export function CustomerForm({ customer }: { customer: CustomerDetail }) {
  return (
    <AdminForm
      action={updateCustomerAction}
      submitLabel={msg.form.editSubmit}
      pendingLabel={msg.form.editPending}
      fallbackError={msg.messages.genericError}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="customerId" value={customer.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTextField
          id="customer-first-name"
          name="firstName"
          label={msg.detail.firstName}
          required
          defaultValue={customer.firstName}
        />
        <AdminTextField
          id="customer-last-name"
          name="lastName"
          label={msg.detail.lastName}
          required
          defaultValue={customer.lastName}
        />
        <AdminTextField
          id="customer-phone"
          name="phone"
          label={msg.detail.phone}
          type="tel"
          hint={msg.form.optionalHint}
          defaultValue={customer.phone ?? ""}
        />
        <AdminTextField
          id="customer-whatsapp"
          name="whatsapp"
          label={msg.detail.whatsapp}
          type="tel"
          hint={msg.form.optionalHint}
          defaultValue={customer.whatsapp ?? ""}
        />
        <AdminTextField
          id="customer-city"
          name="city"
          label={msg.detail.city}
          hint={msg.form.optionalHint}
          defaultValue={customer.city ?? ""}
        />
        <AdminTextField
          id="customer-country"
          name="country"
          label={msg.detail.country}
          required
          defaultValue={customer.country}
        />
        <AdminSelectField
          id="customer-segment"
          name="segment"
          label={msg.detail.segment}
          required
          options={CUSTOMER_SEGMENTS.map((segment) => ({
            value: segment,
            label: customerSegmentLabel(segment),
          }))}
          defaultValue={customer.segment}
        />
      </div>
    </AdminForm>
  );
}
