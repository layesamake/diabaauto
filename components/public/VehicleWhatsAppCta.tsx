import { readContactConfig } from "@/lib/config/contact";
import { absoluteUrl } from "@/lib/seo";
import { buildVehicleWhatsAppUrl } from "@/lib/whatsapp";
import { fr } from "@/lib/i18n";

/**
 * CTA WhatsApp d'une fiche véhicule (BR-120/BR-121/BR-123).
 *
 * - le numéro est lu depuis l'environnement (`readContactConfig`), jamais écrit en dur ;
 * - le lien est masqué si le numéro est inexploitable (`buildVehicleWhatsAppUrl` → `null`), plutôt
 *   que d'exposer un lien cassé ;
 * - le message reste une demande d'information : il n'est jamais présenté comme un devis.
 */
export function VehicleWhatsAppCta({
  title,
  reference,
  slug,
  priceLabel,
}: {
  title: string;
  reference: string;
  slug: string;
  priceLabel: string | null;
}) {
  const { whatsappNumber } = readContactConfig();
  const url = buildVehicleWhatsAppUrl({
    whatsappNumber,
    title,
    reference,
    url: absoluteUrl(`/voitures/${slug}`),
    priceLabel,
  });

  if (!url) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-[#0063DF] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#0354A3]"
      >
        {fr.vehicle.whatsappCta}
      </a>
      <p className="text-xs text-slate-500">{fr.vehicle.whatsappNote}</p>
    </div>
  );
}