import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  formatOrderReference,
  isValidOrderReference,
  MAX_ORDER_SEQUENCE,
  nextOrderReference,
  nextOrderSequence,
  ORDER_REFERENCE_PATTERN,
} from "@/lib/order-reference";

describe("order reference CMD-YYYY-NNNNNN", () => {
  it("only accepts the canonical pattern", () => {
    expect(ORDER_REFERENCE_PATTERN.test("CMD-2026-000001")).toBe(true);
    expect(isValidOrderReference("CMD-2026-000001")).toBe(true);
    expect(isValidOrderReference("DBC-2026-000001")).toBe(false);
    expect(isValidOrderReference("LEAD-2026-000001")).toBe(false);
    expect(isValidOrderReference("CMD-2026-1")).toBe(false);
    expect(isValidOrderReference("CMD-2026-0000001")).toBe(false);
    expect(isValidOrderReference("cmd-2026-000001")).toBe(false);
  });

  it("formats a zero-padded six-digit sequence", () => {
    expect(formatOrderReference(2026, 1)).toBe("CMD-2026-000001");
    expect(formatOrderReference(2026, 123456)).toBe("CMD-2026-123456");
  });

  it("refuses an out-of-range year or sequence", () => {
    expect(() => formatOrderReference(1899, 1)).toThrowError(AppError);
    expect(() => formatOrderReference(2101, 1)).toThrowError(AppError);
    expect(() => formatOrderReference(2026, 0)).toThrowError(AppError);
    expect(() => formatOrderReference(2026, MAX_ORDER_SEQUENCE + 1)).toThrowError(AppError);
    expect(() => formatOrderReference(2026, 1.5)).toThrowError(AppError);
  });

  it("derives the next sequence from the existing references of the same year", () => {
    expect(nextOrderSequence(2026, [])).toBe(1);
    expect(nextOrderSequence(2026, ["CMD-2026-000003", "CMD-2026-000001"])).toBe(4);
    expect(nextOrderSequence(2026, ["CMD-2025-000099"])).toBe(1);
    expect(nextOrderSequence(2026, ["CMD-2026-abc", "CMD-2026-000005"])).toBe(6);
  });

  it("builds the full next reference", () => {
    expect(nextOrderReference(2026, [])).toBe("CMD-2026-000001");
    expect(nextOrderReference(2026, ["CMD-2026-000042"])).toBe("CMD-2026-000043");
  });
});
