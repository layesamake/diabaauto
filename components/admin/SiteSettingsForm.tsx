"use client";

/**
 * Formulaire des coordonnées de contact. Il ne valide rien et n'autorise rien : le service applique
 * la permission et la validation. Le succès n'est affiché que si le serveur l'a confirmé.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import { updateSiteSettingsAction } from "@/app/admin/parametres/actions";
import { adminFieldMessage, adminFormStatus } from "@/components/admin/admin-action-state";
import { StatusMessage } from "@/components/auth/StatusMessage";
import type { SiteSettingsField, SiteSettingsValues } from "@/lib/site-settings/site-settings-schema";

type FieldSpec = {
  name: SiteSettingsField;
  label: string;
  hint: string;
  type: "text" | "email" | "tel";
  autoComplete?: string;
  error: string;
};

const FIELDS: readonly FieldSpec[] = [
  {
    name: "whatsappNumber",
    label: "Numéro WhatsApp",
    hint: "Avec l'indicatif du pays, par exemple +221 78 225 40 40. Il sert au bouton « Nous écrire sur WhatsApp » des fiches véhicules.",
    type: "tel",
    autoComplete: "off",
    error: "Numéro invalide : indiquez l'indicatif du pays puis 8 à 15 chiffres.",
  },
  {
    name: "contactPhone",
    label: "Téléphone",
    hint: "Numéro affiché pour les appels.",
    type: "tel",
    autoComplete: "off",
    error: "Téléphone trop long (40 caractères au plus).",
  },
  {
    name: "contactEmail",
    label: "Adresse e-mail",
    hint: "Adresse de contact affichée sur le site.",
    type: "email",
    autoComplete: "off",
    error: "Adresse e-mail invalide.",
  },
  {
    name: "contactAddress",
    label: "Adresse",
    hint: "Rue ou quartier, tel que vous voulez l'afficher.",
    type: "text",
    autoComplete: "off",
    error: "Adresse trop longue (200 caractères au plus).",
  },
  {
    name: "contactCity",
    label: "Ville",
    hint: "",
    type: "text",
    autoComplete: "off",
    error: "Ville trop longue (80 caractères au plus).",
  },
  {
    name: "contactCountry",
    label: "Pays",
    hint: "",
    type: "text",
    autoComplete: "off",
    error: "Pays trop long (80 caractères au plus).",
  },
];

const FIELD_ERRORS = Object.fromEntries(FIELDS.map((field) => [field.name, field.error]));

export function SiteSettingsForm({ initial }: { initial: SiteSettingsValues }) {
  const router = useRouter();
  const [state, setState] = useState<AdminActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = adminFormStatus(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setPending(true);

    try {
      const result = await updateSiteSettingsAction(formData);
      setState(result);
      if ("data" in result) {
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: "L'enregistrement a échoué. Réessayez." } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <StatusMessage tone={status.tone} message={status.message} />

      {FIELDS.map((field) => {
        const error = adminFieldMessage(state, field.name, FIELD_ERRORS);
        const id = `settings-${field.name}`;
        const describedBy =
          [field.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
          undefined;

        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium text-[#011D4F]">
              {field.label}
            </label>
            {field.hint ? (
              <p id={`${id}-hint`} className="text-xs text-slate-600">
                {field.hint}
              </p>
            ) : null}
            <input
              id={id}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              defaultValue={initial[field.name] ?? ""}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-base text-[#071525] ${
                error ? "border-[#b42318]" : "border-slate-300 focus:border-[#0063DF]"
              }`}
            />
            {error ? (
              <p id={`${id}-error`} className="text-sm font-medium text-[#95312a]">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#0063DF] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
