import type { MediaRow, VehicleMediaRepository } from "@/services/media.service";

/** Identifiants valides (UUID) pour les doubles en mémoire. */
export function mediaUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Repository en mémoire : reproduit la démarcation du principal et l'ordre d'affichage. */
export function fakeMediaRepository(initial: MediaRow[] = [], unknownVehicles: readonly string[] = []) {
  let items = [...initial];
  let counter = 0;

  const repository: VehicleMediaRepository = {
    async findById(id) {
      return items.find((item) => item.id === id) ?? null;
    },
    async listByVehicle(vehicleId) {
      return items
        .filter((item) => item.vehicleId === vehicleId)
        .sort((left, right) => left.displayOrder - right.displayOrder);
    },
    async create(input) {
      const row: MediaRow = { id: mediaUuid(++counter), ...input };
      items.push(row);
      return row;
    },
    async setPrimary(id, isPrimary) {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) throw new Error("media not found");
      const updated = { ...current, isPrimary };
      items[index] = updated;
      return updated;
    },
    async demotePrimary(vehicleId, exceptId) {
      items = items.map((item) =>
        item.vehicleId === vehicleId && item.id !== exceptId ? { ...item, isPrimary: false } : item,
      );
    },
    async setDisplayOrder(id, displayOrder) {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) throw new Error("media not found");
      items[index] = { ...current, displayOrder };
    },
    async remove(id) {
      items = items.filter((item) => item.id !== id);
    },
    async updateFiles(id, files) {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) throw new Error("media not found");
      const updated = { ...current, ...files };
      items[index] = updated;
      return updated;
    },
    async updateThumbnail(id, thumbnailPath) {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) throw new Error("media not found");
      const updated = { ...current, thumbnailPath };
      items[index] = updated;
      return updated;
    },
    async lockVehicle(vehicleId) {
      return !unknownVehicles.includes(vehicleId);
    },
    async transaction(fn) {
      return fn(repository);
    },
  };

  return { repository, all: () => [...items] };
}

