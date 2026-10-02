"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProfileActionState } from "@/app/my-diaba-auto/actions";
import type { CustomerProfileView } from "@/services/profile.service";

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#071525] focus:border-[#0063DF] disabled:bg-[#f4f7fb]";

type FieldConfig = {
  name: "firstName" | "lastName" | "phone" | "whatsapp" | "city" | "country";
  label: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
};

const fields: FieldConfig[] = [
  { name: "firstName", label: "Prénom", required: true, autoComplete: "given-name" },
  { name: "lastName", label: "Nom", required: true, autoComplete: "family-name" },
  { name: "phone", label: "Téléphone", type: "tel", autoComplete: "tel" },
  { name: "whatsapp", label: "WhatsApp", type: "tel" },
  { name: "city", label: "Ville", autoComplete: "address-level2" },
  { name: "country", label: "Pays", autoComplete: "country-name" },
];

/** Enveloppe normalisée (T11) : message global, champs fautifs signalés par leur NOM uniquement. */
function statusMessage(state: ProfileActionState | null): { tone: "error" | "success"; message: string } {
  if (!state) {
    return { tone: "success", message: "" };
  }

  if ("error" in state) {
    return { tone: "error", message: state.error.message };
  }

  return { tone: "success", message: state.data.message };
}

function errorMessageForField(state: ProfileActionState | null, name: FieldConfig["name"]): string | null {
  if (!state || !("error" in state) || !state.error.fields?.includes(name)) {
    return null;
  }

  return "Valeur invalide pour ce champ.";
}

/**
 * Formulaire d'édition du profil personnel.
 * Le composant ne valide rien lui-même : la validation stricte et les contrôles d'accès vivent côté
 * serveur (services/profile.service.ts). Le formulaire n'annonce un succès qu'après la réponse réelle.
 */
export function ProfileForm({
  profile,
  action,
}: {
  profile: CustomerProfileView;
  action: (formData: FormData) => Promise<ProfileActionState>;
}) {
  const router = useRouter();
  const [state, setState] = useState<ProfileActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = statusMessage(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);

    try {
      const result = await action(formData);
      setState(result);
      if ("data" in result) {
        router.refresh();
      }
    } catch {
      setState({
        error: {
          code: "INTERNAL",
          message: "La mise à jour n'a pas pu aboutir. Réessayez.",
        },
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="profil-edition" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="profil-edition" className="text-lg font-semibold text-[#011D4F]">
        Modifier mes informations
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Seuls votre prénom, votre nom et vos coordonnées personnelles sont modifiables ici.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const fieldError = errorMessageForField(state, field.name);

          return (
            <div key={field.name}>
              <label htmlFor={`profile-${field.name}`} className="text-sm font-medium text-[#011D4F]">
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>
              <input
                id={`profile-${field.name}`}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={profile[field.name] ?? ""}
                required={field.required}
                autoComplete={field.autoComplete}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `profile-${field.name}-error` : undefined}
                disabled={pending}
                className={fieldClass}
              />
              {fieldError ? (
                <p id={`profile-${field.name}-error`} className="mt-1 text-sm text-[#95312a]">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        })}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <p
        role="status"
        aria-live="polite"
        className={`mt-4 text-sm ${status.tone === "success" ? "text-[#036b4b]" : "text-[#95312a]"}`}
      >
        {status.message}
      </p>
    </section>
  );
}
