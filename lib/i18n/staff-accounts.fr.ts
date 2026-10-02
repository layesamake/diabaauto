/**
 * Libellés de l'écran « Personnel » du back-office (contrat lot 7).
 *
 * Fichier dédié : il n'est PAS fusionné dans `lib/i18n/index.ts` par ce module (l'intégration est
 * réalisée par l'orchestrateur). L'écran importe directement `staffAccountsFr` depuis ce fichier.
 *
 * Ce module ne contient AUCUNE règle métier : il ne fait que nommer les valeurs d'énumération
 * existantes du schéma figé (`ProfileStatus`, doc 03) et porter les textes. Aucune valeur
 * d'énumération n'est inventée, aucun texte n'évoque un secret (le mot de passe n'est jamais
 * affiché, jamais journalisé).
 */

import type { ProfileStatus } from "@/services/identity.service";

/** Statuts de compte du schéma figé (`ProfileStatus`, doc 03 §3) — aucune valeur inventée. */
export const staffAccountStatusLabels: Readonly<Record<ProfileStatus, string>> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  DISABLED: "Désactivé",
};

export function staffAccountStatusLabel(status: ProfileStatus): string {
  return staffAccountStatusLabels[status] ?? "Statut inconnu";
}

export const staffAccountsFr = {
  listTitle: "Personnel",
  listSubtitle:
    "Comptes internes du back-office : ajout, modification de la fonction et des rôles, activation et désactivation réversibles.",
  accessDeniedSubtitle: "Accès réservé au personnel habilité.",

  tableCaption: "Comptes internes du personnel",
  countLabel: (count: number): string => `${count} compte(s).`,
  empty: "Aucun compte interne n'est enregistré.",

  table: {
    name: "Nom",
    email: "Adresse e-mail",
    jobTitle: "Fonction",
    roles: "Rôles",
    status: "Statut",
    manage: "Gérer",
  },

  roles: {
    none: "Aucun rôle",
  },

  create: {
    title: "Ajouter un compte",
    intro:
      "Le compte est créé confirmé : aucun e-mail n'est envoyé. Communiquez le mot de passe initial au membre, " +
      "qui le changera lui-même depuis « Mon compte ».",
    email: "Adresse e-mail",
    firstName: "Prénom",
    lastName: "Nom",
    jobTitle: "Fonction",
    jobTitleHint: "Facultatif.",
    roles: "Rôles",
    rolesHint: "Sélectionnez au moins un rôle.",
    password: "Mot de passe initial",
    passwordHint:
      "8 caractères minimum. À communiquer au membre : il le changera depuis « Mon compte ».",
    confirmPassword: "Confirmation du mot de passe initial",
    submit: "Créer le compte",
    pending: "Création…",
  },

  edit: {
    title: "Modifier",
    firstName: "Prénom",
    lastName: "Nom",
    jobTitle: "Fonction",
    jobTitleHint: "Facultatif : laissé vide, ce champ est effacé.",
    roles: "Rôles",
    rolesHint: "Au moins un rôle est requis.",
    submit: "Enregistrer",
    pending: "Enregistrement…",
  },

  status: {
    title: "Statut du compte",
    reasonLabel: "Motif du changement de statut",
    reasonHint:
      "Obligatoire : chaque changement de statut est consigné au journal d'audit avec son motif.",
    deactivate: "Désactiver",
    reactivate: "Réactiver",
    pending: "Application…",
    disabledHint:
      "Un compte désactivé perd immédiatement l'accès. L'opération est réversible : le compte peut être réactivé à tout moment.",
  },

  /** Messages localisés d'un champ (noms de champs uniquement — jamais une valeur saisie). */
  fieldMessages: {
    email: "Saisissez une adresse e-mail valide.",
    firstName: "Le prénom est obligatoire (120 caractères maximum).",
    lastName: "Le nom est obligatoire (120 caractères maximum).",
    jobTitle: "La fonction ne peut pas dépasser 120 caractères.",
    roleCodes: "Sélectionnez au moins un rôle valide.",
    password: "Le mot de passe doit contenir entre 8 et 200 caractères.",
    confirmPassword: "Les deux mots de passe ne correspondent pas.",
    staffId: "Ce compte est introuvable.",
    status: "Statut invalide.",
    reason: "Un motif est obligatoire pour changer le statut d'un compte.",
  } as Record<string, string>,

  messages: {
    createSuccess: "Compte créé. Communiquez le mot de passe initial au membre.",
    updateSuccess: "Compte modifié.",
    statusSuccess: "Statut du compte mis à jour.",
    genericError: "L'opération n'a pas pu aboutir. Réessayez.",
  },

  unavailable: {
    listTitle: "Liste indisponible",
    listBody:
      "La liste des comptes du personnel n'a pas pu être chargée. Aucune donnée n'est affichée ; réessayez " +
      "après rétablissement du service de données.",
  },
} as const;

export type StaffAccountsMessages = typeof staffAccountsFr;
