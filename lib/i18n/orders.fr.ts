/**
 * Libellés de l'écran « Mes commandes » (My Diaba Auto, contrat lot 6 §6).
 *
 * Espace de noms dédié, sur le même patron que `lib/i18n/favorites.fr.ts` et
 * `lib/i18n/saved-searches.fr.ts` : les identifiants de code restent en anglais, seules les valeurs
 * sont en français. Aucune règle métier ici.
 *
 * Les libellés d'énumération sont typés contre la surface **gelée** de `services/order.service.ts`
 * (`OrderStatus`) : un statut ajouté sans libellé fait échouer le typage au lieu de laisser une
 * valeur manquante à l'écran.
 */
import type { OrderStatus } from "@/services/order.service";

export const ordersFr = {
  page: {
    title: "Mes commandes",
    subtitle: "Suivi de vos commandes confirmées et des prix convenus.",
    backToAccount: "Retour à My Diaba Auto",
  },

  list: {
    title: "Mes commandes",
    caption: "Liste de vos commandes",
    count: (count: number) => (count === 1 ? "1 commande" : `${count} commandes`),
    emptyTitle: "Aucune commande",
    emptyBody:
      "Vous n'avez aucune commande pour le moment. Vos commandes confirmées apparaîtront ici.",
    unavailableTitle: "Commandes indisponibles",
    unavailableBody:
      "Vos commandes n'ont pas pu être chargées pour le moment. Réessayez dans quelques instants.",
    /** Véhicule sorti du catalogue public : la référence de commande reste, le titre manque. */
    unknownVehicle: "Véhicule non communiqué au catalogue",
    columns: {
      reference: "Référence",
      vehicle: "Véhicule",
      status: "Statut",
      price: "Prix convenu",
      dates: "Dates",
    },
    priceTransport: "Transport",
    orderedOn: (date: string) => `Commandée le ${date}`,
    estimatedArrivalOn: (date: string) => `Arrivée estimée le ${date}`,
    deliveredOn: (date: string) => `Livrée le ${date}`,
  },

  /** Libellés des statuts de commande (contrat lot 6 §2.3, machine `orderTransitions`). */
  status: {
    CONFIRMED: "Confirmée",
    PROCESSING: "En traitement",
    IN_TRANSIT: "En transit",
    ARRIVED: "Arrivée",
    DELIVERED: "Livrée",
    CANCELLED: "Annulée",
  } satisfies Record<OrderStatus, string>,
} as const;

export type OrdersMessages = typeof ordersFr;
