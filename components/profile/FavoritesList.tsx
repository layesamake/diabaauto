import Link from "next/link";
import { FavoriteButton } from "@/components/public/FavoriteButton";
import { CatalogueLink, EmptyState } from "@/components/public/EmptyState";
import { favoritesFr } from "@/lib/i18n/favorites.fr";

/**
 * Liste des favoris du client connecté (contrat lot 4 §Sous-agent A).
 *
 * Section autonome, consommée par `app/my-diaba-auto/page.tsx` (câblage par l'orchestrateur).
 *
 * Décision technique (non précisée par le contrat) : `repositories/favorite.repository.ts` n'a
 * accès qu'à `favorite_vehicles` (contrat §Sous-agent A : « Prisma, favorite_vehicles uniquement »)
 * et ne peut donc pas joindre les données catalogue (titre, image, statut de publication). Ce
 * composant reste décorrélé de leur source : il reçoit un tableau `items` déjà enrichi, `vehicle`
 * valant `null` quand le véhicule n'est plus public (vendu, archivé, dépublié) — l'orchestrateur
 * assemble `listOwnFavorites` avec une lecture catalogue lors du câblage dans
 * `app/my-diaba-auto/page.tsx` (contrat §3.4). Le retrait réutilise `FavoriteButton` en mode
 * « favori actif » : un clic retire la ligne sans dupliquer de logique de mutation.
 */
export type FavoritesListItem = {
  vehicleId: string;
  addedAt: Date;
  vehicle: {
    slug: string;
    title: string;
    brandName: string;
    modelName: string;
    year: number;
    imageUrl: string | null;
  } | null;
};

export function FavoritesList({ items }: { items: FavoritesListItem[] }) {
  return (
    <section aria-labelledby="favoris-liste" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="favoris-liste" className="text-lg font-semibold text-[#011D4F]">
        {favoritesFr.list.title}
      </h2>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={favoritesFr.list.emptyTitle}
            body={favoritesFr.list.emptyBody}
            action={<CatalogueLink label={favoritesFr.list.emptyCta} />}
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.vehicleId} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              {item.vehicle ? (
                <>
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-[#f4f7fb]">
                    {item.vehicle.imageUrl ? (
                      // Favoris : vignette simple, pas de logique de source de prix ni de catalogue ici.
                      <img
                        src={item.vehicle.imageUrl}
                        alt={item.vehicle.title}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <Link
                      href={`/voitures/${item.vehicle.slug}`}
                      className="text-sm font-semibold text-[#011D4F] hover:text-[#0354A3]"
                    >
                      {item.vehicle.title}
                    </Link>
                    <p className="text-xs text-slate-600">
                      {item.vehicle.brandName} · {item.vehicle.modelName} · {item.vehicle.year}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {favoritesFr.list.addedOn(item.addedAt.toLocaleDateString("fr-FR"))}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#95312a]">{favoritesFr.list.removedVehicleTitle}</p>
                  <p className="mt-1 text-xs text-slate-600">{favoritesFr.list.removedVehicleBody}</p>
                </div>
              )}

              <FavoriteButton
                vehicleId={item.vehicleId}
                isAuthenticated
                initialIsFavorite
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#011D4F] hover:border-[#0063DF]"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
