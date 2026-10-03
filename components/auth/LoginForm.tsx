"use client";

/**
 * Formulaire de connexion.
 *
 * Le formulaire ne décide de rien : il envoie les champs connus à la Server Action, affiche l'état
 * renvoyé par le serveur (chargement, erreur, succès) et ne navigue qu'après confirmation réelle.
 * Aucun succès n'est simulé côté navigateur (CLAUDE.md §4).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInAction, type AuthActionState } from "@/app/(auth)/actions";
import { AFTER_LOGIN_PATH, NEXT_PATH_PARAM } from "@/components/auth/auth-navigation";
import { Field } from "@/components/auth/Field";
import { fieldMessage, formStatus, redirectTarget } from "@/components/auth/form-state";
import { StatusMessage } from "@/components/auth/StatusMessage";

const FIELD_MESSAGES: Record<string, string> = {
  email: "Saisissez une adresse e-mail valide.",
  password: "Saisissez votre mot de passe.",
  [NEXT_PATH_PARAM]: "Destination de redirection invalide.",
};

export type LoginFormProps = {
  /** Destination interne demandée par le middleware (`/connexion?suivant=...`). */
  nextPath?: string;
  /** Message d'échec transmis par la route de callback Auth, le cas échéant. */
  initialError?: string | null;
};

export function LoginForm({ nextPath = AFTER_LOGIN_PATH, initialError = null }: LoginFormProps) {
  const router = useRouter();
  const [state, setState] = useState<AuthActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = formStatus(state, initialError ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set(NEXT_PATH_PARAM, nextPath);
    setPending(true);

    try {
      const result = await signInAction(formData);
      setState(result);

      const destination = redirectTarget(result);
      if (destination) {
        router.replace(destination);
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: "La connexion n'a pas pu aboutir. Réessayez." } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <StatusMessage tone={status.tone} message={status.message} />

      <Field
        id="connexion-email"
        name="email"
        label="Adresse e-mail"
        type="email"
        autoComplete="email"
        required
        disabled={pending}
        error={fieldMessage(state, "email", FIELD_MESSAGES)}
      />

      <Field
        id="connexion-password"
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        required
        disabled={pending}
        error={fieldMessage(state, "password", FIELD_MESSAGES)}
      />

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-lg bg-[#0063DF] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
