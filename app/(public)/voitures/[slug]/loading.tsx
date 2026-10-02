import { VehicleDetailSkeleton } from "@/components/public/CatalogueSkeleton";
import { fr } from "@/lib/i18n";

/** Squelette de chargement de la fiche véhicule (doc 05 §7). */
export default function LoadingVehicle() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-[#011D4F]">{fr.common.loading}</h1>
      <div className="mt-8">
        <VehicleDetailSkeleton />
      </div>
    </main>
  );
}