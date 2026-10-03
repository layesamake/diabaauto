"use client";

/**
 * Formulaire d'une page de contenu. Il ne valide rien et n'autorise rien : le service applique la
 * permission et la validation. Le succès n'est affiché que si le serveur l'a confirmé.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import { updateSitePageAction } from "@/app/admin/contenus/actions";
import { adminFieldMessage, adminFormStatus } from "@/components/admin/admin-action-state";
import { StatusMessage } from "@/components/auth/StatusMessage";
import { SITE_PAGE_BODY_MAX, SITE_PAGE_TITLE_MAX } from "@/lib/site-pages/site-pages";

const FIELD_ERRORS = {
  title: `Le titre est obligatoire (${SITE_PAGE_TITLE_MAX} caractères au plus).`,
  body: `Le texte est obligatoire (${SITE_PAGE_BODY_MAX} caractères au plus).`,
};

const INPUT = "w-full rounded-lg border bg-white px-3 py-2 text-base text-[#071525]";

export function SitePageForm({ slug, title, body }: { slug: string; title: string; body: string }) {
  const router = useRouter();
  const [state, setState] = useState<AdminActionState | null>(null);
  const [pending, setPending] = useState(false);
  const status = adminFormStatus(state);
  const titleError = adminFieldMessage(state, "title", FIELD_ERRORS);
  const bodyError = adminFieldMessage(state, "body", FIELD_ERRORS);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setPending(true);

    try {
      const result = await updateSitePageAction(formData);
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
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-1">
        <label htmlFor="page-title" className="text-sm font-medium text-[#011D4F]">
          Titre de la page
        </label>
        <input
          id="page-title"
          name="title"
          type="text"
          defaultValue={title}
          maxLength={SITE_PAGE_TITLE_MAX}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "page-title-error" : undefined}
          className={`${INPUT} ${titleError ? "border-[#b42318]" : "border-slate-300 focus:border-[#0063DF]"}`}
        />
        {titleError ? (
          <p id="page-title-error" className="text-sm font-medium text-[#95312a]">
            {titleError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="page-body" className="text-sm font-medium text-[#011D4F]">
          Texte
        </label>
        <p id="page-body-hint" className="text-xs text-slate-600">
          Séparez les paragraphes par une ligne vide. Une ligne commençant par « ## » devient un intertitre ;
          des lignes commençant par « - » forment une liste. Rien d&apos;autre n&apos;est interprété.
        </p>
        <textarea
          id="page-body"
          name="body"
          rows={16}
          defaultValue={body}
          maxLength={SITE_PAGE_BODY_MAX}
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={`page-body-hint${bodyError ? " page-body-error" : ""}`}
          className={`${INPUT} font-mono text-sm ${bodyError ? "border-[#b42318]" : "border-slate-300 focus:border-[#0063DF]"}`}
        />
        {bodyError ? (
          <p id="page-body-error" className="text-sm font-medium text-[#95312a]">
            {bodyError}
          </p>
        ) : null}
      </div>

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
