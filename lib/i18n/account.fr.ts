/**
 * Libellés de l'écran « Mon compte » du back-office (changement de mot de passe).
 * Espace de noms distinct, comme les autres modules i18n : aucun libellé partagé n'est dupliqué.
 * Aucun de ces textes ne reprend une valeur saisie par l'utilisateur.
 */

export const accountFr = {
  title: "Mon compte",
  subtitle: "Sécurité de votre accès au back-office.",
  passwordSectionTitle: "Changer mon mot de passe",
  passwordSectionHint:
    "Votre mot de passe actuel est demandé pour confirmer que c'est bien vous : une session ouverte ne suffit pas.",
  currentPasswordLabel: "Mot de passe actuel",
  newPasswordLabel: "Nouveau mot de passe",
  confirmPasswordLabel: "Confirmation du nouveau mot de passe",
  submit: "Modifier le mot de passe",
  submitting: "Modification…",
  policyHint: "Le nouveau mot de passe doit contenir au moins 8 caractères.",
  recoveryHint:
    "Si vous ne connaissez plus votre mot de passe actuel, la récupération par e-mail doit être configurée côté Supabase (SMTP).",
  fieldMessages: {
    currentPassword: "Saisissez votre mot de passe actuel.",
    newPassword: "Le nouveau mot de passe doit contenir au moins 8 caractères.",
    confirmPassword: "Les deux mots de passe ne correspondent pas.",
  } satisfies Record<string, string>,
  accessDenied: "Cette page est réservée au personnel authentifié.",
  unauthenticated: "Votre session n'est plus valide. Reconnectez-vous.",
} as const;

export type AccountMessages = typeof accountFr;
