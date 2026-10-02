import { describe, expect, it } from "vitest";
import { resolveVehiclePrice } from "@/services/pricing.service";

/**
 * Forme HISTORIQUE `{ publicPrice, resellerPrice, currency }` : elle ne porte aucune ligne de prix,
 * le transport y vaut donc toujours `null` (contrat lot 3 §A.4). Les assertions d'égalité stricte
 * incluent ce champ.
 */
describe("resolveVehiclePrice", () => {
  const vehicle = { publicPrice: "12000000.00", resellerPrice: "11000000.00", currency: "XOF" };

  it("returns standard price for visitors and standard customers", () => {
    expect(resolveVehiclePrice(vehicle, { kind: "visitor" })).toEqual({ amount: "12000000.00", transportAmount: null, currency: "XOF", priceType: "STANDARD" });
    expect(resolveVehiclePrice(vehicle, { kind: "customer", resellerStatus: "NOT_APPLICABLE" })).toEqual({ amount: "12000000.00", transportAmount: null, currency: "XOF", priceType: "STANDARD" });
  });

  it("returns reseller price only for approved active resellers", () => {
    expect(resolveVehiclePrice(vehicle, { kind: "customer", resellerStatus: "APPROVED" })).toEqual({ amount: "11000000.00", transportAmount: null, currency: "XOF", priceType: "RESELLER" });
  });

  it("falls back to standard price when reseller price is missing", () => {
    expect(resolveVehiclePrice({ publicPrice: "12000000.00", resellerPrice: null, currency: "XOF" }, { kind: "customer", resellerStatus: "APPROVED" })).toEqual({ amount: "12000000.00", transportAmount: null, currency: "XOF", priceType: "STANDARD", anomaly: "MISSING_RESELLER_PRICE" });
  });
});
