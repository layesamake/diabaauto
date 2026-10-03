import { describe, expect, it } from "vitest";
import { REFERENTIAL_GROUPS, REFERENTIAL_PLURAL_LABELS } from "@/components/admin/referential-groups";
import { REFERENTIAL_SCREEN_ORDER } from "@/components/admin/admin-view";

/**
 * Regroupement des référentiels.
 *
 * Un référentiel qui n'est dans aucun groupe disparaît de l'écran sans erreur ; un référentiel dans
 * deux groupes s'affiche deux fois. Les deux défauts sont silencieux, d'où ce test.
 */

describe("groupes de référentiels", () => {
  const rangés = REFERENTIAL_GROUPS.flatMap((group) => [...group.kinds]);

  it("range chaque référentiel de l'écran dans un groupe", () => {
    for (const kind of REFERENTIAL_SCREEN_ORDER) {
      expect(rangés, kind).toContain(kind);
    }
  });

  it("n'en range aucun deux fois, et n'en invente aucun", () => {
    expect(new Set(rangés).size).toBe(rangés.length);
    expect([...rangés].sort()).toEqual([...REFERENTIAL_SCREEN_ORDER].sort());
  });

  it("donne un libellé pluriel à chaque référentiel", () => {
    for (const kind of REFERENTIAL_SCREEN_ORDER) {
      expect(REFERENTIAL_PLURAL_LABELS[kind]?.length, kind).toBeGreaterThan(2);
    }
  });

  it("décrit chaque groupe", () => {
    for (const group of REFERENTIAL_GROUPS) {
      expect(group.label.length).toBeGreaterThan(3);
      expect(group.hint.length).toBeGreaterThan(10);
    }
  });
});
