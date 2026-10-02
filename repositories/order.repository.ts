import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma/client";
import { translatePrismaError } from "@/lib/prisma/errors";
import { nextOrderSequence } from "@/lib/order-reference";
import type {
  LeadSnapshot,
  LogisticsEventCreateData,
  LogisticsEventRow,
  OrderCreateData,
  OrderEventCreateData,
  OrderEventView,
  OrderFilters,
  OrderRepository,
  OrderRow,
  OrderStatusUpdateData,
  ReservationConversionSnapshot,
  VehicleSaleSnapshot,
} from "@/services/order.service";
import type { LeadStatus, ReservationStatus } from "@/services/transitions.service";

/**
 * Accès Prisma aux commandes (`orders`), à leur historique de transitions (`order_events`) et au
 * suivi logistique du véhicule (`vehicle_logistics_events`), contrat lot 6 §2.3-§2.5, §3.4, §5.
 *
 * Une seule `select` explicite par projection : aucune donnée interne superflue n'est retournée.
 * `transaction(fn)` ouvre **une** transaction Prisma et fournit à `fn` un repository lié au client
 * transactionnel, afin que la vente (commande + `Vehicle SOLD` + réservation `CONVERTED` + lead
 * `ORDER_CONFIRMED` + audit) soit atomique (doc 09 §10, BR-104).
 *
 * Invariant en base non exprimable en Prisma : l'index unique PARTIEL
 * `orders_one_active_per_vehicle_idx` (WHERE status <> 'CANCELLED'). Sa violation (code `P2002`) est
 * traduite en `AppError("CONFLICT")`, ce qui protège deux instances serveur concurrentes (contrat
 * §3.5, T45).
 */

