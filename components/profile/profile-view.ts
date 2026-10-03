import type { Actor } from "@/services/identity.service";
import type { ResellerStatus } from "@/services/pricing.service";

/**
 * Logique de présentation de My Diaba Auto, isolée du JSX pour être testée sans DOM.
 *
 * Contrainte éditoriale (CLAUDE.md §8) : aucun numéro, aucune adresse, aucun témoignage et aucune
 * promesse commerciale ne sont inventés. Les libellés décrivent uniquement l'état enregistré.
 */

export type ResellerStatusView = {
  label: string;
  description: string;
};

export const resellerStatusLabels: Record<ResellerStatus, ResellerStatusView> = {
  NOT_APPLICABLE: {
    label: "Compte Standard",
    description: "Aucune demande de statut Revendeur n'est enregistrée pour ce compte.",
  },
  PENDING: {
    label: "Demande en cours d'examen",
    description: "Votre demande de statut Revendeur a été enregistrée et attend une décision de Diaba Auto.",
  },
  APPROVED: {
    label: "Revendeur approuvé",
    description: "Le statut Revendeur approuvé est enregistré sur ce compte.",
  },
  REJECTED: {
    label: "Demande refusée",
    description: "La demande de statut Revendeur n'a pas été acceptée. Le compte reste un compte Standard.",
  },
  SUSPENDED: {
    label: "Statut Revendeur suspendu",
    description: "Le statut Revendeur est suspendu. Les informations restent consultables en lecture seule.",
  },
};

export const unknownResellerStatus: ResellerStatusView = {
  label: "Statut Revendeur indisponible",
  description: "Le statut enregistré ne peut pas être affiché pour le moment.",
};

/** Ne devine jamais un statut : toute valeur non reconnue retombe sur un libellé neutre. */
export function describeResellerStatus(status: string): ResellerStatusView {
  return resellerStatusLabels[status as ResellerStatus] ?? unknownResellerStatus;
}

/** États d'affichage de l'espace privé, dérivés de l'acteur serveur. */
export type MyDiabaAutoMode = "visitor" | "suspended" | "customer" | "staff";

export function resolveMyDiabaAutoMode(actor: Actor): MyDiabaAutoMode {
  switch (actor.kind) {
    case "visitor":
      return "visitor";
    case "suspended":
      return "suspended";
    case "customer":
      return "customer";
    default:
      return "staff";
  }
}

/** Nom d'affichage : jamais un identifiant technique, toujours les champs personnels. */
export function profileDisplayName(profile: { firstName: string; lastName: string }): string {
  const name = `${profile.firstName} ${profile.lastName}`.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : "Profil client";
}

export type ProfileFieldView = {
  id: "firstName" | "lastName" | "phone" | "whatsapp" | "city" | "country";
  label: string;
  value: string | null;
};

/** Affiche les champs personnels dans un ordre stable, avec la mention « Non renseigné ». */
export function profileFields(profile: {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string | null;
}): ProfileFieldView[] {
  return [
    { id: "firstName", label: "Prénom", value: profile.firstName || null },
    { id: "lastName", label: "Nom", value: profile.lastName || null },
    { id: "phone", label: "Téléphone", value: profile.phone },
    { id: "whatsapp", label: "WhatsApp", value: profile.whatsapp },
    { id: "city", label: "Ville", value: profile.city },
    { id: "country", label: "Pays", value: profile.country },
  ];
}

export const EMPTY_FIELD_LABEL = "Non renseigné";

export function displayFieldValue(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : EMPTY_FIELD_LABEL;
}
