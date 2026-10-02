"use client";

/**
 * Formulaire de demande personnalisée (`/commander`, contrat lot 4 §2 Sous-agent C).
 *
 * Même mécanique que `components/auth/RegisterForm.tsx` : état `pending`, enveloppe d'erreur lue
 * depuis la Server Action, pas de soumission native (`preventDefault`). Le composant ne valide rien
 * lui-même : la validation stricte et les contrôles d'accès vivent côté serveur
 * (`services/custom-request.service.ts`).
 *
 * Si le client est connecté (`isAuthenticated`), les champs de contact ne sont pas proposés : les
 * coordonnées sont lues en lecture seule depuis le profil serveur, pas de champ modifiable redondant
 * avec My Diaba Auto (contrat §2).
 */

import { useState } from "react";
import { submitCustomRequestAction, type CustomRequestActionState } from "@/app/(public)/commander/actions";
import { customRequestMessages as msg } from "@/lib/i18n/custom-request.fr";

export type CustomRequestFormProps = {
  isAuthenticated: boolean;
  /** Coordonnées lues depuis le profil serveur ; affichées en lecture seule si connecté. */
  connectedContact?: { name: string; phone: string | null };
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525] focus:border-[#0063DF] disabled:cursor-not-allowed disabled:bg-[#f4f7fb] disabled:text-[#5a6577]";

function fieldMessage(state: CustomRequestActionState | null, name: string): string | null {
  if (!state || !("error" in state) || !state.error.fields?.includes(name)) {
    return null;
  }

  return msg.fieldErrors[name] ?? "Valeur invalide pour ce champ.";
}

function statusMessage(state: CustomRequestActionState | null): { tone: "error" | "success"; message: string } {
  if (!state) {
    return { tone: "success", message: "" };
  }

  if ("error" in state) {
    return { tone: "error", message: state.error.message };
  }

  return { tone: "success", message: state.data.message };
}

export function CustomRequestForm({ isAuthenticated, connectedContact }: CustomRequestFormProps) {
  const [state, setState] = useState<CustomRequestActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = statusMessage(state);
  const succeeded = state !== null && "data" in state;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);

    try {
      const result = await submitCustomRequestAction(formData);
      setState(result);
      if ("data" in result) {
        // `event.currentTarget` vaut null après un await : on capture l'élément AVANT l'appel.
        // Sans cela, `reset()` lève une TypeError, le catch affiche un échec alors que la demande
        // est bien enregistrée, et l'utilisateur resoumet (doublons).
        form.reset();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: msg.submitGenericError } });
    } finally {
      setPending(false);
    }
  }

  if (succeeded) {
    return (
      <div role="status" className="rounded-lg border border-[#bfe3d0] bg-[#effaf3] px-4 py-3 text-sm text-[#036b4b]">
        {status.message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div
        role={status.tone === "error" ? "alert" : undefined}
        aria-live={status.tone === "error" ? "assertive" : undefined}
        className={status.tone === "error" && status.message ? "rounded-lg border border-[#f3c9c4] bg-[#fdf2f1] px-3 py-2 text-sm text-[#95312a]" : "sr-only"}
      >
        {status.message}
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-lg font-semibold text-[#011D4F]">{msg.criteriaTitle}</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="commande-marque" className="text-sm font-medium text-[#011D4F]">
              {msg.brandLabel}
            </label>
            <input
              id="commande-marque"
              name="brand"
              type="text"
              maxLength={120}
              disabled={pending}
              aria-invalid={fieldMessage(state, "brand") ? true : undefined}
              className={fieldClass}
            />
            {fieldMessage(state, "brand") ? (
              <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "brand")}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="commande-modele" className="text-sm font-medium text-[#011D4F]">
              {msg.modelLabel}
            </label>
            <input
              id="commande-modele"
              name="model"
              type="text"
              maxLength={120}
              disabled={pending}
              aria-invalid={fieldMessage(state, "model") ? true : undefined}
              className={fieldClass}
            />
            {fieldMessage(state, "model") ? (
              <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "model")}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="commande-notes" className="text-sm font-medium text-[#011D4F]">
            {msg.notesLabel}
          </label>
          <p className="mt-1 text-xs text-slate-600">{msg.notesHint}</p>
          <textarea
            id="commande-notes"
            name="notes"
            rows={4}
            maxLength={500}
            disabled={pending}
            aria-invalid={fieldMessage(state, "notes") ? true : undefined}
            className={fieldClass}
          />
          {fieldMessage(state, "notes") ? (
            <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "notes")}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="commande-budget-min" className="text-sm font-medium text-[#011D4F]">
              {msg.budgetMinLabel}
            </label>
            <input
              id="commande-budget-min"
              name="budgetMin"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              disabled={pending}
              aria-invalid={fieldMessage(state, "budgetMin") ? true : undefined}
              className={fieldClass}
            />
            {fieldMessage(state, "budgetMin") ? (
              <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "budgetMin")}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="commande-budget-max" className="text-sm font-medium text-[#011D4F]">
              {msg.budgetMaxLabel}
            </label>
            <input
              id="commande-budget-max"
              name="budgetMax"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              disabled={pending}
              aria-invalid={fieldMessage(state, "budgetMax") ? true : undefined}
              className={fieldClass}
            />
            {fieldMessage(state, "budgetMax") ? (
              <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "budgetMax")}</p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-lg font-semibold text-[#011D4F]">{msg.contactTitle}</legend>

        {isAuthenticated ? (
          <div className="rounded-lg border border-slate-200 bg-[#f4f7fb] px-3 py-3 text-sm text-slate-700">
            <p>{msg.contactConnectedNotice}</p>
            {connectedContact ? (
              <dl className="mt-2 grid gap-1">
                <div>
                  <dt className="inline font-medium text-[#011D4F]">{msg.contactNameLabel} : </dt>
                  <dd className="inline">{connectedContact.name}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-[#011D4F]">{msg.contactPhoneLabel} : </dt>
                  <dd className="inline">{connectedContact.phone ?? "Non renseigné"}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">{msg.contactIntro}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="commande-nom" className="text-sm font-medium text-[#011D4F]">
                  {msg.contactNameLabel} <span aria-hidden="true">*</span>
                  <span className="sr-only">(champ obligatoire)</span>
                </label>
                <input
                  id="commande-nom"
                  name="contactName"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={80}
                  disabled={pending}
                  aria-invalid={fieldMessage(state, "contactName") ? true : undefined}
                  className={fieldClass}
                />
                {fieldMessage(state, "contactName") ? (
                  <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "contactName")}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="commande-telephone" className="text-sm font-medium text-[#011D4F]">
                  {msg.contactPhoneLabel} <span aria-hidden="true">*</span>
                  <span className="sr-only">(champ obligatoire)</span>
                </label>
                <input
                  id="commande-telephone"
                  name="contactPhone"
                  type="tel"
                  autoComplete="tel"
                  required
                  maxLength={32}
                  disabled={pending}
                  aria-invalid={fieldMessage(state, "contactPhone") ? true : undefined}
                  className={fieldClass}
                />
                {fieldMessage(state, "contactPhone") ? (
                  <p className="mt-1 text-sm text-[#95312a]">{fieldMessage(state, "contactPhone")}</p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-lg bg-[#0063DF] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? msg.submitting : msg.submit}
      </button>
    </form>
  );
}
