import Link from "next/link";
import type { VehicleStep, VehicleStepKey } from "@/services/vehicle-journey.service";

/**
 * Les quatre étapes d'une fiche véhicule.
 *
 * L'étape courante vit dans l'URL (`?etape=photos`) et non dans un état de composant : le lien est
 * partageable, la page reste rendue côté serveur, et le parcours fonctionne sans JavaScript. C'est
 * aussi ce qui permet à l'accueil d'envoyer directement sur l'étape qui bloque.
 *
 * Une étape faite porte une coche, une étape à faire son rang. La couleur ne porte jamais seule
 * l'information : chaque état a sa forme et son résumé écrit.
 */
export function VehicleSteps({
  steps,
  current,
  basePath,
}: {
  steps: readonly VehicleStep[];
  current: VehicleStepKey;
  basePath: string;
}) {
  return (
    <nav aria-label="Étapes de la fiche" className="rounded-xl border border-slate-200 bg-white p-2">
      <ol className="flex list-none flex-wrap gap-1.5 p-0">
        {steps.map((step) => {
          const actif = step.key === current;

          return (
            <li key={step.key} className="min-w-[160px] flex-[1_1_180px]">
              <Link
                href={`${basePath}?etape=${step.key}`}
                aria-current={actif ? "step" : undefined}
                className={`flex h-full items-center gap-3 rounded-lg px-3.5 py-3 no-underline ${
                  actif ? "bg-[#E8F1FD]" : "hover:bg-slate-50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-bold ${
                    step.done
                      ? "bg-[#0F7B4F] text-white"
                      : actif
                        ? "bg-[#0063DF] text-white"
                        : "border border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {step.done ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-[15px] w-[15px]"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    step.position
                  )}
                </span>

                <span className="min-w-0">
                  <span className={`block text-sm ${actif ? "font-bold" : "font-semibold"} text-[#011D4F]`}>
                    {step.position}. {step.label}
                    <span className="sr-only">{step.done ? " — terminée" : " — à faire"}</span>
                  </span>
                  <span className="block text-xs text-slate-600">{step.summary}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
