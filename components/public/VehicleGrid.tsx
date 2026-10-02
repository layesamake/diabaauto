import type { CatalogueCard } from "@/services/catalogue.service";
import { VehicleCard } from "@/components/public/VehicleCard";

/**
 * Grille de cartes du catalogue (mobile first : 1 colonne, puis 2, puis 3).
 *
 * `favoriteState` (lot 4, intégration orchestrateur §3.2) est optionnel : une page qui ne le fournit
 * pas affiche simplement chaque carte en mode « non favori », jamais une erreur de rendu.
 */
export function VehicleGrid({
  vehicles,
  favoriteState,
}: {
  vehicles: CatalogueCard[];
  favoriteState?: { isAuthenticated: boolean; favoriteVehicleIds: ReadonlySet<string> };
}) {
  if (vehicles.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((vehicle) => (
        <li key={vehicle.id} className="h-full">
          <VehicleCard
            vehicle={vehicle}
            isAuthenticated={favoriteState?.isAuthenticated ?? false}
            isFavorite={favoriteState?.favoriteVehicleIds.has(vehicle.id) ?? false}
          />
        </li>
      ))}
    </ul>
  );
}
