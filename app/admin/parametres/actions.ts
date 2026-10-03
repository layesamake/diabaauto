"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { AdminActionState } from "@/app/admin/actions";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse } from "@/lib/errors";
import { parseSiteSettings, readSiteSettingsForm } from "@/lib/site-settings/site-settings-schema";
import { SITE_CONTACT_TAG } from "@/services/public-contact.service";
import { updateSiteSettings } from "@/services/site-settings.service";

/**
 * Server Action de l'écran « Paramètres ».
 *
 * Session résolue côté serveur ; la permission `settings.manage` et la validation sont appliquées
 * par le service. L'analyse préalable ne sert qu'à nommer les champs fautifs (jamais leur valeur).
 */
export async function updateSiteSettingsAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const raw = readSiteSettingsForm(formData);
    const parsed = parseSiteSettings(raw);
    if (!parsed.ok) {
      return {
        error: {
          code: "VALIDATION",
          message: "Certaines coordonnées ne sont pas valides. Corrigez les champs signalés.",
          correlationId: newCorrelationId(),
          fields: [...parsed.fields],
        },
      };
    }

    await updateSiteSettings(actor, raw);
    revalidateTag(SITE_CONTACT_TAG);
    revalidatePath("/admin/parametres");
    revalidatePath("/contact");
    return ok({ message: "Coordonnées enregistrées. Elles sont à jour sur le site." });
  } catch (error) {
    return { error: toErrorResponse(error, { correlationId: newCorrelationId() }).error };
  }
}
