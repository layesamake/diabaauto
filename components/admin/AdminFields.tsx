import type { ReactNode } from "react";

/**
 * Champs de formulaire du back-office (patron `components/auth/Field.tsx`).
 *
 * Accessibilité : libellé lié par `htmlFor`, aide et erreur reliées par `aria-describedby`,
 * `aria-invalid` en erreur, obligatoire annoncé aux lecteurs d'écran. Aucun composant ne valide :
 * la validation fait autorité côté serveur (services du lot L2). Aucune valeur transmise par le
 * navigateur n'est réaffichée en cas d'erreur.
 */

const CONTROL_CLASS =
  "w-full rounded-lg border bg-white px-3 py-2 text-base text-[#071525] disabled:cursor-not-allowed disabled:bg-[#f4f7fb] disabled:text-[#5a6577]";

type CommonProps = {
  id: string;
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
};

function controlBorder(error?: string | null): string {
  return error ? "border-[#b42318]" : "border-slate-300 focus:border-[#0063DF]";
}

function describedBy(id: string, hint?: ReactNode, error?: string | null): string | undefined {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter((value): value is string => value !== null)
      .join(" ") || undefined
  );
}

function FieldLabel({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return (
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
  );
}

function FieldHint({ id, hint }: { id: string; hint?: ReactNode }) {
  if (!hint) {
    return null;
  }

  return (
    <p id={`${id}-hint`} className="text-xs text-slate-600">
      {hint}
    </p>
  );
}

function FieldError({ id, error }: { id: string; error?: string | null }) {
  if (!error) {
    return null;
  }

  return (
    <p id={`${id}-error`} className="text-sm font-medium text-[#95312a]">
      {error}
    </p>
  );
}

export type AdminTextFieldProps = CommonProps & {
  type?: "text" | "email" | "tel" | "url" | "number" | "date" | "search";
  defaultValue?: string | number;
  placeholder?: string;
  step?: string;
  min?: number;
  max?: number;
};

export function AdminTextField({
  id,
  name,
  label,
  type = "text",
  hint,
  error,
  required = false,
  disabled = false,
  defaultValue,
  placeholder,
  step,
  min,
  max,
}: AdminTextFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel id={id} label={label} required={required} />
      <FieldHint id={id} hint={hint} />
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        disabled={disabled}
        className={`${CONTROL_CLASS} ${controlBorder(error)}`}
      />
      <FieldError id={id} error={error} />
    </div>
  );
}

export type AdminSelectFieldProps = CommonProps & {
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  /** Valeur pilotée : lorsqu'elle est fournie, le champ est contrôlé (cascade marque → modèle). */
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Libellé de l'option vide. Fourni ⇒ une option vide est proposée (champ effaçable). */
  emptyLabel?: string;
};

export function AdminSelectField({
  id,
  name,
  label,
  options,
  hint,
  error,
  required = false,
  disabled = false,
  defaultValue,
  value,
  onChange,
  emptyLabel,
}: AdminSelectFieldProps) {
  const controlled = value !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel id={id} label={label} required={required} />
      <FieldHint id={id} hint={hint} />
      <select
        id={id}
        name={name}
        {...(controlled ? { value, onChange } : { defaultValue })}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        disabled={disabled}
        className={`${CONTROL_CLASS} ${controlBorder(error)}`}
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={id} error={error} />
    </div>
  );
}

export type AdminTextareaFieldProps = CommonProps & {
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
};

export function AdminTextareaField({
  id,
  name,
  label,
  hint,
  error,
  required = false,
  disabled = false,
  defaultValue,
  rows = 4,
  placeholder,
}: AdminTextareaFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel id={id} label={label} required={required} />
      <FieldHint id={id} hint={hint} />
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        disabled={disabled}
        className={`${CONTROL_CLASS} ${controlBorder(error)}`}
      />
      <FieldError id={id} error={error} />
    </div>
  );
}

export type AdminCheckboxFieldProps = {
  id: string;
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  defaultChecked?: boolean;
  disabled?: boolean;
};

export function AdminCheckboxField({
  id,
  name,
  label,
  hint,
  error,
  defaultChecked = false,
  disabled = false,
}: AdminCheckboxFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={name}
          type="checkbox"
          value="on"
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          disabled={disabled}
          className="size-4 rounded border-slate-300 text-[#0063DF] focus:border-[#0063DF]"
        />
        <label htmlFor={id} className="text-sm font-medium text-[#011D4F]">
          {label}
        </label>
      </div>
      <FieldHint id={id} hint={hint} />
      <FieldError id={id} error={error} />
    </div>
  );
}
