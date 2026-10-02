/**
 * Skeletons de chargement (doc 05 §7 : « loading avec skeletons »).
 *
 * Purement décoratifs : `aria-hidden` évite de les annoncer aux lecteurs d'écran pendant que la
 * page réelle se charge.
 */
export function CatalogueCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="aspect-[4/3] bg-[#f4f7fb]" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-4 w-24 rounded bg-[#f4f7fb]" />
        <div className="h-5 w-3/4 rounded bg-[#f4f7fb]" />
        <div className="h-4 w-1/2 rounded bg-[#f4f7fb]" />
        <div className="h-6 w-1/3 rounded bg-[#f4f7fb]" />
      </div>
    </div>
  );
}

export function CatalogueSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <CatalogueCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function VehicleDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-[#f4f7fb]" />
      <div className="h-7 w-2/3 animate-pulse rounded bg-[#f4f7fb]" />
      <div className="h-5 w-1/3 animate-pulse rounded bg-[#f4f7fb]" />
      <div className="h-24 animate-pulse rounded-2xl bg-[#f4f7fb]" />
    </div>
  );
}