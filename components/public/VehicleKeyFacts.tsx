import type { ReactNode } from "react";
import type { CatalogueDetail } from "@/services/catalogue.service";
import { formatMileage, fr } from "@/lib/i18n";

/**
 * « L'essentiel » d'une fiche : quatre à cinq points clés avec pictogramme, lus d'un coup d'œil
 * (année, kilométrage, énergie, boîte, carrosserie). Les mêmes données figurent dans la liste
 * détaillée plus bas ; ici elles sont mises en avant, pas dupliquées pour un autre usage.
 *
 * Icônes en SVG inline (aucune dépendance), décoratives donc `aria-hidden` : le libellé écrit porte
 * le sens. Un point sans valeur (kilométrage absent) n'est pas affiché, jamais de case vide.
 */

const ICONS: Record<string, ReactNode> = {
  year: <path d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />,
  mileage: (
    <>
      <path d="M4 18a8 8 0 0 1 16 0" />
      <path d="M12 18l4-5" />
      <circle cx="12" cy="18" r="1.2" />
    </>
  ),
  fuel: (
    <>
      <path d="M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
      <path d="M4 21h11" />
      <path d="M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.8 1.8 0 0 0 3.6 0V8l-2.4-2.4" />
      <path d="M7 7h5" />
    </>
  ),
  transmission: (
    <>
      <circle cx="7" cy="6" r="1.6" />
      <circle cx="17" cy="6" r="1.6" />
      <circle cx="7" cy="18" r="1.6" />
      <path d="M7 7.6v8.8M17 7.6V12a2 2 0 0 1-2 2H7" />
    </>
  ),
  body: (
    <>
      <path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v4h-2" />
      <path d="M5 17H3v-4h18" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
  condition: (
    <>
      <path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5L12 14.8 7.5 16.7l.9-5L4.8 8.2l5-.7z" />
    </>
  ),
};

type Fact = { icon: keyof typeof ICONS; label: string; value: string };

export function VehicleKeyFacts({ vehicle }: { vehicle: CatalogueDetail }) {
  const facts: Fact[] = [
    { icon: "year", label: fr.common.year, value: String(vehicle.year) },
    { icon: "condition", label: fr.catalogue.conditionLabel, value: fr.labels.condition[vehicle.condition] },
  ];

  if (vehicle.mileage !== null) {
    facts.splice(1, 0, { icon: "mileage", label: fr.common.mileage, value: formatMileage(vehicle.mileage) });
  }
  if (vehicle.fuelTypeName) {
    facts.push({ icon: "fuel", label: fr.catalogue.fuelLabel, value: vehicle.fuelTypeName });
  }
  if (vehicle.transmissionTypeName) {
    facts.push({ icon: "transmission", label: fr.catalogue.transmissionLabel, value: vehicle.transmissionTypeName });
  }
  if (vehicle.bodyTypeName) {
    facts.push({ icon: "body", label: fr.catalogue.bodyLabel, value: vehicle.bodyTypeName });
  }

  return (
    <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
      {facts.map((fact) => (
        <li
          key={fact.label}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            className="h-6 w-6 shrink-0 text-[#0063DF]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[fact.icon]}
          </svg>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{fact.label}</p>
            <p className="truncate text-sm font-semibold text-[#011D4F]" title={fact.value}>
              {fact.value}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
