import type { Metadata } from "next";
import type { ReactNode } from "react";
import { formatPostalAddress, mailtoUrl, telUrl, whatsAppChatUrl } from "@/lib/contact-links";
import { getPublicContact } from "@/services/public-contact.service";

export const metadata: Metadata = {
  title: "Contact — Diaba Auto",
  description: "Joignez Diaba Auto par WhatsApp, téléphone ou e-mail.",
  alternates: { canonical: "/contact" },
};

/**
 * Page Contact : uniquement les coordonnées réellement enregistrées (back-office, sinon
 * environnement). Aucune coordonnée n'est inventée : un champ non renseigné n'est pas affiché.
 * Une demande de contact ne vaut ni réservation ni commande.
 */
export default async function ContactPage() {
  const contact = await getPublicContact();
  const whatsappUrl = whatsAppChatUrl(contact.whatsappNumber);
  const phoneUrl = contact.contactPhone ? telUrl(contact.contactPhone) : null;
  const emailUrl = contact.contactEmail ? mailtoUrl(contact.contactEmail) : null;
  const address = formatPostalAddress(contact);

  const linkClass = "font-semibold text-[#0063DF] underline-offset-2 hover:text-[#0354A3] hover:underline";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-[#011D4F]">Contact</h1>
      <p className="mt-3 text-slate-600">
        Une question sur un véhicule ou sur une commande ? Écrivez-nous : nous vous répondons dès que possible.
        Un message ne vaut ni réservation ni commande.
      </p>

      <ul className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
        <ContactCard title="WhatsApp">
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {contact.whatsappNumber}
              <span className="sr-only"> (ouvre WhatsApp)</span>
            </a>
          ) : (
            contact.whatsappNumber
          )}
        </ContactCard>

        {contact.contactPhone ? (
          <ContactCard title="Téléphone">
            {phoneUrl ? (
              <a href={phoneUrl} className={linkClass}>
                {contact.contactPhone}
              </a>
            ) : (
              contact.contactPhone
            )}
          </ContactCard>
        ) : null}

        {contact.contactEmail ? (
          <ContactCard title="E-mail">
            {emailUrl ? (
              <a href={emailUrl} className={`${linkClass} break-all`}>
                {contact.contactEmail}
              </a>
            ) : (
              contact.contactEmail
            )}
          </ContactCard>
        ) : null}

        {address ? <ContactCard title="Adresse">{address}</ContactCard> : null}
      </ul>
    </main>
  );
}

function ContactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-medium text-slate-600">{title}</h2>
      <p className="mt-1 text-lg text-[#011D4F]">{children}</p>
    </li>
  );
}
