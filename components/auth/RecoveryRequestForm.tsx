"use client";

/**
 * Formulaire de demande de récupération de compte.
 *
 * Le serveur renvoie toujours le même message, que l'adresse corresponde à un compte ou non : ce
 * formulaire ne permet donc pas de découvrir quelles adresses sont enregistrées (doc 17).
 */

import Link from "next/link";
import { useState } from "react";
import { requestAccountRecoveryAction, type AuthActionState } from "@/app/(auth)/actions";
import { Field } from "@/components/auth/Field";
import { fieldMessage, formStatus } from "@/components/auth/form-state";
import { StatusMessage } from "@/components/auth/StatusMessage";

const FIELD_MESSAGES: Record<string, string> = {
  email: "Saisissez une adresse e-mail valide.",
};

export function RecoveryRequestForm() {
  const [state, setState] = useState<AuthActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = formStatus(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setPending(true);

    try {
      setState(await requestAccountRecoveryAction(formData));
    } catch {
      setState({ error: { code: "INTERNAL", message: "La demande n'a pas pu aboutir. Réessayez." } });
    } finally {
      setPending(false);
    }
  }

  if (state && "data" in state) {
    return (
      <div className="flex flex-col gap-4">
        <StatusMessage tone="info" message={state.data.message} />
        <p className="text-sm text-slate-600">
          Pensez à vérifier le dossier des courriers indésirables si l&apos;e-mail n&apos;arrive pas.
        </p>
        <Link href="/connexion" className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
          Revenir à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <StatusMessage tone="error" message={status.tone === "error" ? status.message : ""} />

      <Field
        id="recuperation-email"
        name="email"
        label="Adresse e-mail du compte"
        type="email"
        autoComplete="email"
        required
        hint="L'adresse utilisée lors de l'inscription."
        disabled={pending}
        error={fieldMessage(state, "email", FIELD_MESSAGES)}
      />

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-lg bg-[#0063DF] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Envoi en cours…" : "Envoyer le lien de réinitialisation"}
      </button>
    </form>
  );
}
