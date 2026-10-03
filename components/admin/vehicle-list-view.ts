import type { VehicleStage } from "@/lib/vehicle-stage";
import type { VehicleStageCounts } from "@/services/vehicle.service";

/**
 * Onglets de la liste des véhicules : le vocabulaire de l'URL et de l'écran, rien d'autre.
 *
 * Le paramètre `?etat=` est en français (partageable, lisible dans un message) ; il se traduit en
 * étape métier (`VehicleStage`). Une valeur inconnue retombe sur « Tous », jamais sur une erreur.
 */

export type VehicleTab = "tous" | "en-ligne" | "pret" | "a-completer" | "vendus";

export const VEHICLE_TABS: readonly VehicleTab[] = ["tous", "en-ligne", "pret", "a-completer", "vendus"];

export const VEHICLE_TAB_LABELS: Readonly<Record<VehicleTab, string>> = {
  tous: "Tous",
  "en-ligne": "En ligne",
  pret: "Prêts à publier",
  "a-completer": "À compléter",
  vendus: "Vendus",
};

export const VEHICLE_TAB_EMPTY: Readonly<Record<VehicleTab, string>> = {
  tous: "Aucun véhicule dans le stock.",
  "en-ligne": "Aucun véhicule en ligne.",
  pret: "Aucun véhicule n'attend sa mise en ligne.",
  "a-completer": "Rien à compléter : chaque véhicule hors ligne a sa photo et son prix.",
  vendus: "Aucun véhicule vendu.",
};

const STAGE_OF_TAB: Readonly<Record<Exclude<VehicleTab, "tous">, VehicleStage>> = {
  "en-ligne": "online",
  pret: "ready",
  "a-completer": "incomplete",
  vendus: "sold",
};

export function parseVehicleTab(value: unknown): VehicleTab {
  return typeof value === "string" && (VEHICLE_TABS as readonly string[]).includes(value)
    ? (value as VehicleTab)
    : "tous";
}

/** Étape métier de l'onglet ; `undefined` pour « Tous » (aucun filtre d'étape). */
export function stageOfTab(tab: VehicleTab): VehicleStage | undefined {
  return tab === "tous" ? undefined : STAGE_OF_TAB[tab];
}

export function countOfTab(counts: VehicleStageCounts, tab: VehicleTab): number {
  const stage = stageOfTab(tab);
  return stage ? counts[stage] : counts.all;
}

/** Lien d'un onglet, en gardant la recherche. « Tous » sans recherche donne l'adresse nue. */
export function vehicleTabHref(tab: VehicleTab, search: string, page?: number): string {
  const query = new URLSearchParams();
  if (tab !== "tous") query.set("etat", tab);
  if (search) query.set("recherche", search);
  if (page && page > 1) query.set("page", String(page));
  const rendered = query.toString();

  return rendered ? `/admin/vehicules?${rendered}` : "/admin/vehicules";
}
