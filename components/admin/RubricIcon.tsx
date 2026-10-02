import type { ReactNode } from "react";
import type { RubricIconName } from "@/components/admin/rubric-icons";

/**
 * Icônes des rubriques du back-office, en SVG inline.
 *
 * Pourquoi inline et non une bibliothèque : le projet n'embarque aucune bibliothèque d'icônes, et
 * sept pictogrammes ne justifient pas une dépendance supplémentaire (poids de bundle, surface de
 * mise à jour, licence à suivre). Le tracé reste donc maîtrisé ici.
 *
 * Accessibilité : ces icônes sont **décoratives**, elles doublent toujours un titre écrit. Elles sont
 * donc `aria-hidden` et `focusable="false"` — un lecteur d'écran annonce « Véhicules », pas
 * « image ». La couleur est héritée (`currentColor`) : le contraste se règle par le texte du parent.
 *
 * Le type `Record<RubricIconName, …>` impose qu'aucune icône déclarée dans `rubric-icons.ts` ne
 * reste sans tracé : en ajouter une sans dessin fait échouer `tsc`.
 */

/** Tracés sur une grille 24×24, chaque clé de `RubricIconName` ayant le sien. */
const PATHS: Record<RubricIconName, ReactNode> = {
  // Un véhicule : caisse + cabine + deux roues.
  vehicules: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10.5h3.6L21 14v2h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </>
  ),
  // Un référentiel : catalogue en grille.
  referentiels: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // La prospection : une cible.
  prospects: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
    </>
  ),
  // Une demande déposée : une bulle de message.
  demandes: (
    <>
      <path d="M20 14.5a2 2 0 0 1-2 2H8.5L4 20.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
      <path d="M8 8.5h8M8 12.5h5" />
    </>
  ),
  // Les clients : deux personnes.
  clients: (
    <>
      <path d="M15.5 20.2v-1.6a3.6 3.6 0 0 0-3.6-3.6H7.6A3.6 3.6 0 0 0 4 18.6v1.6" />
      <circle cx="9.75" cy="7.8" r="3.6" />
      <path d="M20 20.2v-1.6a3.6 3.6 0 0 0-2.7-3.5M15.3 4.4a3.6 3.6 0 0 1 0 6.8" />
    </>
  ),
  // Les revendeurs : une boutique.
  revendeurs: (
    <>
      <path d="M4.5 10.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-8.5" />
      <path d="M3 6.5 4.6 3h14.8L21 6.5a2.5 2.5 0 0 1-4.5 1.4A2.5 2.5 0 0 1 12 9.3 2.5 2.5 0 0 1 7.5 7.9 2.5 2.5 0 0 1 3 6.5z" />
      <path d="M10 20v-4.8h4V20" />
    </>
  ),
  // Les commandes : un colis.
  commandes: (
    <>
      <path d="M21 8.4 12 3.4 3 8.4v7.2l9 5 9-5z" />
      <path d="M3 8.4l9 5 9-5" />
      <path d="M12 13.4v7.2" />
    </>
  ),
  // Mon compte : un cadenas.
  compte: (
    <>
      <rect x="4" y="10" width="16" height="10.5" rx="2" />
      <path d="M8 10V7.2a4 4 0 0 1 8 0V10" />
      <path d="M12 14.2v2.6" />
    </>
  ),
};

export function RubricIcon({
  name,
  className,
}: {
  name: RubricIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
