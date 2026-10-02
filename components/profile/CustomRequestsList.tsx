/**
 * Liste des demandes personnalisées du client connecté (contrat lot 4 §2 Sous-agent C).
 *
 * Section autonome pour `app/my-diaba-auto/page.tsx` : câblée par l'orchestrateur (contrat §3.4),
 * ce composant n'est pas importé par ce lot. Aucune donnée de contact n'est affichée : le service
 * ne les projette jamais dans `CustomRequestView`.
 */
import { customRequestMessages as msg } from "@/lib/i18n/custom-request.fr";
import type { CustomRequestView } from "@/services/custom-request.service";

function formatCriteria(criteria: CustomRequestView["criteria"]): string {
  const parts = [criteria.brand, criteria.model].filter((value): value is string => Boolean(value));
  if (parts.length > 0) {
    return parts.join(" ");
  }

  return criteria.notes ?? "Critères non précisés";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

export function CustomRequestsList({ requests }: { requests: CustomRequestView[] }) {
  return (
    <section aria-labelledby="demandes-personnalisees" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="demandes-personnalisees" className="text-lg font-semibold text-[#011D4F]">
        {msg.list.title}
      </h2>

      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">{msg.list.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-[#011D4F]">{formatCriteria(request.criteria)}</p>
              {request.criteria.notes && (request.criteria.brand || request.criteria.model) ? (
                <p className="mt-1 text-sm text-slate-600">{request.criteria.notes}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                {msg.list.budgetRange(request.budgetMin, request.budgetMax)}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{msg.list.status[request.status] ?? request.status}</span>
                <span>{formatDate(request.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
