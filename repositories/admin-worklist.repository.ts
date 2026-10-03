import { prisma } from "@/lib/prisma/client";

/**
 * Comptages de la liste « À traiter » du back-office.
 *
 * Chaque nombre répond à une question qu'un commercial se pose le matin, et à aucune autre. Tous
 * sont comptés EN BASE, en parallèle : aucune liste n'est rapatriée pour être mesurée côté serveur,
 * et le coût ne grandit pas avec le catalogue.
 *
 * Les conditions reprennent exactement celles de la publication (`publicationGaps`, doc 03 §7) :
 * marque, modèle, année, état et localisation sont NOT NULL en base, donc seuls l'image principale
 * publique et le prix STANDARD actif peuvent manquer.
 */

export type WorklistCounts = {
  /** Demandes sur mesure encore à l'état reçu : personne n'a répondu. */
  requestsReceived: number;
  /** Demandes de statut revendeur en attente de décision. */
  resellerApplicationsPending: number;
  /** Prospects dont la date de relance est arrivée (ou dépassée). */
  leadsToFollowUp: number;
  /** Prospects nouveaux que personne ne suit. */
  leadsUnassigned: number;
  /** Véhicules complets mais encore hors catalogue : rien ne les retient. */
  vehiclesReadyToPublish: number;
  /** Véhicules en ligne sans image principale publique : ils s'affichent vides. */
  vehiclesPublishedWithoutImage: number;
};

/** Un prospect clos ne se relance pas. */
const OPEN_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATION"] as const;

/** Image principale publique — la condition exacte que vérifie la publication. */
const PRIMARY_PUBLIC_IMAGE = {
  mediaType: "IMAGE",
  isPrimary: true,
  visibility: "PUBLIC",
} as const;

const ACTIVE_STANDARD_PRICE = { pricingProfile: "STANDARD", isActive: true } as const;

export async function countWorklist(now: Date = new Date()): Promise<WorklistCounts> {
  const [
    requestsReceived,
    resellerApplicationsPending,
    leadsToFollowUp,
    leadsUnassigned,
    vehiclesReadyToPublish,
    vehiclesPublishedWithoutImage,
  ] = await Promise.all([
    prisma.customVehicleRequest.count({ where: { status: "RECEIVED" } }),

    prisma.resellerApplication.count({ where: { status: "PENDING" } }),

    prisma.lead.count({
      where: { nextFollowUpAt: { lte: now }, status: { in: [...OPEN_LEAD_STATUSES] } },
    }),

    prisma.lead.count({ where: { status: "NEW", assignedSalespersonId: null } }),

    prisma.vehicle.count({
      where: {
        isPublished: false,
        archivedAt: null,
        commercialStatus: { not: "SOLD" },
        media: { some: PRIMARY_PUBLIC_IMAGE },
        prices: { some: ACTIVE_STANDARD_PRICE },
      },
    }),

    prisma.vehicle.count({
      where: { isPublished: true, archivedAt: null, media: { none: PRIMARY_PUBLIC_IMAGE } },
    }),
  ]);

  return {
    requestsReceived,
    resellerApplicationsPending,
    leadsToFollowUp,
    leadsUnassigned,
    vehiclesReadyToPublish,
    vehiclesPublishedWithoutImage,
  };
}
