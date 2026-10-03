"use server";

import { revalidatePath } from "next/cache";
import { COMMERCIAL_STATUSES, REFERENTIAL_FORM_FIELDS } from "@/components/admin/admin-view";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import { addMedia, removeMedia, reorderMedia, setPrimaryMedia } from "@/services/media.service";
import {
  addImagesFromUrls,
  finalizeImageUploads,
  reoptimizeImage,
  requestImageUploads,
  type ReoptimizeResult,
  type UploadResult,
  type UploadTargets,
} from "@/services/image-upload.service";
import { setVehiclePrice } from "@/services/pricing.service";
import {
  createReferential,
  setReferentialActive,
  updateReferential,
  type ReferentialKind,
} from "@/services/referential.service";
import {
  archiveVehicle,
  changeCommercialStatus,
  createVehicle,
  publishVehicle,
  unpublishVehicle,
  updateVehicle,
  type VehicleCommercialStatus,
} from "@/services/vehicle.service";

/**
 * Server Actions du back-office (lot L2).
 *
 * Ordre imposé (dev.md §6) : la session est résolue côté serveur par `getCurrentActor()`, puis le
 * service correspondant applique, dans l'ordre, le statut du compte, la permission et les règles
 * métier. Les actions ne contiennent AUCUNE règle métier et ne lisent AUCUNE autorisation depuis le
 * formulaire : masquer un bouton ne protège rien, le service est le seul point d'entrée réel.
 *
 * Les identifiants de ressource (véhicule, média, référentiel) proviennent bien du formulaire, mais
 * ils ne servent qu'à désigner la cible : toute autorisation est vérifiée par le service, jamais
 * déduite de la valeur transmise.
 *
 * Réponses : enveloppe normalisée `data { message }` en succès (avec `redirectTo` facultatif, même
 * convention que les actions d'authentification) et `error { code, message, correlationId, fields? }`
 * en échec. Seuls des NOMS de champs seraient exposés, jamais une valeur transmise ni un détail
 * interne.
 */

export type AdminActionError = ErrorEnvelope["error"] & {
  /** Champs en cause lorsque le service en signale (aucun service L2 n'expose de champ nommé). */
  fields?: string[];
};

export type AdminActionState = { data: { message: string; redirectTo?: string } } | { error: AdminActionError };

const VEHICLE_LIST = "/admin/vehicules";
const VEHICLE_DETAIL_PATTERN = "/admin/vehicules/[id]";
const VEHICLE_CREATE = "/admin/vehicules/nouveau";
const REFERENTIAL_LIST = "/admin/referentiels";

// ---------------------------------------------------------------------------
// Lecture des entrées de formulaire (aucune règle métier : la validation est au service)
// ---------------------------------------------------------------------------

function failure(error: unknown, fields?: readonly string[]): AdminActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });

  if (fields && fields.length > 0) {
    return { error: { ...envelope.error, fields: [...fields] } };
  }

  return { error: envelope.error };
}

