import { describe, expect, it } from "vitest";
import {
  canTransitionLeadStatus,
  canTransitionResellerApplication,
  canTransitionVehicleStatus,
  leadStatusTransitions,
  resellerApplicationTransitions,
} from "@/services/transitions.service";

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

describe("Lead state machine (doc 09 §4, contrat lot 5 §3)", () => {
  it("allows exactly the canonical chain", () => {
    expect(canTransitionLeadStatus("NEW", "CONTACTED")).toBe(true);
    expect(canTransitionLeadStatus("CONTACTED", "QUALIFIED")).toBe(true);
    expect(canTransitionLeadStatus("QUALIFIED", "NEGOTIATION")).toBe(true);
    expect(canTransitionLeadStatus("NEGOTIATION", "ORDER_CONFIRMED")).toBe(true);
    expect(canTransitionLeadStatus("ORDER_CONFIRMED", "COMPLETED")).toBe(true);
  });

  it("allows LOST from every non-terminal state", () => {
    for (const from of ["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATION", "ORDER_CONFIRMED"] as const) {
      expect(canTransitionLeadStatus(from, "LOST")).toBe(true);
      expect(leadStatusTransitions(from)).toContain("LOST");
    }
    expect(leadStatusTransitions("COMPLETED")).toEqual([]);
    expect(leadStatusTransitions("LOST")).toEqual([]);
  });

  it("refuses any transition that skips a step or leaves a terminal state", () => {
    expect(canTransitionLeadStatus("NEW", "QUALIFIED")).toBe(false);
    expect(canTransitionLeadStatus("NEW", "COMPLETED")).toBe(false);
    expect(canTransitionLeadStatus("CONTACTED", "NEGOTIATION")).toBe(false);
    expect(canTransitionLeadStatus("COMPLETED", "LOST")).toBe(false);
    expect(canTransitionLeadStatus("COMPLETED", "NEW")).toBe(false);
    expect(canTransitionLeadStatus("LOST", "CONTACTED")).toBe(false);
    expect(canTransitionLeadStatus("ORDER_CONFIRMED", "QUALIFIED")).toBe(false);
  });

  it("lists the allowed targets for a state", () => {
    expect(leadStatusTransitions("NEW")).toEqual(["CONTACTED", "LOST"]);
    expect(leadStatusTransitions("NEGOTIATION")).toEqual(["ORDER_CONFIRMED", "LOST"]);
  });
});

describe("ResellerApplication state machine (doc 09 §3, contrat lot 5 §3)", () => {
  it("allows exactly the documented transitions", () => {
    expect(canTransitionResellerApplication("PENDING", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionResellerApplication("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionResellerApplication("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionResellerApplication("UNDER_REVIEW", "REJECTED")).toBe(true);
    expect(canTransitionResellerApplication("UNDER_REVIEW", "CANCELLED")).toBe(true);
  });

  it("refuses any unlisted transition (VALIDATION at the service level)", () => {
    expect(canTransitionResellerApplication("PENDING", "APPROVED")).toBe(false);
    expect(canTransitionResellerApplication("PENDING", "REJECTED")).toBe(false);
    expect(canTransitionResellerApplication("APPROVED", "CANCELLED")).toBe(false);
    expect(canTransitionResellerApplication("REJECTED", "UNDER_REVIEW")).toBe(false);
    expect(canTransitionResellerApplication("CANCELLED", "PENDING")).toBe(false);
    expect(resellerApplicationTransitions("APPROVED")).toEqual([]);
    expect(resellerApplicationTransitions("PENDING")).toEqual(["UNDER_REVIEW", "CANCELLED"]);
  });
});
