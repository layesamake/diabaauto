import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Politique et validation du **changement de mot de passe d'un membre du personnel déjà authentifié**
 * (écran « Mon compte » du back-office).
 *
 * Différence avec `app/(auth)/actions.ts` : ce parcours ne passe ni par un e-mail de récupération ni
 * par un lien signé. Il exige donc la re-authentification par le mot de passe actuel — Supabase ne
 * vérifie pas l'ancien mot de passe dans `updateUser`, c'est le service qui le fait (voir
 * `app/admin/compte/actions.ts`).
 *
 * Module volontairement **pur** (aucune dépendance à Next ni à Supabase) pour être testable seul.
 * Aucune valeur de mot de passe n'est jamais journalisée, renvoyée ni incluse dans un message.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_POLICY_MESSAGE = `Le nouveau mot de passe doit contenir entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères.`;
export const PASSWORD_MISMATCH_MESSAGE = "Les deux mots de passe ne correspondent pas.";
export const CURRENT_PASSWORD_REQUIRED_MESSAGE = "Le mot de passe actuel est obligatoire.";

const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const currentPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

export const PASSWORD_CHANGE_FIELDS = ["currentPassword", "newPassword", "confirmPassword"] as const;

const passwordChangeSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .strict();

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
};

/** Erreur de validation : seuls les NOMS de champs sont exposés, jamais les valeurs saisies. */
export class PasswordChangeValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[], message = "Entrée invalide.") {
    super("VALIDATION", message);
    this.name = "PasswordChangeValidationError";
    this.fields = fields;
  }
}

/** Seuls les champs connus sont lus : tout champ privilégié envoyé par le navigateur est ignoré. */
function readKnownFields(formData: FormData): Record<string, unknown> {
  return {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  };
}

function fieldNames(issue: { path: PropertyKey[]; keys?: string[] }): string[] {
  if (Array.isArray(issue.keys) && issue.keys.length > 0) {
    return issue.keys;
  }

  return [String(issue.path[0] ?? "unknown")];
}

export function issueFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.flatMap((issue) => fieldNames(issue)))].sort();
}

/**
 * Valide le formulaire et renvoie le couple (mot de passe actuel, nouveau mot de passe).
 * Le champ de confirmation n'est jamais renvoyé : il n'a servi qu'au contrôle.
 */
export function parsePasswordChangeInput(formData: FormData): PasswordChangeInput {
  const parsed = passwordChangeSchema.safeParse(readKnownFields(formData));
  if (!parsed.success) {
    throw new PasswordChangeValidationError(issueFields(parsed.error), PASSWORD_POLICY_MESSAGE);
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (currentPassword.trim().length === 0) {
    throw new PasswordChangeValidationError(["currentPassword"], CURRENT_PASSWORD_REQUIRED_MESSAGE);
  }

  if (newPassword !== confirmPassword) {
    throw new PasswordChangeValidationError(["confirmPassword"], PASSWORD_MISMATCH_MESSAGE);
  }

  return { currentPassword, newPassword };
}
