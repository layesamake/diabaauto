"use client";

/**
 * Formulaires de gestion d'un compte interne (côté client) — contrat lot 7 §1, §3 et §4.
 *
 * Deux formulaires distincts :
 * - `StaffAccountEditForm` : prénom, nom, fonction et rôles ;
 * - `StaffAccountStatusForm` : activation / désactivation, avec **motif obligatoire** (exigence
 *   d'audit : le service consigne le motif dans le journal).
 *
 * Sécurité : `event.currentTarget` est capturé AVANT tout `await` (React l'annule ensuite), et un
 * succès n'est affiché que si le serveur l'a renvoyé (`data`). Aucun mot de passe n'est présent dans
 * ces formulaires, donc aucune valeur de mot de passe ne peut être réaffichée.
 *
 * Les formulaires ne valident rien : la validation fait autorité côté service ; `updateStaffAccount`
 * et `setStaffAccountStatus` appliquent seuls la permission `user.manage` et les gardes.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import {
  setStaffAccountStatusAction,
  updateStaffAccountAction,
} from "@/app/admin/personnel/actions";
import { adminFieldMessage, adminFormStatus } from "@/components/admin/admin-action-state";
import { AdminTextField } from "@/components/admin/AdminFields";
import { Field } from "@/components/auth/Field";
import { StatusMessage } from "@/components/auth/StatusMessage";
import { staffAccountsFr as msg } from "@/lib/i18n/staff-accounts.fr";
import type { StaffAccountView, StaffRoleOption } from "@/services/staff-account.service";

const FIELD_MESSAGES = msg.fieldMessages;

/** Cases à cocher des rôles : un `roleCodes` par rôle connu, jamais une valeur inventée. */
export function StaffRoleCheckboxes({
  roles,
  selected,
  groupId,
  legend,
  hint,
  disabled,
}: {
  roles: readonly StaffRoleOption[];
  selected: readonly string[];
  groupId: string;
  legend: string;
  hint: string;
  disabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-[#011D4F]">
        {legend}
        {" "}
        <span aria-hidden="true">*</span>
        <span className="sr-only">(champ obligatoire)</span>
      </legend>
      <p className="text-xs text-slate-600">{hint}</p>
      {roles.map((role) => {
        const id = `${groupId}-${role.code}`;
        return (
          <div key={id} className="flex items-center gap-2">
            <input
              id={id}
              name="roleCodes"
              type="checkbox"
              value={role.code}
              defaultChecked={selected.includes(role.code)}
              disabled={disabled}
              className="size-4 rounded border-slate-300 text-[#0063DF] focus:border-[#0063DF]"
            />
            <label htmlFor={id} className="text-sm text-[#071525]">
              {role.name}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}

/** Modification de l'identité et des rôles d'un compte interne. */
export function StaffAccountEditForm({
  account,
  roles,
}: {
  account: StaffAccountView;
  roles: readonly StaffRoleOption[];
}) {
  const router = useRouter();
  const [state, setState] = useState<AdminActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = adminFormStatus(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    // Capturé avant tout `await` : React annule `currentTarget` dès la fin de la distribution.
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);

    try {
      const result = await updateStaffAccountAction(formData);
      setState(result);

      if ("data" in result) {
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: msg.messages.genericError } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-[#011D4F]">{msg.edit.title}</h4>
      <StatusMessage tone={status.tone} message={status.message} />

      <input type="hidden" name="staffId" value={account.staffId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminTextField
          id={`staff-edit-first-${account.staffId}`}
          name="firstName"
          label={msg.edit.firstName}
          required
          disabled={pending}
          defaultValue={account.firstName}
          error={adminFieldMessage(state, "firstName", FIELD_MESSAGES)}
        />
        <AdminTextField
          id={`staff-edit-last-${account.staffId}`}
          name="lastName"
          label={msg.edit.lastName}
          required
          disabled={pending}
          defaultValue={account.lastName}
          error={adminFieldMessage(state, "lastName", FIELD_MESSAGES)}
        />
        <AdminTextField
          id={`staff-edit-job-${account.staffId}`}
          name="jobTitle"
          label={msg.edit.jobTitle}
          hint={msg.edit.jobTitleHint}
          disabled={pending}
          defaultValue={account.jobTitle ?? ""}
          error={adminFieldMessage(state, "jobTitle", FIELD_MESSAGES)}
        />
      </div>

      <StaffRoleCheckboxes
        roles={roles}
        selected={account.roleCodes}
        groupId={`staff-edit-roles-${account.staffId}`}
        legend={msg.edit.roles}
        hint={msg.edit.rolesHint}
        disabled={pending}
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? msg.edit.pending : msg.edit.submit}
        </button>
      </div>
    </form>
  );
}

/**
 * Activation / désactivation d'un compte interne.
 *
 * Le bouton porte l'action opposée au statut courant (« Désactiver » si le compte est actif,
 * « Réactiver » sinon). Le motif est obligatoire : il est transmis tel quel au service, qui le
 * consigne dans le journal d'audit (`staff.activate` / `staff.deactivate`).
 */
export function StaffAccountStatusForm({ account }: { account: StaffAccountView }) {
  const router = useRouter();
  const [state, setState] = useState<AdminActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = adminFormStatus(state);

  const targetStatus = account.active ? "DISABLED" : "ACTIVE";
  const actionLabel = account.active ? msg.status.deactivate : msg.status.reactivate;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    // Capturé avant tout `await` : React annule `currentTarget` dès la fin de la distribution.
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);

    try {
      const result = await setStaffAccountStatusAction(formData);
      setState(result);

      if ("data" in result) {
        form.reset();
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: msg.messages.genericError } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-[#f9fbfe] p-3"
    >
      <h4 className="text-sm font-semibold text-[#011D4F]">{msg.status.title}</h4>
      <p className="text-xs text-slate-600">{msg.status.disabledHint}</p>
      <StatusMessage tone={status.tone} message={status.message} />

      <input type="hidden" name="staffId" value={account.staffId} />
      <input type="hidden" name="status" value={targetStatus} />

      <Field
        id={`staff-status-reason-${account.staffId}`}
        name="reason"
        label={msg.status.reasonLabel}
        required
        disabled={pending}
        hint={msg.status.reasonHint}
        error={adminFieldMessage(state, "reason", FIELD_MESSAGES)}
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? msg.status.pending : actionLabel}
        </button>
      </div>
    </form>
  );
}
