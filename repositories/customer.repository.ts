import { prisma } from "@/lib/prisma/client";
import type { ResellerStatus } from "@/services/pricing.service";
import type { CustomerProfileRepository, CustomerProfileUpdate } from "@/services/profile.service";

/**
 * Accès aux données du profil client (My Diaba Auto) — CLAUDE.md §7 :
 * « Retourner des objets explicitement sélectionnés selon l'acteur. Éviter de sérialiser un modèle
 * Prisma complet. »
 *
 * La sélection est figée ci-dessous : elle ne contient que les sept colonnes réellement affichées.
 * Aucun identifiant interne (`id`, `profileId`), aucune relation, aucun horodatage ne peut fuiter
 * vers l'interface, même si le modèle Prisma évolue.
 *
 * La cible d'une lecture ou d'une écriture est toujours le `customerId` de l'acteur résolu côté
 * serveur : elle n'est jamais fournie par le navigateur (les services la dérivent de l'acteur).
 */

/** Colonnes strictement nécessaires à l'affichage et à l'édition du profil personnel. */
export const customerProfileSelect = {
  firstName: true,
  lastName: true,
  phone: true,
  whatsapp: true,
  city: true,
  country: true,
  resellerStatus: true,
} as const;

export type CustomerProfileRow = {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  country: string | null;
  resellerStatus: ResellerStatus;
};

/** Champs réellement modifiables par le client : tout le reste est refusé en amont par le service. */
export type CustomerProfileUpdateData = Pick<
  CustomerProfileUpdate,
  "firstName" | "lastName" | "phone" | "whatsapp" | "city" | "country"
>;

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toCustomerProfileRecord(row: CustomerProfileRow): CustomerProfileRow {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    city: row.city ?? null,
    country: row.country ?? null,
    resellerStatus: row.resellerStatus,
  };
}

/**
 * Filtre de défense en profondeur : même si une donnée privilégiée (`resellerStatus`, `status`,
 * `userType`, …) parvenait jusqu'ici, elle ne serait jamais transmise à Prisma.
 */
export function toCustomerProfileUpdateData(data: CustomerProfileUpdate): CustomerProfileUpdateData {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    whatsapp: data.whatsapp,
    city: data.city,
    country: data.country,
  };
}

/** Sous-ensemble du client Prisma utilisé — permet d'injecter un double en test unitaire. */
export type CustomerProfileClient = {
  customerProfile: {
    findUnique(args: {
      where: { id: string };
      select: typeof customerProfileSelect;
    }): Promise<CustomerProfileRow | null>;
    update(args: {
      where: { id: string };
      data: CustomerProfileUpdateData;
      select: typeof customerProfileSelect;
    }): Promise<CustomerProfileRow | null>;
  };
};

export function createCustomerRepository(
  client: CustomerProfileClient = prisma as unknown as CustomerProfileClient,
): CustomerProfileRepository {
  return {
    async readProfile(customerId: string) {
      const row = await client.customerProfile.findUnique({
        where: { id: customerId },
        select: customerProfileSelect,
      });

      return row ? toCustomerProfileRecord(row) : null;
    },

    async updateProfile(customerId: string, data: CustomerProfileUpdate) {
      const row = await client.customerProfile.update({
        where: { id: customerId },
        data: toCustomerProfileUpdateData(data),
        select: customerProfileSelect,
      });

      return row ? toCustomerProfileRecord(row) : null;
    },
  };
}
