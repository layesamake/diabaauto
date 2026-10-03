import type { ProfileStatus } from "@/services/identity.service";

/**
 * Onglets de la liste du personnel : ceux qui travaillent, et les autres.
 *
 * « Supprimer » un compte revient à le désactiver (réversible) : sans onglet, les comptes désactivés
 * s'accumulent dans la liste de ceux qui travaillent. Les comptes suspendus et désactivés vont dans
 * le même onglet « Hors service » ; leur statut précis reste affiché sur la ligne.
 */

export type StaffTab = "en-poste" | "hors-service" | "tous";

export const STAFF_TABS: readonly StaffTab[] = ["en-poste", "hors-service", "tous"];

export const STAFF_TAB_LABELS: Readonly<Record<StaffTab, string>> = {
  "en-poste": "En poste",
  "hors-service": "Hors service",
  tous: "Tous",
};

export const STAFF_TAB_EMPTY: Readonly<Record<StaffTab, string>> = {
  "en-poste": "Aucun compte actif.",
  "hors-service": "Aucun compte suspendu ou désactivé.",
  tous: "Aucun compte interne.",
};

export function parseStaffTab(value: unknown): StaffTab {
  return typeof value === "string" && (STAFF_TABS as readonly string[]).includes(value)
    ? (value as StaffTab)
    : "en-poste";
}

export function filterStaffByTab<T extends { status: ProfileStatus }>(accounts: readonly T[], tab: StaffTab): T[] {
  if (tab === "tous") return [...accounts];
  return accounts.filter((account) => (account.status === "ACTIVE") === (tab === "en-poste"));
}

export function countStaffByTab(accounts: readonly { status: ProfileStatus }[]): Record<StaffTab, number> {
  return {
    "en-poste": filterStaffByTab(accounts, "en-poste").length,
    "hors-service": filterStaffByTab(accounts, "hors-service").length,
    tous: accounts.length,
  };
}

export function staffTabHref(tab: StaffTab): string {
  return tab === "en-poste" ? "/admin/personnel" : `/admin/personnel?compte=${tab}`;
}
