/**
 * Champ de saisie étiqueté (formulaires d'authentification).
 *
 * Accessibilité : libellé persistant (`label` lié par `htmlFor`), aide et message d'erreur reliés par
 * `aria-describedby`, `aria-invalid` en erreur, marque obligatoire annoncée aux lecteurs d'écran.
 * Le composant ne valide rien : la validation fait autorité côté serveur.
 * Aucune valeur fournie par le navigateur n'est affichée en cas d'erreur (dev.md §6).
 */

import type { ReactNode } from "react";

export type FieldProps = {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel";
  autoComplete?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
};

const INPUT_CLASS =
  "w-full rounded-lg border bg-white px-3 py-2 text-base text-[#071525] disabled:cursor-not-allowed disabled:bg-[#f4f7fb] disabled:text-[#5a6577]";

export function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  required = false,
  hint,
  error,
  disabled = false,
}: FieldProps) {
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter((value): value is string => value !== null)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-[#011D4F]">
        {label}
        {required ? (
          <>
            {" "}
            <span aria-hidden="true">*</span>
            <span className="sr-only">(champ obligatoire)</span>
          </>
        ) : null}
      </label>

      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-600">
          {hint}
        </p>
      ) : null}

      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        className={`${INPUT_CLASS} ${error ? "border-[#b42318]" : "border-slate-300 focus:border-[#0063DF]"}`}
      />

      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-[#95312a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
