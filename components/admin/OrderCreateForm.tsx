"use client";

import { createOrderAction } from "@/app/admin/commandes/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminTextField } from "@/components/admin/AdminFields";
import { staffOrdersFr as msg } from "@/lib/i18n/staff-orders.fr";

/**
 * Formulaire de création d'une commande (la vente) — contrat lot 6 §3.4, §4 et §5.
 *
 * React 18.3 : état local + `AdminForm` (pas de `useActionState`). Le composant ne valide rien : il
 * transmet le `FormData` à la Server Action, qui appelle `createOrder` (garde `order.create`). La
 * référence `CMD-YYYY-NNNNNN`, le commercial et l'instant de confirmation sont attribués par le
 * serveur, jamais par le formulaire. Le prix convenu est figé à la création (BR-105) et ne sera plus
 * recalculé par une transition.
 */
export function OrderCreateForm() {
  return (
    <AdminForm
      action={createOrderAction}
      submitLabel={msg.create.submit}
      pendingLabel={msg.create.pending}
      fallbackError={msg.messages.genericError}
      resetOnSuccess
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTextField
          id="order-create-customer"
          name="customerId"
          label={msg.create.customerId}
          hint={msg.create.customerIdHint}
          required
        />
        <AdminTextField
          id="order-create-vehicle"
          name="vehicleId"
          label={msg.create.vehicleId}
          hint={msg.create.vehicleIdHint}
          required
        />
        <AdminTextField
          id="order-create-lead"
          name="leadId"
          label={msg.create.leadId}
          hint={msg.create.leadIdHint}
        />
        <AdminTextField
          id="order-create-reservation"
          name="reservationId"
          label={msg.create.reservationId}
          hint={msg.create.reservationIdHint}
        />
        <AdminTextField
          id="order-create-vehicle-price"
          name="agreedVehiclePrice"
          type="number"
          step="0.01"
          min={0}
          label={msg.create.agreedVehiclePrice}
          required
        />
        <AdminTextField
          id="order-create-transport-price"
          name="agreedTransportPrice"
          type="number"
          step="0.01"
          min={0}
          label={msg.create.agreedTransportPrice}
        />
        <AdminTextField
          id="order-create-currency"
          name="currency"
          label={msg.create.currency}
          defaultValue="XOF"
        />
      </div>
      <p className="text-xs text-slate-600">{msg.create.hint}</p>
    </AdminForm>
  );
}
