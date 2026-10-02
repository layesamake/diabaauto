/**
 * Cadre commun des écrans d'authentification : colonne unique centrée, adaptée au mobile d'abord.
 * Les pages concernées fournissent leur titre et leur formulaire.
 */

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="bg-[#f4f7fb] px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">{children}</div>
    </main>
  );
}
