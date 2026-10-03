import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getCurrentActor } from "@/lib/auth/session";
import { requireStaff } from "@/services/access.service";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Enveloppe commune du back-office : la barre latérale, une seule fois pour tous les écrans.
 *
 * Elle remplace la navigation que chaque page portait dans son en-tête. Un écran ajouté plus tard
 * hérite de la navigation sans rien déclarer, et un lien n'est plus à corriger en quatorze endroits.
 *
 * Un acteur sans accès au back-office ne reçoit AUCUNE navigation : lui montrer la liste des écrans
 * refusés lui apprendrait l'organisation interne sans lui ouvrir quoi que ce soit. La page rend
 * alors seule son refus, avec sa propre garde — celle-ci ne protège rien, elle n'affiche.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getCurrentActor();

  let permissions: readonly PermissionCode[] = [];
  try {
    permissions = requireStaff(actor, "vehicle.view").permissions;
  } catch {
    permissions = [];
  }

  if (permissions.length === 0) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F9FD] md:flex-row">
      <AdminSidebar permissions={permissions} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
