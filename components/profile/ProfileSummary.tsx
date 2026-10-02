import { displayFieldValue, profileFields, profileDisplayName } from "@/components/profile/profile-view";
import type { CustomerProfileView } from "@/services/profile.service";

/**
 * Résumé en lecture seule du profil personnel.
 * Aucune donnée non listée dans `CustomerProfileView` n'est affichée : le service a déjà projeté
 * explicitement les colonnes autorisées.
 */
export function ProfileSummary({ profile }: { profile: CustomerProfileView }) {
  const fields = profileFields(profile);

  return (
    <section aria-labelledby="profil-resume" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="profil-resume" className="text-lg font-semibold text-[#011D4F]">
        {profileDisplayName(profile)}
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id}>
            <dt className="text-sm font-medium text-[#011D4F]">{field.label}</dt>
            <dd className="mt-1 text-sm text-slate-700">{displayFieldValue(field.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
