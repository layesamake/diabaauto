import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  formatLeadReference,
  isValidLeadReference,
  LEAD_REFERENCE_PATTERN,
  MAX_LEAD_SEQUENCE,
  nextLeadReference,
  nextLeadSequence,
} from "@/lib/lead-reference";

describe("lead reference LEAD-YYYY-NNNNNN", () => {
  it("only accepts the canonical pattern", () => {
    expect(LEAD_REFERENCE_PATTERN.test("LEAD-2026-000001")).toBe(true);
    expect(isValidLeadReference("LEAD-2026-000001")).toBe(true);
    expect(isValidLeadReference("DBC-2026-000001")).toBe(false);
    expect(isValidLeadReference("LEAD-2026-1")).toBe(false);
    expect(isValidLeadReference("LEAD-2026-0000001")).toBe(false);
    expect(isValidLeadReference("lead-2026-000001")).toBe(false);
  });

  it("formats a zero-padded six-digit sequence", () => {
    expect(formatLeadReference(2026, 1)).toBe("LEAD-2026-000001");
    expect(formatLeadReference(2026, 123456)).toBe("LEAD-2026-123456");
  });

  it("refuses an out-of-range year or sequence", () => {
    expect(() => formatLeadReference(1899, 1)).toThrowError(AppError);
    expect(() => formatLeadReference(2101, 1)).toThrowError(AppError);
    expect(() => formatLeadReference(2026, 0)).toThrowError(AppError);
    expect(() => formatLeadReference(2026, MAX_LEAD_SEQUENCE + 1)).toThrowError(AppError);
    expect(() => formatLeadReference(2026, 1.5)).toThrowError(AppError);
  });

  it("derives the next sequence from the existing references of the same year", () => {
    expect(nextLeadSequence(2026, [])).toBe(1);
    expect(nextLeadSequence(2026, ["LEAD-2026-000003", "LEAD-2026-000001"])).toBe(4);
    // References of another year are ignored.
    expect(nextLeadSequence(2026, ["LEAD-2025-000099"])).toBe(1);
    // A malformed suffix is ignored.
    expect(nextLeadSequence(2026, ["LEAD-2026-abc", "LEAD-2026-000005"])).toBe(6);
  });

  it("builds the full next reference", () => {
    expect(nextLeadReference(2026, [])).toBe("LEAD-2026-000001");
    expect(nextLeadReference(2026, ["LEAD-2026-000042"])).toBe("LEAD-2026-000043");
  });
});