/** Chaîne présente : `undefined` si le champ est absent ou vide (champ omis du brouillon). */
function readString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Chaîne effaçable : vide ⇒ `null` (effacement explicite demandé à l'écran). */
function readNullableString(formData: FormData, name: string): string | null {
  return readString(formData, name) ?? null;
}

/** Identifiant de ressource cible : tel quel, vide si absent. La validité est tranchée par le service. */
function requiredText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, name: string): number | undefined {
  const raw = readString(formData, name);
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readNullableNumber(formData: FormData, name: string): number | null {
  const value = readNumber(formData, name);
  return value ?? null;
}

/** Sélecteur dont la valeur vide vaut « non renseigné » ; toute autre valeur est transmise telle quelle. */
function readNullableBoolean(formData: FormData, name: string): boolean | null {
  const raw = readString(formData, name);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function readCheckbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

// ---------------------------------------------------------------------------
// Véhicule — brouillons transmis aux services (§2bis)
// ---------------------------------------------------------------------------

function buildVehicleInput(formData: FormData): Record<string, unknown> {
  return {
    title: readString(formData, "title"),
    description: readNullableString(formData, "description"),
    slug: readString(formData, "slug"),
    brandId: readString(formData, "brandId"),
    modelId: readString(formData, "modelId"),
    generationId: readNullableString(formData, "generationId"),
    trimId: readNullableString(formData, "trimId"),
    condition: readString(formData, "condition"),
    year: readNumber(formData, "year"),
    firstRegistrationDate: readNullableString(formData, "firstRegistrationDate"),
    mileage: readNullableNumber(formData, "mileage"),
    previousOwners: readNullableNumber(formData, "previousOwners"),
    accidentKnown: readNullableBoolean(formData, "accidentKnown"),
    serviceHistoryAvailable: readNullableBoolean(formData, "serviceHistoryAvailable"),
    fuelTypeId: readString(formData, "fuelTypeId"),
    transmissionTypeId: readString(formData, "transmissionTypeId"),
    bodyTypeId: readString(formData, "bodyTypeId"),
    exteriorColorId: readNullableString(formData, "exteriorColorId"),
    interiorColorId: readNullableString(formData, "interiorColorId"),
    powerKw: readNullableNumber(formData, "powerKw"),
    powerHp: readNullableNumber(formData, "powerHp"),
    engineDisplacement: readNullableNumber(formData, "engineDisplacement"),
    doors: readNullableNumber(formData, "doors"),
    seats: readNullableNumber(formData, "seats"),
    supplierReference: readNullableString(formData, "supplierReference"),
    supplierName: readNullableString(formData, "supplierName"),
    sourceType: readNullableString(formData, "sourceType"),
    sourceUrl: readNullableString(formData, "sourceUrl"),
    logisticsLocation: readString(formData, "logisticsLocation"),
    featured: readCheckbox(formData, "featured"),
  };
}

/** Statut commercial : seules les valeurs du schéma figé sont transmises au service. */
function readCommercialStatus(formData: FormData): VehicleCommercialStatus {
  const raw = readString(formData, "status") ?? "";
  const status = COMMERCIAL_STATUSES.find((value) => value === raw);
  if (!status) {
    throw new AppError("VALIDATION", "Statut commercial invalide.");
  }

  return status;
}

/** Création d'un véhicule : référence et slug sont attribués par le serveur, jamais par le formulaire. */
export async function createVehicleAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const created = await createVehicle(actor, buildVehicleInput(formData));
    revalidatePath(VEHICLE_LIST);
    return ok({
      message: `Véhicule ${created.reference} créé.`,
      redirectTo: `${VEHICLE_LIST}/${created.id}`,
    });
  } catch (error) {
    return failure(error);
  }
}

/** Modification d'un véhicule ; seuls les champs fournis sont modifiés (service partiel). */
export async function updateVehicleAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    await updateVehicle(actor, vehicleId, buildVehicleInput(formData));
    revalidatePath(VEHICLE_LIST);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Véhicule enregistré." });
  } catch (error) {
    return failure(error);
  }
}

export async function publishVehicleAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    await publishVehicle(actor, vehicleId, readString(formData, "reason") ?? null);
    revalidatePath(VEHICLE_LIST);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Véhicule publié." });
  } catch (error) {
    return failure(error);
  }
}

export async function unpublishVehicleAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    await unpublishVehicle(actor, vehicleId, readString(formData, "reason") ?? null);
    revalidatePath(VEHICLE_LIST);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Véhicule dépublié." });
  } catch (error) {
    return failure(error);
  }
}

export async function archiveVehicleAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    await archiveVehicle(actor, vehicleId, readString(formData, "reason") ?? null);
    revalidatePath(VEHICLE_LIST);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Véhicule archivé." });
  } catch (error) {
    return failure(error);
  }
}

/** Transition commerciale hors archivage : l'archivage passe par `archiveVehicleAction`. */
export async function changeCommercialStatusAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    const status = readCommercialStatus(formData);
    await changeCommercialStatus(actor, vehicleId, status, readString(formData, "reason") ?? null);
    revalidatePath(VEHICLE_LIST);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Statut commercial mis à jour." });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Médias
// ---------------------------------------------------------------------------

function buildMediaInput(formData: FormData): Record<string, unknown> {
  return {
    mediaType: readString(formData, "mediaType"),
    storagePath: readNullableString(formData, "storagePath"),
    externalUrl: readNullableString(formData, "externalUrl"),
    thumbnailPath: readNullableString(formData, "thumbnailPath"),
    category: readNullableString(formData, "category"),
    visibility: readString(formData, "visibility"),
  };
}

/** Ajout d'un média : image par `storagePath` déjà déposé, vidéo par `externalUrl` (contrat §2.4). */
export async function addMediaAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    await addMedia(actor, vehicleId, buildMediaInput(formData));
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Média ajouté." });
  } catch (error) {
    return failure(error);
  }
}

