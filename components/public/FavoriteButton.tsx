"use client";

/**
 * Bouton favori autonome (contrat lot 4 §Sous-agent A).
 *
 * Composant client indépendant : il ne fait aucun appel serveur à son montage (`isAuthenticated`
 * et, pour un client connecté, `initialIsFavorite` sont fournis par l'appelant). Un visiteur lit et
 * écrit `localStorage` (`lib/favorites/local-store.ts`) ; un client connecté appelle la Server
 * Action `toggleFavoriteAction`. Ce composant n'est PAS câblé dans `VehicleCard.tsx` ni la fiche
 * véhicule par ce sous-agent : l'orchestrateur l'intègre après coup (contrat §Sous-agent A).
 */

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics/events";
import { toggleFavoriteAction } from "@/app/my-diaba-auto/favorites-actions";
import { addLocalFavorite, isLocalFavorite, removeLocalFavorite } from "@/lib/favorites/local-store";
import { favoritesFr } from "@/lib/i18n/favorites.fr";

export type FavoriteButtonProps = {
  vehicleId: string;
  isAuthenticated: boolean;
  /** État initial connu côté serveur pour un client connecté (ignoré si `isAuthenticated` est faux). */
  initialIsFavorite?: boolean;
  className?: string;
};

export function FavoriteButton({
  vehicleId,
  isAuthenticated,
  initialIsFavorite = false,
  className,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(isAuthenticated ? initialIsFavorite : false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Lecture locale après montage uniquement : jamais de valeur serveur devinée côté client, et
  // aucune divergence d'hydratation (le rendu initial reste neutre pour un visiteur).
  useEffect(() => {
    if (!isAuthenticated) {
      setIsFavorite(isLocalFavorite(vehicleId));
    }
  }, [isAuthenticated, vehicleId]);

  async function handleClick() {
    if (pending) {
      return;
    }

    const nextFavorite = !isFavorite;
    setPending(true);
    setError("");

    if (!isAuthenticated) {
      if (nextFavorite) {
        addLocalFavorite(vehicleId);
      } else {
        removeLocalFavorite(vehicleId);
      }
      setIsFavorite(nextFavorite);
      if (nextFavorite) trackEvent("favorite_add", { vehicle_id: vehicleId });
      setPending(false);
      return;
    }

    try {
      const result = await toggleFavoriteAction(vehicleId, nextFavorite);
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      setIsFavorite(nextFavorite);
      if (nextFavorite) trackEvent("favorite_add", { vehicle_id: vehicleId });
    } catch {
      setError(favoritesFr.button.genericError);
    } finally {
      setPending(false);
    }
  }

  const label = isFavorite ? favoritesFr.button.remove : favoritesFr.button.add;
  const pendingLabel = isFavorite ? favoritesFr.button.pendingRemove : favoritesFr.button.pendingAdd;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={isFavorite}
        aria-busy={pending}
        aria-label={label}
        title={label}
        className={
          className ??
          "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#011D4F] hover:border-[#0063DF] disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-[#95312a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
