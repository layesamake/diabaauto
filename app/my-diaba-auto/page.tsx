import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileSummary } from "@/components/profile/ProfileSummary";
import {
  ProfileUnavailableNotice,
  StaffAreaNotice,
  SuspendedAccountNotice,
} from "@/components/profile/ProfileNotices";
import { ResellerStatusBadge } from "@/components/profile/ResellerStatusBadge";
import { FavoritesList, type FavoritesListItem } from "@/components/profile/FavoritesList";
import { SavedSearchesList } from "@/components/profile/SavedSearchesList";
import { CustomRequestsList } from "@/components/profile/CustomRequestsList";
import { FavoritesMergeOnLogin } from "@/components/profile/FavoritesMergeOnLogin";
import { getCurrentActor } from "@/lib/auth/session";
import { createCustomerRepository } from "@/repositories/customer.repository";
import { createFavoriteRepository } from "@/repositories/favorite.repository";
import { readOwnCustomerProfile, type CustomerProfileView } from "@/services/profile.service";
import { listOwnFavorites } from "@/services/favorite.service";
import { listOwnSavedSearches } from "@/services/saved-search.service";
import { listOwnCustomRequests } from "@/services/custom-request.service";
import { listVehiclesByIds } from "@/services/catalogue.service";
import { logoutAction, updateProfileAction } from "./actions";

/**
 * My Diaba Auto — tableau de bord du client.
 * `force-dynamic` garantit qu'aucune version privée n'est générée statiquement ni mise en cache :
 * le contenu dépend de la session, jamais d'un cache partagé (dev.md §9).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Diaba Auto — Espace personnel",
  description: "Espace personnel Diaba Auto : profil, statut Revendeur et déconnexion.",
  // Doc 18 — les espaces privés sont exclus de l'indexation. Le contrôle d'accès reste la garde réelle.
  robots: { index: false, follow: false, nocache: true },
};

export default async function MyDiabaAutoPage() {
  const actor = await getCurrentActor();

  if (actor.kind === "visitor") {
    // Aucune donnée privée n'est rendue pour un visiteur : redirection vers la connexion.
    redirect("/connexion?suivant=%2Fmy-diaba-auto");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#011D4F]">My Diaba Auto</h1>
          <p className="mt-2 text-slate-600">Profil personnel et statut du compte.</p>
        </div>
        <LogoutButton action={logoutAction} />
      </div>

      <div className="mt-8 grid gap-6">
        {actor.kind === "suspended" ? <SuspendedAccountNotice /> : null}
        {actor.kind === "staff" ? <StaffAreaNotice /> : null}
        {actor.kind === "customer" ? <CustomerDashboard /> : null}
      </div>
    </main>
  );
}

/** Le service projette explicitement les colonnes autorisées ; la page ne lit rien d'autre. */
async function CustomerDashboard() {
  const actor = await getCurrentActor();

  let profile: CustomerProfileView;
  try {
    profile = await readOwnCustomerProfile(createCustomerRepository(), actor);
  } catch {
    return <ProfileUnavailableNotice />;
  }

  return (
    <>
      {/* Fusionne une seule fois les favoris locaux (visiteur) dans le compte après connexion
          (T34) : effet client, idempotent, ne bloque jamais le rendu du tableau de bord. */}
      <FavoritesMergeOnLogin />

      <ProfileSummary profile={profile} />
      <section aria-labelledby="profil-statut" className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 id="profil-statut" className="text-lg font-semibold text-[#011D4F]">
          Statut Revendeur
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Ce statut est attribué et modifié par Diaba Auto. Il n&apos;est pas modifiable depuis cet espace.
        </p>
        <div className="mt-4">
          <ResellerStatusBadge status={profile.resellerStatus} />
        </div>
      </section>
      <ProfileForm profile={profile} action={updateProfileAction} />

      <FavoritesSection />
      <SavedSearchesSection />
      <CustomRequestsSection />
    </>
  );
}

/**
 * Favoris du client : le repository ne porte que `favorite_vehicles` (contrat §Sous-agent A), cette
 * section assemble donc la liste avec une lecture catalogue (`listVehiclesByIds`) — intégration
 * prévue au contrat §3.4. Une erreur de lecture n'empêche jamais l'affichage du reste du tableau de
 * bord : elle retombe sur une liste vide plutôt que de faire échouer toute la page.
 */
async function FavoritesSection() {
  const actor = await getCurrentActor();

  let items: FavoritesListItem[] = [];
  try {
    const favorites = await listOwnFavorites(createFavoriteRepository(), actor);
    const vehicles = await listVehiclesByIds(actor, favorites.map((favorite) => favorite.vehicleId));
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    items = favorites.map((favorite) => {
      const vehicle = vehicleById.get(favorite.vehicleId);
      return {
        vehicleId: favorite.vehicleId,
        addedAt: favorite.addedAt,
        vehicle: vehicle
          ? {
              slug: vehicle.slug,
              title: vehicle.title,
              brandName: vehicle.brandName,
              modelName: vehicle.modelName,
              year: vehicle.year,
              imageUrl: vehicle.primaryImage?.url ?? null,
            }
          : null,
      };
    });
  } catch {
    items = [];
  }

  return <FavoritesList items={items} />;
}

async function SavedSearchesSection() {
  const actor = await getCurrentActor();

  try {
    const searches = await listOwnSavedSearches(actor);
    return <SavedSearchesList searches={searches} />;
  } catch {
    return <SavedSearchesList searches={[]} />;
  }
}

async function CustomRequestsSection() {
  const actor = await getCurrentActor();

  try {
    const requests = await listOwnCustomRequests(actor);
    return <CustomRequestsList requests={requests} />;
  } catch {
    return <CustomRequestsList requests={[]} />;
  }
}
