import type { Metadata } from "next";
import { CustomRequestForm } from "@/components/public/CustomRequestForm";
import { getCurrentActor } from "@/lib/auth/session";
import { absoluteUrl } from "@/lib/seo";
import { createCustomerRepository } from "@/repositories/customer.repository";
import { customRequestMessages as msg } from "@/lib/i18n/custom-request.fr";
import { readOwnCustomerProfile } from "@/services/profile.service";

/**
 * `/commander` — Demande personnalisée (contrat lot 4 §2 Sous-agent C, CLAUDE.md §4).
 *
 * Accessible sans session. Si le client est connecté, les coordonnées sont pré-remplies en lecture
 * seule depuis le profil serveur (`readOwnCustomerProfile`) : aucun champ modifiable redondant avec
 * My Diaba Auto. La confirmation que la demande ne vaut ni réservation ni commande (CLAUDE.md §1) est
 * affichée de façon visible.
 *
 * `force-dynamic` : le contenu dépend de la session, jamais d'un cache partagé entre visiteurs et
 * clients (CLAUDE.md §9).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demande personnalisée — Diaba Auto",
  description:
    "Décrivez le véhicule que vous recherchez : Diaba Auto vous recontacte pour vous proposer une offre adaptée.",
  alternates: { canonical: absoluteUrl("/commander") },
};

export default async function CustomRequestPage() {
  const actor = await getCurrentActor();
  const isAuthenticated = actor.kind === "customer";

  let connectedContact: { name: string; phone: string | null } | undefined;
  if (isAuthenticated) {
    try {
      const profile = await readOwnCustomerProfile(createCustomerRepository(), actor);
      connectedContact = {
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        phone: profile.phone ?? profile.whatsapp ?? null,
      };
    } catch {
      // Profil indisponible : le formulaire reste utilisable, la Server Action revalidera l'acteur.
      connectedContact = undefined;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-[#011D4F]">{msg.pageTitle}</h1>
      <p className="mt-3 text-slate-600">{msg.pageIntro}</p>

      <p
        role="note"
        className="mt-4 rounded-lg border border-[#c7dcf7] bg-[#f0f6ff] px-3 py-2 text-sm text-[#0b2a5b]"
      >
        {msg.disclaimer}
      </p>

      <div className="mt-8">
        <CustomRequestForm isAuthenticated={isAuthenticated} connectedContact={connectedContact} />
      </div>
    </main>
  );
}
