"use client";

/**
 * Formulaire de création d'un compte interne (côté client) — contrat lot 7 §2 et §4.
 *
 * Le compte est créé **confirmé** par un administrateur : le projet n'ayant ni SMTP ni
 * `mailer_autoconfirm`, aucun e-mail ne part. L'interface le rappelle et demande le **mot de passe
 * initial**, à communiquer au membre, qui le changera depuis « Mon compte ».
 *
 * Sécurité : `event.currentTarget` est capturé AVANT tout `await`, le formulaire est **vidé après un
 * succès réel** (`form.reset()`, donc les mots de passe disparaissent du DOM), et un succès n'est
 * affiché que si le serveur l'a renvoyé (`data`). Aucune valeur de mot de passe n'est renvoyée par
 * l'action, journalisée ou réaffichée.
 *
 * Le formulaire ne valide rien et ne transmet aucun champ privilégié : `createStaffAccount` applique
 * seul la permission `user.manage`, l'unicité de l'adresse et le refus de toute clé inconnue.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import { createStaffAccountAction } from "@/app/admin/personnel/actions";
import { adminFieldMessage, adminFormStatus } from "@/components/admin/admin-action-state";
import { Field } from "@/components/auth/Field";
import { StatusMessage } from "@/components/auth/StatusMessage";
import { StaffRoleCheckboxes } from "@/components/admin/StaffAccountEditForm";
import { staffAccountsFr as msg } from "@/lib/i18n/staff-accounts.fr";
import type { StaffRoleOption } from "@/services/staff-account.service";

const FIELD_MESSAGES = msg.fieldMessages;

export function StaffAccountCreateForm({ roles }: { roles: readonly StaffRoleOption[] }) {
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
      const result = await createStaffAccountAction(formData);
      setState(result);

      if ("data" in result) {
        // Vidage réel après succès serveur : les mots de passe ne restent pas dans le DOM.
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">{msg.create.intro}</p>
      <StatusMessage tone={status.tone} message={status.message} />

      <Field
        id="staff-create-email"
        name="email"
        label={msg.create.email}
        type="email"
        autoComplete="off"
        required
        disabled={pending}
        error={adminFieldMessage(state, "email", FIELD_MESSAGES)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="staff-create-first-name"
          name="firstName"
          label={msg.create.firstName}
          autoComplete="off"
          required
          disabled={pending}
          error={adminFieldMessage(state, "firstName", FIELD_MESSAGES)}
        />
        <Field
          id="staff-create-last-name"
          name="lastName"
          label={msg.create.lastName}
          autoComplete="off"
          required
          disabled={pending}
          error={adminFieldMessage(state, "lastName", FIELD_MESSAGES)}
        />
      </div>

      <Field
        id="staff-create-job-title"
        name="jobTitle"
        label={msg.create.jobTitle}
        hint={msg.create.jobTitleHint}
        disabled={pending}
        error={adminFieldMessage(state, "jobTitle", FIELD_MESSAGES)}
      />

      <StaffRoleCheckboxes
        roles={roles}
        selected={[]}
        groupId="staff-create-roles"
        legend={msg.create.roles}
        hint={msg.create.rolesHint}
        disabled={pending}
      />

      <Field
        id="staff-create-password"
        name="password"
        label={msg.create.password}
        type="password"
        autoComplete="new-password"
        required
        disabled={pending}
        hint={msg.create.passwordHint}
        error={adminFieldMessage(state, "password", FIELD_MESSAGES)}
      />

      <Field
        id="staff-create-confirm-password"
        name="confirmPassword"
        label={msg.create.confirmPassword}
        type="password"
        autoComplete="new-password"
        required
        disabled={pending}
        error={adminFieldMessage(state, "confirmPassword", FIELD_MESSAGES)}
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? msg.create.pending : msg.create.submit}
        </button>
      </div>
    </form>
  );
}
