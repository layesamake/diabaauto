import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  formatReservationReference,
  isValidReservationReference,
  MAX_RESERVATION_SEQUENCE,
  nextReservationReference,
  nextReservationSequence,
  RESERVATION_REFERENCE_PATTERN,
} from "@/lib/reservation-reference";

describe("reservation reference RES-YYYY-NNNNNN", () => {
  it("only accepts the canonical pattern", () => {
    expect(RESERVATION_REFERENCE_PATTERN.test("RES-2026-000001")).toBe(true);
    expect(isValidReservationReference("RES-2026-000001")).toBe(true);
    expect(isValidReservationReference("DBC-2026-000001")).toBe(false);
    expect(isValidReservationReference("LEAD-2026-000001")).toBe(false);
    expect(isValidReservationReference("RES-2026-1")).toBe(false);
    expect(isValidReservationReference("RES-2026-0000001")).toBe(false);
    expect(isValidReservationReference("res-2026-000001")).toBe(false);
  });

  it("formats a zero-padded six-digit sequence", () => {
    expect(formatReservationReference(2026, 1)).toBe("RES-2026-000001");
    expect(formatReservationReference(2026, 123456)).toBe("RES-2026-123456");
  });

  it("refuses an out-of-range year or sequence", () => {
    expect(() => formatReservationReference(1899, 1)).toThrowError(AppError);
    expect(() => formatReservationReference(2101, 1)).toThrowError(AppError);
    expect(() => formatReservationReference(2026, 0)).toThrowError(AppError);
    expect(() => formatReservationReference(2026, MAX_RESERVATION_SEQUENCE + 1)).toThrowError(AppError);
    expect(() => formatReservationReference(2026, 1.5)).toThrowError(AppError);
  });

  it("derives the next sequence from the existing references of the same year", () => {
    expect(nextReservationSequence(2026, [])).toBe(1);
    expect(nextReservationSequence(2026, ["RES-2026-000003", "RES-2026-000001"])).toBe(4);
    // References of another year are ignored.
    expect(nextReservationSequence(2026, ["RES-2025-000099"])).toBe(1);
    // A malformed suffix is ignored.
    expect(nextReservationSequence(2026, ["RES-2026-abc", "RES-2026-000005"])).toBe(6);
  });

  it("builds the full next reference", () => {
    expect(nextReservationReference(2026, [])).toBe("RES-2026-000001");
    expect(nextReservationReference(2026, ["RES-2026-000042"])).toBe("RES-2026-000043");
  });
});
