/**
 * Aides partagées par les écrans d'authentification : normalisation des chemins de redirection,
 * lecture des paramètres d'URL et traduction des codes d'erreur renvoyés par la route de callback.
 *
 * Aucun chemin fourni par le navigateur n'est utilisé tel quel : toute valeur non interne retombe
 * sur la valeur de repli (protection contre la redirection ouverte et contre l'injection de chemin).
 */

/** Destination par défaut après une connexion ou une réinitialisation réussie. */
export const AFTER_LOGIN_PATH = "/my-diaba-auto";

/** Paramètre de reprise utilisé par le middleware (`/connexion?suivant=...`) et par la route de callback. */
export const NEXT_PATH_PARAM = "suivant";

const CONTROL_CHARACTERS_END = 0x20;
const DELETE_CHARACTER = 0x7f;

/**
 * Chemin interne uniquement : refuse les URL absolues, les URL protocol-relative (`//hote`),
 * les antislashs (`/\hote`) et les caractères de contrôle.
 */
export function internalPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const candidate = value.trim();
  if (candidate.length === 0 || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  if (candidate.includes("\\")) {
    return fallback;
  }

  for (const character of candidate) {
    const code = character.codePointAt(0) ?? 0;
    if (code < CONTROL_CHARACTERS_END || code === DELETE_CHARACTER) {
      return fallback;
    }
  }

  return candidate;
}

/** `searchParams` peut renvoyer un tableau de valeurs : seule la première valeur textuelle est retenue. */
export function textParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return undefined;
}

/**
 * Messages d'échec transmis par la route de callback.
 * Aucun de ces messages ne révèle l'existence d'un compte : ils ne parlent que du lien et du service.
 */
export function authErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case "lien-invalide":
      return "Ce lien est invalide ou expiré. Demandez un nouveau lien ou reconnectez-vous.";
    case "indisponible":
      return "Le service d'authentification n'est pas disponible pour le moment. Réessayez plus tard.";
    case "session":
      return "Votre session n'a pas pu être ouverte. Reconnectez-vous.";
    default:
      return null;
  }
}
