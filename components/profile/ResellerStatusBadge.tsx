import { describeResellerStatus } from "@/components/profile/profile-view";

const toneClasses: Record<string, string> = {
  NOT_APPLICABLE: "bg-[#f4f7fb] text-[#011D4F] border-slate-200",
  PENDING: "bg-[#e8f4ff] text-[#0354A3] border-[#b8ddff]",
  APPROVED: "bg-[#e6f9f1] text-[#036b4b] border-[#b4e6d2]",
  REJECTED: "bg-[#fdf1f1] text-[#95312a] border-[#f3cfcb]",
  SUSPENDED: "bg-[#fdf6e6] text-[#7a5310] border-[#f0dcae]",
};

/**
 * Statut Revendeur en lecture seule. Le libellé est purement descriptif : aucune promesse
 * commerciale ni aucune condition tarifaire n'est affichée (dev.md §5 et §8).
 */
export function ResellerStatusBadge({ status }: { status: string }) {
  const view = describeResellerStatus(status);
  const tone = toneClasses[status] ?? "bg-[#f4f7fb] text-[#011D4F] border-slate-200";

  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <p className="text-sm font-semibold">{view.label}</p>
      <p className="mt-1 text-sm">{view.description}</p>
    </div>
  );
}
