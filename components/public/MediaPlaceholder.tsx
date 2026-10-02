import { fr } from "@/lib/i18n";

/**
 * Repli visuel propre quand aucun média public n'est disponible (contrat §B.2).
 *
 * Aucune image n'est inventée et aucun lien vers un média privé n'est produit : le repli est
 * purement décoratif et annoncé aux lecteurs d'écran.
 */
export function MediaPlaceholder({
  label = fr.common.noImage,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex items-center justify-center bg-[#f4f7fb] px-4 text-center text-sm text-[#5a6577] ${className}`}
    >
      <span>{label}</span>
    </div>
  );
}