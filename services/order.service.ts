import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createOrderRepository } from "@/repositories/order.repository";
import { requireCustomer, requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import {
  canTransitionOrderStatus,
  canTransitionReservationStatus,
  canTransitionVehicleStatus,
  orderTransitions,
  type LeadStatus,
  type OrderStatus,
  type ReservationStatus,
  type VehicleCommercialStatus,
} from "@/services/transitions.service";
import type { AuditWriter } from "@/services/vehicle.service";
import { formatOrderReference } from "@/lib/order-reference";

/**
 * Commandes et suivi logistique (doc 03 §13 et §15, doc 08 §7, doc 09 §7 et §10,
 * doc 10 §5/§8/§10, contrat lot 6 §3.3, §3.4, §3.5 et §5).
 *
 * Règles tenues par ce module :
 * - **autorisation** : `order.create` pour créer, `order.update` pour les transitions et le suivi
 *   logistique, `order.view` pour les lectures du personnel ; `listOwnOrders` exige un client
 *   (`requireCustomer`) et ne sert **jamais** la commande d'un autre (contrat §6, doc 14 §4) ;
 *   aucune permission nouvelle n'est inventée (T20) ; le refus est **neutre** ;
 * - **vente atomique** (doc 09 §10, BR-104, doc 14 §5) : `createOrder` réalise, dans **une seule**
 *   transaction, la création de la commande, le passage du véhicule à `SOLD`, l'audit et la bascule
 *   du prospect rattaché à `ORDER_CONFIRMED` ;
 * - **prix convenu figé** (BR-105) : `createOrder` enregistre `agreedVehiclePrice` et
 *   `agreedTransportPrice` ; `updateOrderStatus` ne les touche **jamais** ;
 * - **concurrence** (BR-103, contrat §3.5) : la garantie est portée par l'**index unique partiel en
 *   base** (`orders(vehicle_id) WHERE status <> 'CANCELLED'`) **et** par un contrôle **transactionnel**
 *   (relecture du statut du véhicule et de la commande active **à l'intérieur** de la transaction) ;
 *   jamais par une simple lecture suivie d'une écriture ;
 * - **projection explicite** : seules les colonnes utiles aux écrans sont retournées ;
 * - **historique** : chaque transition de commande écrit une ligne `order_events`, distincte des
 *   événements logistiques du véhicule (`vehicle_logistics_events`, doc 03 §15).
 *
 * Le service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port), comme
 * `services/reseller-application.service.ts`. Son repository par défaut est
 * `repositories/order.repository.ts` (livré séparément), remplaçable par les tests via
 * `configureOrderDependencies`.
 */

export type { OrderStatus };
export { canTransitionOrderStatus, orderTransitions };

/** Types d'événement logistique — liste **verbatim** du corpus (doc 03 §15, contrat §2.1). */
export type LogisticsEventType =
  | "SUPPLIER"
  | "INSPECTION"
  | "PURCHASE_CONFIRMED"
  | "PORT_CHINA"
  | "SHIPPED"
  | "AT_SEA"
  | "ARRIVED_SENEGAL"
  | "CUSTOMS"
  | "AVAILABLE_SENEGAL"
  | "DELIVERED";

/** Vue d'une commande servie aux écrans (liste « Mes commandes » et back-office « Commandes »). */
export type OrderView = {
  id: string;
  reference: string;
  customerId: string;
  vehicleId: string;
  leadId: string | null;
  reservationId: string | null;
  salespersonId: string | null;
  /** Montant figé à la création (BR-105), sérialisé en chaîne décimale. */
  agreedVehiclePrice: string;
  agreedTransportPrice: string | null;
  currency: string;
  status: OrderStatus;
  confirmedAt: Date | null;
  estimatedArrivalAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Ligne telle que retournée par le repository `order.repository.ts`. */
export type OrderRow = OrderView;

export type OrderListItem = OrderView;

/** Élément de l'historique des transitions de commande (`order_events`). */
export type OrderEventView = {
  id: string;
  status: OrderStatus;
  note: string | null;
  occurredAt: Date;
};

/** Fiche commande détaillée : commande + historique `order_events`. */
export type OrderDetail = OrderView & {
  events: OrderEventView[];
};

/** Événement logistique du **véhicule** (`vehicle_logistics_events`), distinct de `order_events`. */
export type LogisticsEventRow = {
  id: string;
  vehicleId: string;
  eventType: LogisticsEventType;
  location: string | null;
  description: string | null;
  eventAt: Date;
  createdBy: string | null;
};

export type LogisticsEventView = LogisticsEventRow;

/** Instantané minimal du véhicule nécessaire à la vente (statut commercial). */
export type VehicleSaleSnapshot = {
  id: string;
  commercialStatus: VehicleCommercialStatus;
};

/** Instantané minimal du prospect rattaché. */
export type LeadSnapshot = {
  id: string;
  status: LeadStatus;
};

/** Instantané minimal de la réservation convertie en commande (doc 09 §5, « CONVERTIR COMMANDE »). */
export type ReservationConversionSnapshot = {
  id: string;
  vehicleId: string;
  status: ReservationStatus;
};

export type OrderFilters = {
  status?: OrderStatus;
  customerId?: string;
  vehicleId?: string;
  /** Recherche libre (référence de commande). */
  search?: string;
};

export type OwnOrderFilters = {
  status?: OrderStatus;
};

export type OrderCreateData = {
  reference: string;
  customerId: string;
  vehicleId: string;
  leadId: string | null;
  reservationId: string | null;
  salespersonId: string | null;
  agreedVehiclePrice: string;
  agreedTransportPrice: string | null;
  currency: string;
  status: OrderStatus;
  confirmedAt: Date;
};

export type OrderStatusUpdateData = {
  status: OrderStatus;
  estimatedArrivalAt?: Date | null;
  deliveredAt?: Date | null;
};

export type OrderEventCreateData = {
  status: OrderStatus;
  note: string | null;
  occurredAt: Date;
};

export type LogisticsEventCreateData = {
  vehicleId: string;
  eventType: LogisticsEventType;
  location: string | null;
  description: string | null;
  eventAt: Date;
  createdBy: string | null;
};

/**
 * Port d'accès aux commandes (`repositories/order.repository.ts`).
 *
 * `transaction` porte dans **une seule** transaction la création de la commande, le passage du
 * véhicule à `SOLD`, la bascule du prospect et l'audit. Le repository traduit la violation de
 * l'index unique partiel `orders(vehicle_id) WHERE status <> 'CANCELLED'` en `AppError("CONFLICT")`,
 * ce qui protège deux instances serveur concurrentes même quand le contrôle transactionnel du
 * service ne les voit pas encore l'une l'autre (contrat §3.5, T45).
 */
export type OrderRepository = {
  findById(id: string): Promise<OrderRow | null>;
  findByReference(reference: string): Promise<OrderRow | null>;
  findActiveByVehicle(vehicleId: string): Promise<OrderRow | null>;
  list(filters: OrderFilters): Promise<OrderRow[]>;
  listByCustomer(customerId: string, filters: OrderFilters): Promise<OrderRow[]>;
  /** Maximum existant + 1 pour l'année donnée (le service en dérive la référence). */
  nextReferenceSequence(year: number): Promise<number>;
  create(data: OrderCreateData): Promise<OrderRow>;
  updateStatus(id: string, values: OrderStatusUpdateData): Promise<OrderRow>;
  listEvents(orderId: string): Promise<OrderEventView[]>;
  appendEvent(orderId: string, values: OrderEventCreateData): Promise<void>;
  findVehicle(vehicleId: string): Promise<VehicleSaleSnapshot | null>;
  setVehicleSold(vehicleId: string, status: "SOLD", soldAt: Date): Promise<void>;
  findLeadById(leadId: string): Promise<LeadSnapshot | null>;
  setLeadStatus(leadId: string, status: LeadStatus): Promise<void>;
  /** Réservation rattachée à la vente (doc 09 §5, « CONVERTIR COMMANDE »). */
  findReservationById(reservationId: string): Promise<ReservationConversionSnapshot | null>;
  setReservationStatus(reservationId: string, status: ReservationStatus): Promise<void>;
  listLogisticsEvents(vehicleId: string): Promise<LogisticsEventRow[]>;
  createLogisticsEvent(data: LogisticsEventCreateData): Promise<LogisticsEventRow>;
  transaction<T>(fn: (tx: OrderRepository) => Promise<T>): Promise<T>;
};

export type OrderDependencies = {
  repository: OrderRepository;
  audit: AuditWriter;
};

let dependencies: OrderDependencies = {
  repository: createOrderRepository(),
  audit: createAuditWriter(),
};

/** Remplace le repository ou la piste d'audit (tests unitaires, ou composition serveur). */
export function configureOrderDependencies(next: Partial<OrderDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les dépendances Prisma par défaut. */
export function resetOrderDependencies(): void {
  dependencies = { repository: createOrderRepository(), audit: createAuditWriter() };
}

// ---------------------------------------------------------------------------
// Erreurs et validation
// ---------------------------------------------------------------------------

const NOT_FOUND_MESSAGE = "Ressource introuvable.";
const SEARCH_MAX_LENGTH = 120;
const NOTE_MAX_LENGTH = 500;
const TEXT_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;

const ORDER_STATUSES = ["CONFIRMED", "PROCESSING", "IN_TRANSIT", "ARRIVED", "DELIVERED", "CANCELLED"] as const;

const LOGISTICS_EVENT_TYPES = [
  "SUPPLIER",
  "INSPECTION",
  "PURCHASE_CONFIRMED",
  "PORT_CHINA",
  "SHIPPED",
  "AT_SEA",
  "ARRIVED_SENEGAL",
  "CUSTOMS",
  "AVAILABLE_SENEGAL",
  "DELIVERED",
] as const;

const idField = z.string().trim().min(1).max(120);

/** Montant décimal non négatif (Decimal 14,2), accepté en nombre ou en chaîne décimale bornée. */
const moneyField = z.union([
  z.number().finite().nonnegative().max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/),
]);

const orderCreateSchema = z
  .object({
    customerId: idField,
    vehicleId: idField,
    leadId: idField.nullish(),
    reservationId: idField.nullish(),
    salespersonId: idField.nullish(),
    agreedVehiclePrice: moneyField,
    agreedTransportPrice: moneyField.nullish(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();

const orderStatusUpdateSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    note: z.string().trim().min(1).max(NOTE_MAX_LENGTH).nullish(),
    reason: z.string().trim().min(1).max(NOTE_MAX_LENGTH).nullish(),
    estimatedArrivalAt: z.date().nullish(),
    deliveredAt: z.date().nullish(),
  })
  .strict();

const orderFiltersSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    customerId: idField.optional(),
    vehicleId: idField.optional(),
    search: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
  })
  .strict();

const ownOrderFiltersSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
  })
  .strict();

