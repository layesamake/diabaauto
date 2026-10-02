import { describe, expect, it } from "vitest";
import { toStaffCustomerWhere } from "@/repositories/staff-customer.repository";

/**
 * Filtre de la liste « Clients ».
 *
 * Le trigger `on_auth_user_created` crée un `customer_profiles` pour **chaque** nouvel utilisateur
 * Auth, y compris un futur membre du personnel. Sans filtre sur `profile.user_type`, un
 * administrateur apparaîtrait dans la liste Clients. C'est le seul endroit qui l'en empêche : la
 * propriété est donc verrouillée ici.
 */

describe("toStaffCustomerWhere", () => {
  it("ne liste que les profils de type CUSTOMER", () => {
    expect(toStaffCustomerWhere()).toMatchObject({ profile: { userType: "CUSTOMER" } });
  });

  it("conserve le filtre de type en présence d'autres filtres", () => {
    expect(toStaffCustomerWhere({ segment: "FLEET" })).toMatchObject({
      profile: { userType: "CUSTOMER" },
      segment: "FLEET",
    });
    expect(toStaffCustomerWhere({ search: "Dakar" })).toMatchObject({
      profile: { userType: "CUSTOMER" },
    });
  });
});