/** Colonnes strictement nécessaires à la projection `OrderRow` (= `OrderView`). */
export const orderSelect = {
  id: true,
  reference: true,
  customerId: true,
  vehicleId: true,
  leadId: true,
  reservationId: true,
  salespersonId: true,
  agreedVehiclePrice: true,
  agreedTransportPrice: true,
  currency: true,
  status: true,
  confirmedAt: true,
  estimatedArrivalAt: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type OrderDbRow = {
  id: string;
  reference: string;
  customerId: string;
  vehicleId: string;
  leadId: string | null;
  reservationId: string | null;
  salespersonId: string;
  agreedVehiclePrice: Prisma.Decimal;
  agreedTransportPrice: Prisma.Decimal | null;
  currency: string;
  status: OrderRow["status"];
  confirmedAt: Date;
  estimatedArrivalAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toOrderRow(row: OrderDbRow): OrderRow {
  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    leadId: row.leadId ?? null,
    reservationId: row.reservationId ?? null,
    salespersonId: row.salespersonId,
    agreedVehiclePrice: row.agreedVehiclePrice.toFixed(2),
    agreedTransportPrice: row.agreedTransportPrice ? row.agreedTransportPrice.toFixed(2) : null,
    currency: row.currency,
    status: row.status,
    confirmedAt: row.confirmedAt ?? null,
    estimatedArrivalAt: row.estimatedArrivalAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const orderEventSelect = {
  id: true,
  status: true,
  note: true,
  occurredAt: true,
} as const;

export type OrderEventDbRow = {
  id: string;
  status: OrderEventView["status"];
  note: string | null;
  occurredAt: Date;
};

export function toOrderEventView(row: OrderEventDbRow): OrderEventView {
  return {
    id: row.id,
    status: row.status,
    note: row.note ?? null,
    occurredAt: row.occurredAt,
  };
}

export const logisticsEventSelect = {
  id: true,
  vehicleId: true,
  eventType: true,
  location: true,
  description: true,
  eventAt: true,
  createdBy: true,
} as const;

export type LogisticsEventDbRow = {
  id: string;
  vehicleId: string;
  eventType: LogisticsEventRow["eventType"];
  location: string | null;
  description: string | null;
  eventAt: Date;
  createdBy: string | null;
};

export function toLogisticsEventRow(row: LogisticsEventDbRow): LogisticsEventRow {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    eventType: row.eventType,
    location: row.location ?? null,
    description: row.description ?? null,
    eventAt: row.eventAt,
    createdBy: row.createdBy ?? null,
  };
}

/** Construit le filtre `where` borné de la liste back-office. */
export function toOrderWhere(filters: OrderFilters = {}): Prisma.OrderWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.search
      ? { reference: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
  };
}

export function createOrderRepository(client: Prisma.TransactionClient = prisma): OrderRepository {
  return {
    async findById(id: string) {
      const row = await client.order.findUnique({ where: { id }, select: orderSelect });
      return row ? toOrderRow(row) : null;
    },

    async findByReference(reference: string) {
      const row = await client.order.findUnique({ where: { reference }, select: orderSelect });
      return row ? toOrderRow(row) : null;
    },

    async findActiveByVehicle(vehicleId: string) {
      const row = await client.order.findFirst({
        where: { vehicleId, status: { not: "CANCELLED" } },
        select: orderSelect,
        orderBy: { createdAt: "desc" },
      });

      return row ? toOrderRow(row) : null;
    },

    async list(filters: OrderFilters) {
      const rows = await client.order.findMany({
        where: toOrderWhere(filters),
        select: orderSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toOrderRow);
    },

    async listByCustomer(customerId: string, filters: OrderFilters) {
      const rows = await client.order.findMany({
        where: { customerId, ...(filters.status ? { status: filters.status } : {}) },
        select: orderSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toOrderRow);
    },

    async nextReferenceSequence(year: number) {
      const rows = await client.order.findMany({
        where: { reference: { startsWith: `CMD-${year}-` } },
        select: { reference: true },
      });

      return nextOrderSequence(year, rows.map((row) => row.reference));
    },

    async create(data: OrderCreateData) {
      // `orders.salesperson_id` est NOT NULL (contrat §2.3) : une commande sans vendeur est refusée
      // plutôt que de laisser PostgreSQL échouer sur la clé étrangère.
      if (data.salespersonId === null) {
        throw new AppError("VALIDATION", "Vendeur manquant pour la commande.");
      }

      try {
        const row = await client.order.create({
          data: {
            id: globalThis.crypto.randomUUID(),
            reference: data.reference,
            customerId: data.customerId,
            vehicleId: data.vehicleId,
            leadId: data.leadId,
            reservationId: data.reservationId,
            salespersonId: data.salespersonId,
            agreedVehiclePrice: data.agreedVehiclePrice,
            agreedTransportPrice: data.agreedTransportPrice,
            currency: data.currency,
            status: data.status,
            confirmedAt: data.confirmedAt,
            updatedAt: new Date(),
          },
          select: orderSelect,
        });

        return toOrderRow(row);
      } catch (error) {
        const translated = translatePrismaError(
          error,
          "Une commande active existe déjà pour ce véhicule.",
        );
        if (translated) throw translated;
        throw error;
      }
    },

    async updateStatus(id: string, values: OrderStatusUpdateData) {
      const data: Prisma.OrderUpdateInput = {
        status: values.status,
        ...(values.estimatedArrivalAt !== undefined
          ? { estimatedArrivalAt: values.estimatedArrivalAt }
          : {}),
        ...(values.deliveredAt !== undefined ? { deliveredAt: values.deliveredAt } : {}),
      };

      try {
        const row = await client.order.update({ where: { id }, data, select: orderSelect });
        return toOrderRow(row);
      } catch (error) {
        const translated = translatePrismaError(error, "Mise à jour de commande refusée.");
        if (translated) throw translated;
        throw error;
      }
    },

    async listEvents(orderId: string) {
      const rows = await client.orderEvent.findMany({
        where: { orderId },
        select: orderEventSelect,
        orderBy: { occurredAt: "asc" },
      });

      return rows.map(toOrderEventView);
    },

    async appendEvent(orderId: string, values: OrderEventCreateData) {
      await client.orderEvent.create({
        data: {
          id: globalThis.crypto.randomUUID(),
          orderId,
          status: values.status,
          note: values.note,
          occurredAt: values.occurredAt,
        },
      });
    },

    async findVehicle(vehicleId: string) {
      const vehicle = await client.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, commercialStatus: true },
      });

      if (!vehicle) return null;

      const snapshot: VehicleSaleSnapshot = {
        id: vehicle.id,
        commercialStatus: vehicle.commercialStatus,
      };
      return snapshot;
    },

    async setVehicleSold(vehicleId: string, status: "SOLD", soldAt: Date) {
      await client.vehicle.update({
        where: { id: vehicleId },
        // `soldAt` date la dernière évolution de la fiche (le modèle `Vehicle` ne porte pas de
        // colonne `sold_at` dédiée) : l'information reste donc traçable sans inventer de champ.
        data: { commercialStatus: status, updatedAt: soldAt },
        select: { id: true },
      });
    },

    async findLeadById(leadId: string) {
      const lead = await client.lead.findUnique({
        where: { id: leadId },
        select: { id: true, status: true },
      });

      if (!lead) return null;

      const snapshot: LeadSnapshot = { id: lead.id, status: lead.status };
      return snapshot;
    },

    async setLeadStatus(leadId: string, status: LeadStatus) {
      await client.lead.update({ where: { id: leadId }, data: { status }, select: { id: true } });
    },

    async findReservationById(reservationId: string) {
      const reservation = await client.reservation.findUnique({
        where: { id: reservationId },
        select: { id: true, vehicleId: true, status: true },
      });

      if (!reservation) return null;

      const snapshot: ReservationConversionSnapshot = {
        id: reservation.id,
        vehicleId: reservation.vehicleId,
        status: reservation.status,
      };
      return snapshot;
    },

    async setReservationStatus(reservationId: string, status: ReservationStatus) {
      await client.reservation.update({
        where: { id: reservationId },
        data: { status },
        select: { id: true },
      });
    },

    async listLogisticsEvents(vehicleId: string) {
      const rows = await client.vehicleLogisticsEvent.findMany({
        where: { vehicleId },
        select: logisticsEventSelect,
        orderBy: { eventAt: "asc" },
      });

      return rows.map(toLogisticsEventRow);
    },

    async createLogisticsEvent(data: LogisticsEventCreateData) {
      const row = await client.vehicleLogisticsEvent.create({
        data: {
          id: globalThis.crypto.randomUUID(),
          vehicleId: data.vehicleId,
          eventType: data.eventType,
          location: data.location,
          description: data.description,
          eventAt: data.eventAt,
          createdBy: data.createdBy,
        },
        select: logisticsEventSelect,
      });

      return toLogisticsEventRow(row);
    },

    // Transaction de premier niveau uniquement : le client transactionnel ne relance pas de
    // transaction imbriquée (l'appelant ne compose pas deux `transaction`).
    transaction: (fn) => prisma.$transaction(async (tx) => fn(createOrderRepository(tx))),
  };
}