export async function removeMediaAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const mediaId = requiredText(formData, "mediaId");

  try {
    await removeMedia(actor, mediaId);
    // Toutes les fiches véhicule peuvent être concernées : le véhicule du média n'est pas transmis.
    revalidatePath(VEHICLE_DETAIL_PATTERN, "page");
    return ok({ message: "Média supprimé." });
  } catch (error) {
    return failure(error);
  }
}

export async function setPrimaryMediaAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const mediaId = requiredText(formData, "mediaId");

  try {
    await setPrimaryMedia(actor, mediaId);
    revalidatePath(VEHICLE_DETAIL_PATTERN, "page");
    return ok({ message: "Média principal désigné." });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Images : envoi direct vers le stockage, puis optimisation côté serveur
// ---------------------------------------------------------------------------
//
// Aucun fichier ne transite par ces actions : les Server Actions ont une limite de corps de requête
// (1 Mo par défaut dans Next.js, environ 4,5 Mo sur Vercel) bien inférieure au poids d'une photo.
// Le navigateur dépose le fichier directement dans le bucket via une cible signée, puis demande au
// serveur de le finaliser (optimisation, enregistrement, suppression du fichier temporaire).

export type ImageUploadTargetsState = { data: UploadTargets } | { error: AdminActionError };
export type ImageResultsState =
  | { data: { message: string; results: UploadResult[] } }
  | { error: AdminActionError };
export type ReoptimizeActionState =
  | { data: { message: string; result: ReoptimizeResult } }
  | { error: AdminActionError };

/** Compat : ancien nom du type de retour de l'upload groupé. */
export type UploadActionState = ImageResultsState;

function resultsMessage(results: UploadResult[]): string {
  const successCount = results.filter((result) => result.ok).length;
  return successCount === results.length
    ? `${successCount} image(s) ajoutée(s).`
    : `${successCount} / ${results.length} image(s) ajoutée(s). Certaines ont échoué.`;
}

/** Étape 1 : obtient des cibles d'envoi signées pour `count` fichiers. */
export async function requestImageUploadsAction(formData: FormData): Promise<ImageUploadTargetsState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");
  const count = Number.parseInt(readString(formData, "count") ?? "", 10);

  if (!Number.isInteger(count) || count < 1) {
    return { error: { code: "VALIDATION", message: "Aucune image fournie." } };
  }

  try {
    return { data: await requestImageUploads(actor, vehicleId, count) };
  } catch (error) {
    return failure(error) as { error: AdminActionError };
  }
}

/** Étape 3 : optimise et enregistre les fichiers déposés. `items` : JSON `[{ path, name }]`. */
export async function finalizeImageUploadsAction(formData: FormData): Promise<ImageResultsState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");
  const rawItems = requiredText(formData, "items");

  let items: Array<{ path: string; name?: string }> = [];
  try {
    const parsed: unknown = JSON.parse(rawItems);
    if (Array.isArray(parsed)) {
      items = parsed
        .filter(
          (entry): entry is { path: string; name?: string } =>
            typeof entry === "object" && entry !== null && typeof (entry as { path?: unknown }).path === "string",
        )
        .map((entry) => ({
          path: entry.path,
          name: typeof entry.name === "string" ? entry.name : undefined,
        }));
    }
  } catch {
    return { error: { code: "VALIDATION", message: "Liste de fichiers invalide." } };
  }

  try {
    const results = await finalizeImageUploads(actor, vehicleId, items);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return { data: { message: resultsMessage(results), results } };
  } catch (error) {
    return failure(error) as { error: AdminActionError };
  }
}

/** Ajout d'images par URL (téléchargées côté serveur). `urls` : JSON array de chaînes. */
export async function addImageUrlsAction(formData: FormData): Promise<ImageResultsState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");
  const rawUrls = requiredText(formData, "urls");

  let urls: string[] = [];
  try {
    const parsed: unknown = JSON.parse(rawUrls);
    if (Array.isArray(parsed)) {
      urls = parsed.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
    }
  } catch {
    return { error: { code: "VALIDATION", message: "Format d'URLs invalide." } };
  }

  try {
    const results = await addImagesFromUrls(actor, vehicleId, urls);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return { data: { message: resultsMessage(results), results } };
  } catch (error) {
    return failure(error) as { error: AdminActionError };
  }
}

