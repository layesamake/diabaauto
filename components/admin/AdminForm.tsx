"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import { adminFormStatus, adminRedirectTarget } from "@/components/admin/admin-action-state";
import { StatusMessage } from "@/components/auth/StatusMessage";

/**
 * Formulaire client générique du back-office (patron `RegisterForm`).
 *
 * React 18.3 : pas de `useActionState` — état local `useState`, gestionnaire `onSubmit` asynchrone,
 * bouton désactivé pendant l'envoi. Le composant ne valide rien lui-même : il transmet le
 * `FormData` à la Server Action, qui appelle le service (gardes et règles métier côté serveur).
 *
 * Le `<fieldset disabled>` désactive nativement tous les champs pendant l'envoi, y compris les
 * champs rendus par le parent (qui restent côté serveur).
 */
export function AdminForm({
  action,
  submitLabel,
  pendingLabel = "Enregistrement…",
  children,
  resetOnSuccess = false,
  fallbackError = "L'opération n'a pas pu aboutir. Réessayez.",
  className,
  footer,
}: {
  action: (formData: FormData) => Promise<AdminActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
  fallbackError?: string;
  className?: string;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<AdminActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = adminFormStatus(state);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);

    try {
      const result = await action(formData);
      setState(result);

      if ("data" in result) {
        if (resetOnSuccess) {
          form.reset();
        }

        const target = adminRedirectTarget(result);
        if (target) {
          router.replace(target);
        }
        router.refresh();
      }
    } catch {
      setState({ error: { code: "INTERNAL", message: fallbackError } });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={className ?? "flex flex-col gap-4"}>
      <StatusMessage tone="error" message={status.tone === "error" ? status.message : ""} />

      <fieldset disabled={pending} className="contents">
        {children}
        {footer}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </fieldset>

      <StatusMessage tone="success" message={status.tone === "success" ? status.message : ""} />
    </form>
  );
}
