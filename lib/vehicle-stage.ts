/**
 * Étape de vie d'un véhicule dans le stock, pour l'écran de liste. Les quatre étapes sont disjointes :
 * un véhicule est vendu, en ligne, prêt, ou à compléter — jamais deux à la fois.
 *
 * - `online` : publié, ni archivé ni vendu.
 * - `ready` : hors ligne, avec photo principale publique ET prix standard actif (rien ne le retient).
 * - `incomplete` : hors ligne, il manque la photo ou le prix.
 * - `sold` : vendu.
 *
 * Mêmes définitions que l'accueil (`admin-worklist.repository`) : un compteur et sa liste ne doivent
 * jamais se contredire. Module neutre (aucun import) : le service et le repository s'y réfèrent sans
 * créer de cycle.
 */
export const VEHICLE_STAGES = ["online", "ready", "incomplete", "sold"] as const;

export type VehicleStage = (typeof VEHICLE_STAGES)[number];