const logisticsEventSchema = z
  .object({
    vehicleId: idField,
    eventType: z.enum(LOGISTICS_EVENT_TYPES),
    location: z.string().trim().min(1).max(TEXT_MAX_LENGTH).nullish(),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH).nullish(),
    eventAt: z.date().nullish(),
  })
  .strict();

export type ParsedOrderCreate = {
  customerId: string;
  vehicleId: string;
  leadId: string | null;
  reservationId: string | null;
  salespersonId: string | null;
  agreedVehiclePrice: string;
  agreedTransportPrice: string | null;
  currency: string;
};

export type ParsedOrderStatusUpdate = {
  status: OrderStatus;
  note: string | null;
  reason: string | null;
  estimatedArrivalAt?: Date | null;
  deliveredAt?: Date | null;
};

export type ParsedLogisticsEventInput = {
  vehicleId: string;
  eventType: LogisticsEventType;
  location: string | null;
  description: string | null;
  eventAt: Date | null;
};

function toMoneyString(value: number | string): string {
  return Number(value).toFixed(2);
}

/** Valide un identifiant (non vide, borné) sans imposer de format — la cible vient du serveur. */
export function parseOrderId(orderId: string): string {
  const result = idField.safeParse(orderId);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant invalide.");
  }

  return result.data;
}

