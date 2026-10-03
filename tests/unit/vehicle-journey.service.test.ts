import { describe, expect, it } from "vitest";
import { MAX_IMAGES_PER_VEHICLE } from "@/lib/media-constants";
import { publicationGaps } from "@/services/vehicle.service";
import {
  buildVehicleJourney,
  isVehicleStepKey,
  PUBLICATION_CONDITIONS,
  vehicleTodos,
  type JourneyInput,
} from "@/services/vehicle-journey.service";

/**
 * Parcours de la fiche véhicule.
 *
 * La propriété qui compte : **l'écran ne doit jamais annoncer « prêt » là où la publication
 * refuserait**. Les conditions viennent de `publicationGaps`, la fonction qu'applique réellement
 * `publishVehicle` ; ces tests vérifient qu'on ne s'en écarte pas, et que chaque étape ne répond
 * que de sa part des manques — sinon l'utilisateur ne sait pas où aller.
 */

const COMPLET: JourneyInput = {
  vehicle: {
    brandId: "b1",
    modelId: "m1",
    year: 2019,
    condition: "USED",
    logisticsLocation: "SENEGAL",
    isPublished: false,
  },
  media: [{ id: "md1", mediaType: "IMAGE", isPrimary: true, visibility: "PUBLIC" }],
  prices: [{ pricingProfile: "STANDARD", isActive: true }],
  imageCount: 3,
  videoCount: 0,
  maxImages: MAX_IMAGES_PER_VEHICLE,
};

function parcours(overrides: Partial<JourneyInput> = {}) {
  return buildVehicleJourney({ ...COMPLET, ...overrides });
}

function etape(input: Partial<JourneyInput>, key: string) {
  return parcours(input).steps.find((step) => step.key === key);
}

describe("parcours — les quatre étapes", () => {
  it("présente quatre étapes numérotées, dans l'ordre du travail", () => {
    expect(parcours().steps.map((step) => [step.position, step.key])).toEqual([
      [1, "informations"],
      [2, "photos"],
      [3, "prix"],
      [4, "mise-en-ligne"],
    ]);
  });

  it("déclare publiable un véhicule complet", () => {
    const journey = parcours();

    expect(journey.gaps).toEqual([]);
    expect(journey.canPublish).toBe(true);
    expect(etape({}, "mise-en-ligne")?.summary).toBe("Prêt à publier");
  });

  it("n'annonce jamais « prêt » quand la publication refuserait", () => {
    // Sans image principale publique, `publicationGaps` bloque : l'écran doit le dire.
    const journey = parcours({ media: [], imageCount: 0 });

    expect(journey.canPublish).toBe(false);
    expect(journey.gaps).toContain("média image principal public");
    expect(etape({ media: [], imageCount: 0 }, "mise-en-ligne")?.summary).not.toContain("Prêt");
  });
});

describe("parcours — chaque étape ne répond que de sa part", () => {
  it("impute l'image manquante aux Photos, et laisse Prix et Informations intactes", () => {
    const sansImage = { media: [], imageCount: 0 };

    expect(etape(sansImage, "photos")?.done).toBe(false);
    expect(etape(sansImage, "prix")?.done).toBe(true);
    expect(etape(sansImage, "informations")?.done).toBe(true);
  });

  it("impute le prix manquant aux Prix, et laisse Photos intacte", () => {
    const sansPrix = { prices: [] };

    expect(etape(sansPrix, "prix")?.done).toBe(false);
    expect(etape(sansPrix, "prix")?.summary).toBe("Aucun prix standard actif.");
    expect(etape(sansPrix, "photos")?.done).toBe(true);
  });

  it("impute un référentiel manquant aux Informations", () => {
    const sansMarque = { vehicle: { ...COMPLET.vehicle, brandId: "" } };

    expect(etape(sansMarque, "informations")?.done).toBe(false);
    expect(etape(sansMarque, "photos")?.done).toBe(true);
  });
});

describe("parcours — ce que disent les résumés", () => {
  it("compte les photos sur le plafond, et mentionne les vidéos s'il y en a", () => {
    expect(etape({ imageCount: 1, videoCount: 0 }, "photos")?.summary).toBe("1 photo sur 5");
    expect(etape({ imageCount: 4, videoCount: 2 }, "photos")?.summary).toBe("4 photos sur 5 · 2 vidéos");
  });

  it("dit clairement qu'aucune photo empêche la publication", () => {
    expect(etape({ media: [], imageCount: 0 }, "photos")?.summary).toContain("ne peut pas être publiée");
  });

  it("distingue « des photos, mais aucune principale » de « aucune photo »", () => {
    const avecPhotosNonPrincipales = {
      media: [{ id: "md1", mediaType: "IMAGE" as const, isPrimary: false, visibility: "PUBLIC" as const }],
      imageCount: 2,
    };

    expect(etape(avecPhotosNonPrincipales, "photos")?.summary).toContain("aucune n'est principale");
  });

  it("annonce « En ligne » pour un véhicule publié", () => {
    expect(etape({ vehicle: { ...COMPLET.vehicle, isPublished: true } }, "mise-en-ligne")?.summary).toBe(
      "En ligne dans le catalogue",
    );
  });

  it("chiffre les points bloquants restants", () => {
    expect(etape({ media: [], imageCount: 0, prices: [] }, "mise-en-ligne")?.summary).toBe(
      "2 points bloquants",
    );
  });
});

