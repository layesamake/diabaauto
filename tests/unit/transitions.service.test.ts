import { describe, expect, it } from "vitest";
import { canTransitionVehicleStatus } from "@/services/transitions.service";

describe("canTransitionVehicleStatus", () => {
  it("allows the canonical VehicleCommercialStatus transitions (contrat §4.4)", () => {
    expect(canTransitionVehicleStatus("DRAFT", "AVAILABLE")).toBe(true);
    expect(canTransitionVehicleStatus("DRAFT", "ARCHIVED")).toBe(true);
    expect(canTransitionVehicleStatus("AVAILABLE", "RESERVED")).toBe(true);
    expect(canTransitionVehicleStatus("AVAILABLE", "UNAVAILABLE")).toBe(true);
    expect(canTransitionVehicleStatus("AVAILABLE", "ARCHIVED")).toBe(true);
    expect(canTransitionVehicleStatus("RESERVED", "SOLD")).toBe(true);
    expect(canTransitionVehicleStatus("RESERVED", "AVAILABLE")).toBe(true);
    expect(canTransitionVehicleStatus("UNAVAILABLE", "AVAILABLE")).toBe(true);
    expect(canTransitionVehicleStatus("UNAVAILABLE", "ARCHIVED")).toBe(true);
  });

  it("refuses undocumented or terminal transitions", () => {
    expect(canTransitionVehicleStatus("SOLD", "AVAILABLE")).toBe(false);
    expect(canTransitionVehicleStatus("SOLD", "ARCHIVED")).toBe(false);
    expect(canTransitionVehicleStatus("ARCHIVED", "AVAILABLE")).toBe(false);
    expect(canTransitionVehicleStatus("DRAFT", "SOLD")).toBe(false);
    expect(canTransitionVehicleStatus("AVAILABLE", "DRAFT")).toBe(false);
    expect(canTransitionVehicleStatus("RESERVED", "ARCHIVED")).toBe(false);
  });
});