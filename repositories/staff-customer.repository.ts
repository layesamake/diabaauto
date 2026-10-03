import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { ResellerStatus } from "@/services/pricing.service";
import type {
  CustomerFilters,
  CustomerRow,
  CustomerUpdateData,
  StaffCustomerRepository,
} from "@/services/staff-customer.service";

/**
 * Accès Prisma aux clients pour le personnel (`customer_profiles`, contrat lot 5 §4 et §5).
 *
 * Projection explicite : seules les colonnes utiles à l'écran sont sélectionnées ; jamais le modèle
 * Prisma complet ni un identifiant interne (`profileId`, `authUserId`) — CLAUDE.md §7.
 *
 * `setResellerStatus` n'écrit **que** `reseller_status` ; `pricing_profile` reste inchangé, l'octroi
 * du tarif RESELLER étant porté exclusivement par l'approbation transactionnelle de
 * `repositories/reseller-application.repository.ts` (contrat §5).
 *
 * Une ligne introuvable vaut `null` (refus neutre `NOT_FOUND` côté service) : le code Prisma
 * `P2025` est traduit en `null` plutôt que propagé.
 */

/** Colonnes strictement nécessaires aux projections du service. */
export const staffCustomerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  whatsapp: true,
  city: true,
  country: true,
  companyName: true,
  segment: true,
  pricingProfile: true,
  resellerStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type StaffCustomerDbRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string;
  companyName: string | null;
  segment: CustomerRow["segment"];
  pricingProfile: CustomerRow["pricingProfile"];
  resellerStatus: ResellerStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toCustomerRow(row: StaffCustomerDbRow): CustomerRow {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    city: row.city ?? null,
    country: row.country,
    companyName: row.companyName ?? null,
    segment: row.segment,
    pricingProfile: row.pricingProfile,
    resellerStatus: row.resellerStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Construit le filtre `where` borné de la liste clients. */
export function toStaffCustomerWhere(filters: CustomerFilters = {}): Prisma.CustomerProfileWhereInput {
  return {
    // Un compte personnel n'est pas un client. Le trigger `on_auth_user_created` crée un
    // `customer_profiles` pour CHAQUE nouvel utilisateur Auth — y compris un futur membre du
    // personnel (`staff:grant`, lot 7) — et ces lignes résiduelles feraient apparaître un
    // administrateur dans la liste Clients. Le filtre rend la liste correcte indépendamment de
    // tout résidu (et non plus seulement par propreté des données).
    profile: { userType: "CUSTOMER" },
    ...(filters.segment ? { segment: filters.segment } : {}),
    ...(filters.resellerStatus ? { resellerStatus: filters.resellerStatus } : {}),
    ...(filters.search
      ? {
          OR: [
            { firstName: { contains: filters.search, mode: "insensitive" as const } },
            { lastName: { contains: filters.search, mode: "insensitive" as const } },
            { phone: { contains: filters.search, mode: "insensitive" as const } },
            { city: { contains: filters.search, mode: "insensitive" as const } },
            { companyName: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/** Seuls les champs fournis sont transmis : Prisma laisse les autres colonnes inchangées. */
export function toCustomerUpdateData(data: CustomerUpdateData): Prisma.CustomerProfileUpdateInput {
  return {
    ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
    ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp } : {}),
    ...(data.city !== undefined ? { city: data.city } : {}),
    ...(data.country !== undefined ? { country: data.country } : {}),
    ...(data.segment !== undefined ? { segment: data.segment } : {}),
  };
}

/** Vrai si l'erreur Prisma signale une ligne cible absente (`P2025`). */
function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function createStaffCustomerRepository(
  client: Prisma.TransactionClient = prisma,
): StaffCustomerRepository {
  return {
    async listCustomers(filters: CustomerFilters) {
      const rows = await client.customerProfile.findMany({
        where: toStaffCustomerWhere(filters),
        select: staffCustomerSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toCustomerRow);
    },

    async readCustomer(customerId: string) {
      const row = await client.customerProfile.findUnique({
        where: { id: customerId },
        select: staffCustomerSelect,
      });

      return row ? toCustomerRow(row) : null;
    },

    async updateCustomer(customerId: string, data: CustomerUpdateData) {
      try {
        const row = await client.customerProfile.update({
          where: { id: customerId },
          data: toCustomerUpdateData(data),
          select: staffCustomerSelect,
        });

        return toCustomerRow(row);
      } catch (error) {
        if (isRecordNotFound(error)) return null;
        throw error;
      }
    },

    async setResellerStatus(customerId: string, status: ResellerStatus) {
      try {
        const row = await client.customerProfile.update({
          where: { id: customerId },
          data: { resellerStatus: status },
          select: staffCustomerSelect,
        });

        return toCustomerRow(row);
      } catch (error) {
        if (isRecordNotFound(error)) return null;
        throw error;
      }
    },
  };
}
