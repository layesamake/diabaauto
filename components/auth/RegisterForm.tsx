"use client";

/**
 * Formulaire d'inscription.
 *
 * Seuls les champs personnels sont envoyés (`firstName`, `lastName`, `email`, `password`,
 * `confirmPassword`). Le domaine privilégié (`userType`, `status`, `resellerStatus`, `roleId`) n'est ni
 * proposé à l'écran ni lu par la Server Action : un utilisateur ne peut pas se déclarer STAFF ou
 * Revendeur approuvé (doc 11, CLAUDE.md §5).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { Field } from "@/components/auth/Field";
import { fieldMessage, formStatus, redirectTarget } from "@/components/auth/form-state";
import { StatusMessage } from "@/components/auth/StatusMessage";

const FIELD_MESSAGES: Record<string, string> = {
  firstName: "Le prénom est obligatoire (80 caractères maximum).",
  lastName: "Le nom est obligatoire (80 caractères maximum).",
  email: "Saisissez une adresse e-mail valide.",
  password: "Le mot de passe doit contenir au moins 8 caractères.",
  confirmPassword: "Les deux mots de passe ne correspondent pas.",
};

export function RegisterForm() {
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
      const result = await signUpAction(formData);
      setState(result);

      const target = redirectTarget(result);
      if (target) {
        router.replace(target);
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: "L'inscription n'a pas pu aboutir. Réessayez." } });
    } finally {
      setPending(false);
    }
  }

  // Succès sans session (confirmation d'adresse requise) : le formulaire laisse place au message.
  if (state && "data" in state && !destination) {
    return (
      <div className="flex flex-col gap-4">
        <StatusMessage tone="success" message={state.data.message} />
        <Link
          href="/connexion"
          className="rounded-lg bg-[#0063DF] px-4 py-2.5 text-center text-base font-semibold text-white hover:bg-[#0354A3]"
        >
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <StatusMessage tone="error" message={status.tone === "error" ? status.message : ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="inscription-prenom"
          name="firstName"
          label="Prénom"
          autoComplete="given-name"
          required
          disabled={pending}
          error={fieldMessage(state, "firstName", FIELD_MESSAGES)}
        />
        <Field
          id="inscription-nom"
          name="lastName"
          label="Nom"
          autoComplete="family-name"
          required
          disabled={pending}
          error={fieldMessage(state, "lastName", FIELD_MESSAGES)}
        />
      </div>

      <Field
        id="inscription-email"
        name="email"
        label="Adresse e-mail"
        type="email"
        autoComplete="email"
        required
        disabled={pending}
        error={fieldMessage(state, "email", FIELD_MESSAGES)}
      />

      <Field
        id="inscription-password"
        name="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        required
        hint="8 caractères minimum. Le mot de passe est géré par Supabase Auth et n'est jamais stocké par Diaba Auto."
        disabled={pending}
        error={fieldMessage(state, "password", FIELD_MESSAGES)}
      />

      <Field
        id="inscription-confirmation"
        name="confirmPassword"
        label="Confirmation du mot de passe"
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
        {pending ? "Création du compte…" : "Créer mon compte"}
      </button>
    </form>
  );
}
