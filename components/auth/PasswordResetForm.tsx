"use client";

/**
 * Formulaire de définition d'un nouveau mot de passe.
 *
 * Accessible uniquement avec la session ouverte par le lien de récupération : la Server Action vérifie
 * la session auprès de Supabase avant toute écriture et refuse un lien invalide ou expiré.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { Field } from "@/components/auth/Field";
import { fieldMessage, formStatus, redirectTarget } from "@/components/auth/form-state";
import { StatusMessage } from "@/components/auth/StatusMessage";

const FIELD_MESSAGES: Record<string, string> = {
  password: "Le mot de passe doit contenir au moins 8 caractères.",
  confirmPassword: "Les deux mots de passe ne correspondent pas.",
};

export function PasswordResetForm() {
  const router = useRouter();
  const [state, setState] = useState<AuthActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = formStatus(state);
  const destination = redirectTarget(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setPending(true);

    try {
      const result = await resetPasswordAction(formData);
      setState(result);

      const target = redirectTarget(result);
      if (target) {
        router.replace(target);
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: "Le mot de passe n'a pas pu être mis à jour. Réessayez." } });
    } finally {
      setPending(false);
    }
  }

  if (state && "data" in state && !destination) {
    return <StatusMessage tone="success" message={state.data.message} />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <StatusMessage tone="error" message={status.tone === "error" ? status.message : ""} />

      <Field
        id="reinitialisation-password"
        name="password"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
        hint="8 caractères minimum."
        disabled={pending}
        error={fieldMessage(state, "password", FIELD_MESSAGES)}
      />

      <Field
        id="reinitialisation-confirmation"
        name="confirmPassword"
        label="Confirmation du nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
        disabled={pending}
        error={fieldMessage(state, "confirmPassword", FIELD_MESSAGES)}
      />

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-lg bg-[#0063DF] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
      </button>

      <Link href="/recuperation" className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
        Demander un nouveau lien
      </Link>
    </form>
  );
}
