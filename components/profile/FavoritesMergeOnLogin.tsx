"use client";

/**
 * Fusionne une seule fois les favoris locaux (visiteur) dans le compte après connexion (T34,
 * contrat lot 4 §3.5). Rendu dans `CustomerDashboard` : au premier affichage de My Diaba Auto pour
 * un client connecté, les favoris éventuellement stockés localement sur cet appareil sont envoyés
 * au serveur (fusion idempotente), puis le stockage local est vidé pour ne pas les exposer au
 * prochain utilisateur de l'appareil. Composant invisible : aucun rendu, aucune erreur affichée (une
 * fusion échouée n'empêche jamais l'usage du tableau de bord — elle sera retentée à la prochaine
 * visite tant que `localStorage` n'a pas été vidé).
 */

import { useEffect, useRef } from "react";
import { mergeFavoritesAction } from "@/app/my-diaba-auto/favorites-actions";
import { clearLocalFavorites, readLocalFavorites } from "@/lib/favorites/local-store";

export function FavoritesMergeOnLogin() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    const localIds = readLocalFavorites();
    if (localIds.length === 0) {
      return;
    }

    mergeFavoritesAction(localIds)
      .then((result) => {
        if ("data" in result) {
          clearLocalFavorites();
        }
      })
      .catch(() => {
        // Échec silencieux : la fusion sera retentée à la prochaine visite (le stockage local
        // n'est vidé qu'en cas de succès confirmé par le serveur).
      });
  }, []);

  return null;
}
