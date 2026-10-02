import { describe, expect, it } from "vitest";
import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
  parsePasswordChangeInput,
  PasswordChangeValidationError,
} from "@/lib/auth/password-policy";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

const valid = {
  currentPassword: "AncienMotDePasse!1",
  newPassword: "NouveauMotDePasse!2",
  confirmPassword: "NouveauMotDePasse!2",
};

describe("parsePasswordChangeInput", () => {
  it("accepts a well-formed change and never returns the confirmation field", () => {
    const parsed = parsePasswordChangeInput(form(valid));

    expect(parsed).toEqual({
      currentPassword: "AncienMotDePasse!1",
      newPassword: "NouveauMotDePasse!2",
    });
    expect("confirmPassword" in parsed).toBe(false);
  });

  it("never reads an unknown field sent by the browser", () => {
    const parsed = parsePasswordChangeInput(
      form({ ...valid, userType: "STAFF", roleId: "00000000-0000-0000-0000-000000000000" }),
    );

    // Les champs inconnus sont IGNORÉS (seuls les trois champs connus sont lus), jamais transmis :
    // c'est la propriété attendue, identique aux actions d'authentification.
    expect(parsed).toEqual({
      currentPassword: "AncienMotDePasse!1",
      newPassword: "NouveauMotDePasse!2",
    });
    expect(Object.keys(parsed).sort()).toEqual(["currentPassword", "newPassword"]);
  });

  it("rejects a new password shorter than the minimum, naming only the field", () => {
    try {
      parsePasswordChangeInput(form({ ...valid, newPassword: "court", confirmPassword: "court" }));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordChangeValidationError);
      const validation = error as PasswordChangeValidationError;
      expect(validation.fields).toContain("newPassword");
      expect(validation.message).not.toContain("court");
    }
  });

  it("rejects a mismatched confirmation, naming only the field", () => {
    try {
      parsePasswordChangeInput(form({ ...valid, confirmPassword: "AutreMotDePasse!3" }));
      throw new Error("should have thrown");
    } catch (error) {
      const validation = error as PasswordChangeValidationError;
      expect(validation.message).toBe(PASSWORD_MISMATCH_MESSAGE);
      expect(validation.fields).toEqual(["confirmPassword"]);
    }
  });

  it("rejects a blank current password without echoing it", () => {
    try {
      parsePasswordChangeInput(form({ ...valid, currentPassword: "   " }));
      throw new Error("should have thrown");
    } catch (error) {
      const validation = error as PasswordChangeValidationError;
      expect(validation.message).toBe(CURRENT_PASSWORD_REQUIRED_MESSAGE);
      expect(validation.fields).toEqual(["currentPassword"]);
    }
  });

  it("rejects a missing field entirely", () => {
    expect(() => parsePasswordChangeInput(form({ currentPassword: "x", newPassword: "y" }))).toThrow(
      PasswordChangeValidationError,
    );
  });

  it("rejects a new password longer than the maximum", () => {
    const long = "a".repeat(201);
    expect(() =>
      parsePasswordChangeInput(form({ ...valid, newPassword: long, confirmPassword: long })),
    ).toThrow(PasswordChangeValidationError);
  });

  it("accepts a current password at the minimum length and does not trim it", () => {
    const parsed = parsePasswordChangeInput(form({ ...valid, currentPassword: " x " }));
    expect(parsed.currentPassword).toBe(" x ");
  });
});
