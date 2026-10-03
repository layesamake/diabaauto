"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { isSitePageSlug, parseSitePageInput, readSitePageForm, SITE_PAGES } from "@/lib/site-pages/site-pages";
import { sitePageTag } from "@/services/public-page.service";
import { updateSitePage } from "@/services/site-page.service";

/**
 * Server Action de l'écran « Contenus ». Session résolue côté serveur ; la permission
 * `content.manage` et la validation sont appliquées par le service. L'analyse préalable ne sert
 * qu'à nommer les champs fautifs (jamais leur contenu).
 */
export async function updateSitePageAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const raw = readSitePageForm(formData);
    const parsed = parseSitePageInput(raw);
    if (!parsed.ok) {
      return {
        error: {
          code: "VALIDATION",
          message: "Le titre et le texte sont obligatoires. Corrigez les champs signalés.",
          correlationId: newCorrelationId(),
          fields: [...parsed.fields],
        },
      };
    }

    await updateSitePage(actor, raw);

    if (isSitePageSlug(raw.slug)) {
      revalidateTag(sitePageTag(raw.slug));
      revalidatePath(SITE_PAGES[raw.slug].publicPath);
    }
    revalidatePath("/admin/contenus");
    return ok({ message: "Page enregistrée. Elle est à jour sur le site." });
  } catch (error) {
    return { error: toErrorResponse(error, { correlationId: newCorrelationId() }).error };
  }
}