/** Valide un identifiant de véhicule. */
export function parseVehicleId(vehicleId: string): string {
  const result = idField.safeParse(vehicleId);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant de véhicule invalide.");
  }

  return result.data;
}

/** Valide et normalise l'entrée de création ; un champ inconnu est refusé (strict). */
export function parseOrderCreate(input: unknown): ParsedOrderCreate {
  const result = orderCreateSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de commande invalide.");
  }

  const data = result.data;
  return {
    customerId: data.customerId,
    vehicleId: data.vehicleId,
    leadId: data.leadId ?? null,
    reservationId: data.reservationId ?? null,
    salespersonId: data.salespersonId ?? null,
    agreedVehiclePrice: toMoneyString(data.agreedVehiclePrice),
    agreedTransportPrice: data.agreedTransportPrice === null || data.agreedTransportPrice === undefined
      ? null
      : toMoneyString(data.agreedTransportPrice),
    currency: data.currency ?? "XOF",
  };
}

/** Valide une transition de commande ; un champ inconnu est refusé (strict). */
export function parseOrderStatusUpdate(input: unknown): ParsedOrderStatusUpdate {
  const result = orderStatusUpdateSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de transition de commande invalide.");
  }

  const data = result.data;
  const parsed: ParsedOrderStatusUpdate = {
    status: data.status,
    note: data.note ?? null,
    reason: data.reason ?? null,
  };

  if (data.estimatedArrivalAt !== undefined) parsed.estimatedArrivalAt = data.estimatedArrivalAt;
  if (data.deliveredAt !== undefined) parsed.deliveredAt = data.deliveredAt;
  return parsed;
}

