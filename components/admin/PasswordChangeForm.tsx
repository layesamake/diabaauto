"use client";

/**
 * Formulaire de changement de mot de passe du back-office.
 *
 * Le formulaire ne décide de rien : il envoie les champs connus à la Server Action et affiche l'état
 * renvoyé (chargement, erreur, succès). Aucun succès n'est simulé côté navigateur — le message de
 * réussite n'apparaît que si le serveur l'a renvoyé.
 *
 * Le formulaire est vidé après un succès réel : `event.currentTarget` est capturé AVANT l'`await`,
 * car React l'annule à la fin de la distribution de l'événement (défaut corrigé au lot 5 : lire
 * `event.currentTarget` après un `await` lève une TypeError qui masque le vrai résultat).
 */

import { useState } from "react";
import { changePasswordAction, type AccountActionState } from "@/app/admin/compte/actions";
import { Field } from "@/components/auth/Field";
import { fieldMessage, formStatus } from "@/components/auth/form-state";
import { StatusMessage } from "@/components/auth/StatusMessage";
import { accountFr } from "@/lib/i18n/account.fr";

export function PasswordChangeForm() {
  const [state, setState] = useState<AccountActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = formStatus(state);
  const messages = accountFr.fieldMessages as Record<string, string>;

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
      const result = await changePasswordAction(formData);
      setState(result);

      if ("data" in result) {
        form.reset();
      }
    } catch {
      setState({
        error: {
          code: "INTERNAL",
          message: "Le mot de passe n'a pas pu être modifié. Réessayez.",
          correlationId: "",
        },
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="compte-mot-de-passe"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 id="compte-mot-de-passe" className="text-lg font-semibold text-[#011D4F]">
        {accountFr.passwordSectionTitle}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{accountFr.passwordSectionHint}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
        <StatusMessage tone={status.tone} message={status.message} />

        <Field
          id="compte-current-password"
          name="currentPassword"
          label={accountFr.currentPasswordLabel}
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          error={fieldMessage(state, "currentPassword", messages)}
        />

        <Field
          id="compte-new-password"
          name="newPassword"
          label={accountFr.newPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
          hint={accountFr.policyHint}
          error={fieldMessage(state, "newPassword", messages)}
        />

        <Field
          id="compte-confirm-password"
          name="confirmPassword"
          label={accountFr.confirmPasswordLabel}
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
          error={fieldMessage(state, "confirmPassword", messages)}
        />

        <div>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="rounded-lg bg-[#0063DF] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? accountFr.submitting : accountFr.submit}
          </button>
        </div>

        <p className="text-xs text-slate-500">{accountFr.recoveryHint}</p>
      </form>
    </section>
  );
}