describe("parcours — étape ouverte par défaut", () => {
  it("ouvre là où le travail reste à faire", () => {
    expect(parcours({ media: [], imageCount: 0 }).defaultStep).toBe("photos");
    expect(parcours({ prices: [] }).defaultStep).toBe("prix");
    expect(parcours({ vehicle: { ...COMPLET.vehicle, brandId: "" } }).defaultStep).toBe("informations");
  });

  it("ouvre la mise en ligne quand tout est fait", () => {
    expect(parcours().defaultStep).toBe("mise-en-ligne");
    expect(parcours({ vehicle: { ...COMPLET.vehicle, isPublished: true } }).defaultStep).toBe(
      "mise-en-ligne",
    );
  });
});

describe("isVehicleStepKey", () => {
  it("accepte les quatre étapes et refuse tout le reste", () => {
    for (const key of ["informations", "photos", "prix", "mise-en-ligne"]) {
      expect(isVehicleStepKey(key), key).toBe(true);
    }

    for (const value of ["", "autre", "INFORMATIONS", 1, null, undefined, {}]) {
      expect(isVehicleStepKey(value), String(value)).toBe(false);
    }
  });
});


describe("conditions de publication — aucun manque ne doit échapper", () => {
  /** Un véhicule à qui TOUT manque : `publicationGaps` produit alors chacune de ses chaînes. */
  const tousLesManques = publicationGaps(
    { brandId: "", modelId: "", year: 0, condition: "" as never, logisticsLocation: "" as never },
    [],
    [],
  );

  it("rattache chaque manque possible à une condition affichée", () => {
    const couverts = new Set(PUBLICATION_CONDITIONS.flatMap((condition) => condition.gaps));

    for (const gap of tousLesManques) {
      // Un libellé renommé dans publicationGaps sans l'être ici afficherait « rempli » à tort.
      expect(couverts, `manque non rattaché : « ${gap} »`).toContain(gap);
    }
  });

  it("n'annonce aucune condition qui ne corresponde à un manque réel", () => {
    const possibles = new Set(tousLesManques);

    for (const condition of PUBLICATION_CONDITIONS) {
      for (const gap of condition.gaps) {
        expect(possibles, `condition sans manque correspondant : « ${gap} »`).toContain(gap);
      }
    }
  });

  it("envoie chaque condition vers une étape qui existe", () => {
    for (const condition of PUBLICATION_CONDITIONS) {
      expect(isVehicleStepKey(condition.step), condition.label).toBe(true);
    }
  });

  it("marque toutes les étapes inachevées quand tout manque", () => {
    const journey = buildVehicleJourney({
      ...COMPLET,
      vehicle: { ...COMPLET.vehicle, brandId: "", modelId: "" },
      media: [],
      prices: [],
      imageCount: 0,
    });

    expect(journey.steps.filter((step) => step.done)).toEqual([]);
    expect(journey.canPublish).toBe(false);
  });
});

describe("vehicleTodos — ce que montre la liste", () => {
  const complet = { ...COMPLET.vehicle, hasPrimaryImage: true, hasStandardPrice: true };

  it("ne propose rien pour un véhicule complet", () => {
    expect(vehicleTodos(complet)).toEqual([]);
  });

  it("nomme la photo manquante et mène à l'étape Photos", () => {
    expect(vehicleTodos({ ...complet, hasPrimaryImage: false })).toEqual([
      { label: "Ajouter une photo", step: "photos" },
    ]);
  });

  it("nomme le prix manquant et mène à l'étape Prix", () => {
    expect(vehicleTodos({ ...complet, hasStandardPrice: false })).toEqual([
      { label: "Fixer le prix", step: "prix" },
    ]);
  });

  it("liste photo puis prix quand les deux manquent, dans l'ordre des étapes", () => {
    expect(
      vehicleTodos({ ...complet, hasPrimaryImage: false, hasStandardPrice: false }).map((todo) => todo.step),
    ).toEqual(["photos", "prix"]);
  });

  it("ne contredit jamais la fiche : mêmes manques que buildVehicleJourney", () => {
    for (const hasPrimaryImage of [true, false]) {
      for (const hasStandardPrice of [true, false]) {
        const todos = vehicleTodos({ ...complet, hasPrimaryImage, hasStandardPrice });
        const journey = parcours({
          media: hasPrimaryImage
            ? [{ id: "md1", mediaType: "IMAGE", isPrimary: true, visibility: "PUBLIC" }]
            : [],
          prices: hasStandardPrice ? [{ pricingProfile: "STANDARD", isActive: true }] : [],
          imageCount: hasPrimaryImage ? 1 : 0,
        });

        expect(todos.length === 0, `${hasPrimaryImage}/${hasStandardPrice}`).toBe(journey.canPublish);
        for (const step of journey.steps.filter((item) => !item.done && item.key !== "mise-en-ligne")) {
          expect(todos.map((todo) => todo.step)).toContain(step.key);
        }
      }
    }
  });
});