/** Filtres de liste back-office bornés et validés (strict). */
export function parseOrderFilters(filters?: OrderFilters): OrderFilters {
  const result = orderFiltersSchema.safeParse(filters ?? {});
  if (!result.success) {
    throw new AppError("VALIDATION", "Filtres de commande invalides.");
  }

  return result.data;
}

/** Filtres « Mes commandes » : le client ne filtre que par statut (aucune portée fournie). */
export function parseOwnOrderFilters(filters?: OwnOrderFilters): OwnOrderFilters {
  const result = ownOrderFiltersSchema.safeParse(filters ?? {});
  if (!result.success) {
    throw new AppError("VALIDATION", "Filtres de commande invalides.");
  }

  return result.data;
}

/** Valide un événement logistique ; un champ inconnu est refusé (strict). */
export function parseLogisticsEventInput(input: unknown): ParsedLogisticsEventInput {
  const result = logisticsEventSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée d'événement logistique invalide.");
  }

  const data = result.data;
  return {
    vehicleId: data.vehicleId,
    eventType: data.eventType,
    location: data.location ?? null,
    description: data.description ?? null,
    eventAt: data.eventAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Projection de lecture
// ---------------------------------------------------------------------------

export function toOrderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    leadId: row.leadId,
    reservationId: row.reservationId,
    salespersonId: row.salespersonId,
    agreedVehiclePrice: row.agreedVehiclePrice,
    agreedTransportPrice: row.agreedTransportPrice,
    currency: row.currency,
    status: row.status,
    confirmedAt: row.confirmedAt,
    estimatedArrivalAt: row.estimatedArrivalAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toOrderDetail(row: OrderRow, events: readonly OrderEventView[]): OrderDetail {
  return { ...toOrderView(row), events: [...events] };
}

export function toLogisticsEventView(row: LogisticsEventRow): LogisticsEventView {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    eventType: row.eventType,
    location: row.location,
    description: row.description,
    eventAt: row.eventAt,
    createdBy: row.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Vente — la transaction atomique critique (doc 09 §10, BR-104)
// ---------------------------------------------------------------------------

/**
 * Crée une commande : **transaction atomique unique** portant la création de la commande, le passage
 * du véhicule à `SOLD`, l'audit (`vehicle.sell`, action canonique du corpus — aucune action inventée)
 * et la bascule du prospect rattaché à `ORDER_CONFIRMED` (doc 09 §10).
 *
 * Concurrence (BR-103, contrat §3.5) : à l'intérieur de la transaction, le statut commercial du
 * véhicule est relu et la commande active du véhicule est recherchée **avant** toute écriture ; en
 * complément, l'index unique partiel de la base refuse une seconde commande active et le repository
 * traduit cette violation en `CONFLICT`. Une lecture suivie d'une écriture hors transaction ne
 * constitue jamais la garantie.
 *
 * Prix figé (BR-105) : `agreedVehiclePrice` et `agreedTransportPrice` sont enregistrés tels quels à
 * la création ; ils ne seront plus jamais recalculés.
 */
export async function createOrder(actor: Actor, input: unknown): Promise<OrderView> {
  const staff = requireStaff(actor, "order.create");
  const parsed = parseOrderCreate(input);

  const confirmedAt = new Date();
  const year = confirmedAt.getUTCFullYear();

  const created = await dependencies.repository.transaction(async (tx) => {
    const vehicle = await tx.findVehicle(parsed.vehicleId);
    if (!vehicle) {
      throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    }

    // Précondition de vente (doc 09 §1 : « AVAILABLE/RESERVED → Vendre → SOLD »). La machine
    // canonique porte désormais cette transition (arbitrage T46 : `AVAILABLE → SOLD` autorisé),
    // donc la règle de vente n'est plus dupliquée ici.
    if (!canTransitionVehicleStatus(vehicle.commercialStatus, "SOLD")) {
      throw new AppError(
        "CONFLICT",
        `Vente impossible : véhicule au statut « ${vehicle.commercialStatus} ».`,
      );
    }

    const active = await tx.findActiveByVehicle(parsed.vehicleId);
    if (active) {
      throw new AppError("CONFLICT", "Une commande active existe déjà pour ce véhicule.");
    }

    let lead: LeadSnapshot | null = null;
    if (parsed.leadId) {
      lead = await tx.findLeadById(parsed.leadId);
      if (!lead) {
        throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
      }
    }

    // « CONVERTIR COMMANDE » (doc 09 §5) : la réservation confirmée est close en CONVERTED dans la
    // MÊME transaction que la vente (doc 09 §10). Une réservation d'un autre véhicule ne peut pas
    // être convertie par cette vente.
    let reservation: ReservationConversionSnapshot | null = null;
    if (parsed.reservationId) {
      reservation = await tx.findReservationById(parsed.reservationId);
      if (!reservation) {
        throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
      }
      if (reservation.vehicleId !== parsed.vehicleId) {
        throw new AppError("CONFLICT", "Réservation rattachée à un autre véhicule.");
      }
      if (!canTransitionReservationStatus(reservation.status, "CONVERTED")) {
        throw new AppError(
          "CONFLICT",
          `Conversion impossible : réservation au statut « ${reservation.status} ».`,
        );
      }
    }

    const sequence = await tx.nextReferenceSequence(year);
    const reference = formatOrderReference(year, sequence);
    const clash = await tx.findByReference(reference);
    if (clash) {
      throw new AppError("CONFLICT", "Référence commande déjà attribuée.");
    }

    const row = await tx.create({
      reference,
      customerId: parsed.customerId,
      vehicleId: parsed.vehicleId,
      leadId: parsed.leadId,
      reservationId: parsed.reservationId,
      salespersonId: parsed.salespersonId ?? staff.staffId,
      agreedVehiclePrice: parsed.agreedVehiclePrice,
      agreedTransportPrice: parsed.agreedTransportPrice,
      currency: parsed.currency,
      status: "CONFIRMED",
      confirmedAt,
    });

    await tx.setVehicleSold(parsed.vehicleId, "SOLD", confirmedAt);

    if (reservation) {
      await tx.setReservationStatus(reservation.id, "CONVERTED");
    }

    if (lead) {
      await tx.setLeadStatus(lead.id, "ORDER_CONFIRMED");
    }

    await dependencies.audit(
      buildAuditEntry({
        actorProfileId: staff.profileId,
        action: "vehicle.sell",
        entityType: "Vehicle",
        entityId: parsed.vehicleId,
        oldValues: {
          commercialStatus: vehicle.commercialStatus,
          leadStatus: lead?.status ?? null,
          reservationStatus: reservation?.status ?? null,
          agreedVehiclePrice: null,
        },
        newValues: {
          commercialStatus: "SOLD",
          leadStatus: lead ? "ORDER_CONFIRMED" : null,
          reservationStatus: reservation ? "CONVERTED" : null,
          orderId: row.id,
          orderReference: reference,
          orderStatus: "CONFIRMED",
          agreedVehiclePrice: parsed.agreedVehiclePrice,
          agreedTransportPrice: parsed.agreedTransportPrice,
        },
        reason: `Vente : commande ${reference} confirmée.`,
      }),
    );

    return row;
  });

  return toOrderView(created);
}

// ---------------------------------------------------------------------------
// Transitions de commande (doc 09 §7, contrat §3.3)
// ---------------------------------------------------------------------------

/**
 * Fait évoluer une commande (`order.update`). La transition est validée par la machine à états
 * (`canTransitionOrderStatus`) ; toute transition non listée est refusée (`CONFLICT`), les états
 * terminaux (`DELIVERED`, `CANCELLED`) ne se rouvrent pas. Chaque transition écrit une ligne
 * `order_events`, l'audit `order.status.change` (action canonique, motif obligatoire) et, pour
 * `DELIVERED`, renseigne `delivered_at`. **Les prix convenus ne sont jamais touchés** (BR-105).
 */
export async function updateOrderStatus(actor: Actor, orderId: string, input: unknown): Promise<OrderDetail> {
  const staff = requireStaff(actor, "order.update");
  const id = parseOrderId(orderId);
  const parsed = parseOrderStatusUpdate(input);

  const current = await dependencies.repository.findById(id);
  if (!current) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  if (!canTransitionOrderStatus(current.status, parsed.status)) {
    throw new AppError(
      "CONFLICT",
      `Transition impossible de « ${current.status} » vers « ${parsed.status} ».`,
    );
  }

  const occurredAt = new Date();
  const values: OrderStatusUpdateData = { status: parsed.status };
  if (parsed.estimatedArrivalAt !== undefined) values.estimatedArrivalAt = parsed.estimatedArrivalAt;
  if (parsed.status === "DELIVERED") {
    values.deliveredAt = parsed.deliveredAt ?? occurredAt;
  } else if (parsed.deliveredAt !== undefined) {
    values.deliveredAt = parsed.deliveredAt;
  }

  const reason =
    parsed.reason ?? parsed.note ?? `Transition ${current.status} → ${parsed.status}`;

  const entry = buildAuditEntry({
    actorProfileId: staff.profileId,
    action: "order.status.change",
    entityType: "Order",
    entityId: id,
    oldValues: { status: current.status },
    newValues: {
      status: parsed.status,
      ...(values.estimatedArrivalAt !== undefined ? { estimatedArrivalAt: values.estimatedArrivalAt } : {}),
      ...(values.deliveredAt !== undefined ? { deliveredAt: values.deliveredAt } : {}),
    },
    reason,
  });

  const updated = await dependencies.repository.transaction(async (tx) => {
    const row = await tx.updateStatus(id, values);
    await tx.appendEvent(id, { status: parsed.status, note: parsed.note, occurredAt });
    await dependencies.audit(entry);
    return row;
  });

  const events = await dependencies.repository.listEvents(id);
  return toOrderDetail(updated, events);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Fiche commande (historique `order_events`) ; exige `order.view`. Client inconnu → `NOT_FOUND`. */
export async function readOrder(actor: Actor, orderId: string): Promise<OrderDetail> {
  requireStaff(actor, "order.view");
  const id = parseOrderId(orderId);

  const row = await dependencies.repository.findById(id);
  if (!row) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  const events = await dependencies.repository.listEvents(id);
  return toOrderDetail(row, events);
}

/** Liste back-office des commandes ; exige `order.view`. Filtres bornés et validés. */
export async function listOrders(actor: Actor, filters?: OrderFilters): Promise<OrderListItem[]> {
  requireStaff(actor, "order.view");
  const parsed = parseOrderFilters(filters);
  const rows = await dependencies.repository.list(parsed);
  return rows.map(toOrderView);
}

/**
 * Liste « Mes commandes » (My Diaba Auto) ; garde `requireCustomer`. La portée vient toujours de
 * l'acteur résolu côté serveur, jamais d'un identifiant fourni (contrat §6, doc 14 §4) : un client ne
 * voit **jamais** la commande d'un autre.
 */
export async function listOwnOrders(actor: Actor, filters?: OwnOrderFilters): Promise<OrderListItem[]> {
  const customer = requireCustomer(actor);
  const parsed = parseOwnOrderFilters(filters);
  const rows = await dependencies.repository.listByCustomer(customer.customerId, parsed);
  return rows.map(toOrderView);
}

// ---------------------------------------------------------------------------
// Suivi logistique du véhicule (doc 03 §15, contrat §2.4)
// ---------------------------------------------------------------------------

/**
 * Ajoute un événement logistique au **véhicule** ; exige `order.update`. Le créateur est l'acteur
 * serveur, jamais une valeur du formulaire. Le véhicule doit exister (`NOT_FOUND` neutre).
 */
export async function addLogisticsEvent(actor: Actor, input: unknown): Promise<LogisticsEventView> {
  const staff = requireStaff(actor, "order.update");
  const parsed = parseLogisticsEventInput(input);

  const vehicle = await dependencies.repository.findVehicle(parsed.vehicleId);
  if (!vehicle) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }

  const event = await dependencies.repository.createLogisticsEvent({
    vehicleId: parsed.vehicleId,
    eventType: parsed.eventType,
    location: parsed.location,
    description: parsed.description,
    eventAt: parsed.eventAt ?? new Date(),
    createdBy: staff.staffId,
  });

  return toLogisticsEventView(event);
}

/** Historique logistique du véhicule ; exige `order.view`. */
export async function listLogisticsEvents(actor: Actor, vehicleId: string): Promise<LogisticsEventView[]> {
  requireStaff(actor, "order.view");
  const id = parseVehicleId(vehicleId);
  const rows = await dependencies.repository.listLogisticsEvents(id);
  return rows.map(toLogisticsEventView);
}
