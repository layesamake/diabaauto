import type { CatalogueCard, CatalogueDetail } from "@/services/catalogue.service";
import { fr } from "@/lib/i18n";

/**
 * Badges d'état d'un véhicule (contrat §3.2 : `RESERVED` reste listé avec un badge « Réservé »,
 * `SOLD` n'apparaît qu'avec `availability = all` et porte le badge « Vendu »).
 *
 * Aucune règle métier n'est recalculée : les libellés sont dérivés des énumérations du service.
 */
export type BadgeTone = "brand" | "neutral" | "success" | "warning" | "danger";

export type Badge = { label: string; tone: BadgeTone };

const TONE_CLASS: Record<BadgeTone, string> = {
  brand: "bg-[#e6f0ff] text-[#0354A3]",
  neutral: "bg-[#f4f7fb] text-[#3b4757]",
  success: "bg-[#e7f6ec] text-[#1a6b38]",
  warning: "bg-[#fff4e5] text-[#8a4b00]",
  danger: "bg-[#fdecea] text-[#95312a]",
};

export function StatusBadges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <li
          key={`${badge.tone}-${badge.label}`}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASS[badge.tone]}`}
        >
          {badge.label}
        </li>
      ))}
    </ul>
  );
}

/** Badges d'une carte de catalogue : disponibilité commerciale, état, localisation, tarif revendeur. */
export function cardBadges(vehicle: CatalogueCard): Badge[] {
  const badges: Badge[] = [];

  if (vehicle.commercialStatus === "RESERVED") {
    badges.push({ label: fr.labels.commercialStatus.RESERVED, tone: "warning" });
  }

  if (vehicle.commercialStatus === "SOLD") {
    badges.push({ label: fr.labels.commercialStatus.SOLD, tone: "danger" });
  }

  badges.push({ label: fr.labels.condition[vehicle.condition], tone: "neutral" });
  badges.push({ label: fr.labels.logisticsLocation[vehicle.logisticsLocation], tone: "brand" });

  if (vehicle.price?.priceType === "RESELLER") {
    badges.push({ label: fr.vehicle.priceReseller, tone: "brand" });
  }

  return badges;
}

/**
 * Badges de la fiche : carte + éligibilité import Sénégal.
 *
 * Seule une éligibilité CONFIRMÉE (`ELIGIBLE`) devient un badge, rassurant. « Non vérifiée »,
 * « à vérifier » ou « non éligible » ne s'affichent pas en tête de fiche : un badge d'alerte sur une
 * donnée purement administrative inquiéterait le visiteur sans l'informer. Le détail reste dans la
 * section Éligibilité, qui n'apparaît elle-même que lorsqu'elle dit quelque chose d'utile.
 */
export function detailBadges(vehicle: CatalogueDetail): Badge[] {
  const badges = cardBadges(vehicle);

  if (vehicle.eligibilityStatus === "ELIGIBLE") {
    badges.push({ label: fr.labels.eligibilityStatus.ELIGIBLE, tone: "success" });
  }

  return badges;
}