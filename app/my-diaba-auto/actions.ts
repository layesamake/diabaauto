"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCustomerRepository } from "@/repositories/customer.repository";
import { ProfileValidationError, updateOwnCustomerProfile } from "@/services/profile.service";

/**
 * Server Actions de My Diaba Auto.
 *
 * Ordre imposé (CLAUDE.md §6) : la session est résolue côté serveur par `getCurrentActor()`, puis
 * `updateOwnCustomerProfile` applique le statut du compte, la permission et la propriété avant toute
 * validation et écriture. Masquer un champ dans le formulaire ne protège rien : ces gardes sont le
 * seul point d'entrée réel.
 *
 * Réponses : même enveloppe normalisée que les actions d'authentification (T11) —
 * `data { message }` en succès, `error { code, message, correlationId, fields? }` en échec.
 * Seuls des NOMS de champs sont exposés, jamais les valeurs saisies ni un détail interne.
 */
export type ProfileActionError = ErrorEnvelope["error"] & {
  /** Champs en cause lorsque l'erreur est une erreur de validation. */
  fields?: string[];
};

export type ProfileActionState = { data: { message: string } } | { error: ProfileActionError };

/** Mise à jour du profil personnel. La cible vient de l'acteur, jamais du formulaire. */
export async function updateProfileAction(formData: FormData): Promise<ProfileActionState> {
  const actor = await getCurrentActor();

  try {
    await updateOwnCustomerProfile(createCustomerRepository(), actor, {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      whatsapp: formData.get("whatsapp"),
      city: formData.get("city"),
      country: formData.get("country"),
    });
  } catch (error) {
    const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });

    if (error instanceof ProfileValidationError) {
      return { error: { ...envelope.error, fields: error.fields } };
    }

    return { error: envelope.error };
  }

  revalidatePath("/my-diaba-auto");
  return ok({ message: "Votre profil a été mis à jour." });
}

/** Déconnexion : supprime la session Supabase vérifiée côté serveur, puis revient à l'accueil. */
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // La redirection est garantie même si la session est déjà absente ou le service injoignable.
    }
  }

  revalidatePath("/", "layout");
  redirect("/");
}