/** Repasse une image déjà enregistrée dans le pipeline d'optimisation. */
export async function reoptimizeMediaAction(formData: FormData): Promise<ReoptimizeActionState> {
  const actor = await getCurrentActor();
  const mediaId = requiredText(formData, "mediaId");

  try {
    const result = await reoptimizeImage(actor, mediaId);
    if (!result.ok) {
      return { error: { code: "VALIDATION", message: result.error } };
    }

    revalidatePath(VEHICLE_DETAIL_PATTERN, "page");
    return {
      data: {
        message: result.changed
          ? "Image ré-optimisée."
          : "Cette image est déjà optimisée : aucun gain à attendre.",
        result,
      },
    };
  } catch (error) {
    return failure(error) as { error: AdminActionError };
  }
}

/** Réordonne les médias d'un véhicule ; `orderedIds` est un JSON array d'identifiants. */
export async function reorderMediaAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");
  const rawIds = requiredText(formData, "orderedIds");

  try {
    const orderedIds: string[] = JSON.parse(rawIds);
    await reorderMedia(actor, vehicleId, orderedIds);
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Ordre des médias mis à jour." });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Prix
// ---------------------------------------------------------------------------

function buildPriceInput(formData: FormData): Record<string, unknown> {
  return {
    pricingProfile: readString(formData, "pricingProfile"),
    priceType: readString(formData, "priceType"),
    baseAmount: readString(formData, "baseAmount"),
    transportAmount: readNullableString(formData, "transportAmount"),
    currency: readString(formData, "currency"),
    validFrom: readNullableString(formData, "validFrom"),
    validTo: readNullableString(formData, "validTo"),
  };
}

/** Définition d'un prix. Règles Standard/Revendeur, transport et FX : lot L3, non développées ici. */
export async function setVehiclePriceAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const vehicleId = requiredText(formData, "vehicleId");

  try {
    await setVehiclePrice(actor, vehicleId, buildPriceInput(formData));
    revalidatePath(`${VEHICLE_LIST}/${vehicleId}`);
    return ok({ message: "Prix enregistré." });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Référentiels
// ---------------------------------------------------------------------------

function readReferentialKind(formData: FormData): ReferentialKind {
  const raw = readString(formData, "kind") ?? "";
  if ((REFERENTIAL_FORM_FIELDS as Record<string, unknown>)[raw] === undefined) {
    throw new AppError("VALIDATION", "Référentiel inconnu.");
  }

  return raw as ReferentialKind;
}

/**
 * Construit l'entrée d'un référentiel à partir des descripteurs de champ (source unique partagée avec
 * l'affichage). En modification, seuls les champs réellement présents dans le formulaire sont
 * transmis : les autres ne sont pas écrasés.
 */
function buildReferentialInput(
  kind: ReferentialKind,
  formData: FormData,
  mode: "create" | "update",
): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const field of REFERENTIAL_FORM_FIELDS[kind]) {
    if (mode === "update" && !formData.has(field.name)) {
      continue;
    }

    if (field.control === "checkbox") {
      input[field.name] = readCheckbox(formData, field.name);
      continue;
    }

    if (field.numeric) {
      input[field.name] = readNullableNumber(formData, field.name);
      continue;
    }

    if (field.nullable) {
      input[field.name] = readNullableString(formData, field.name);
      continue;
    }

    input[field.name] = readString(formData, field.name);
  }

  return input;
}

export async function createReferentialAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();

  try {
    const kind = readReferentialKind(formData);
    await createReferential(actor, kind, buildReferentialInput(kind, formData, "create"));
    revalidatePath(REFERENTIAL_LIST);
    revalidatePath(VEHICLE_CREATE);
    revalidatePath(VEHICLE_DETAIL_PATTERN, "page");
    return ok({ message: "Référentiel créé." });
  } catch (error) {
    return failure(error);
  }
}

export async function updateReferentialAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const id = requiredText(formData, "id");

  try {
    const kind = readReferentialKind(formData);
    await updateReferential(actor, kind, id, buildReferentialInput(kind, formData, "update"));
    revalidatePath(REFERENTIAL_LIST);
    return ok({ message: "Référentiel enregistré." });
  } catch (error) {
    return failure(error);
  }
}

/** Activation / désactivation : un référentiel utilisé ne se supprime pas, il se désactive (§2.5). */
export async function setReferentialActiveAction(formData: FormData): Promise<AdminActionState> {
  const actor = await getCurrentActor();
  const id = requiredText(formData, "id");
  const isActive = formData.get("isActive") === "true";

  try {
    const kind = readReferentialKind(formData);
    await setReferentialActive(actor, kind, id, isActive);
    revalidatePath(REFERENTIAL_LIST);
    return ok({ message: isActive ? "Élément activé." : "Élément désactivé." });
  } catch (error) {
    return failure(error);
  }
}
