import { describe, expect, it } from "vitest";
import { hasPermission } from "@/services/permissions.service";

describe("hasPermission", () => {
  it("denies by default for visitors and customers", () => {
    expect(hasPermission({ kind: "visitor" }, "vehicle.create")).toBe(false);
    expect(hasPermission({ kind: "customer" }, "vehicle.create")).toBe(false);
  });

  it("allows staff only when the permission code is present and account is active", () => {
    expect(hasPermission({ kind: "staff", active: true, permissions: ["vehicle.create"] }, "vehicle.create")).toBe(true);
    expect(hasPermission({ kind: "staff", active: false, permissions: ["vehicle.create"] }, "vehicle.create")).toBe(false);
  });
});
