/**
 * Message d'état d'un formulaire (erreur, succès, information).
 *
 * La région reste montée dans le DOM même sans message : les lecteurs d'écran annoncent l'apparition
 * du texte. Les erreurs d'envoi utilisent `role="alert"`, les succès `role="status"`.
 * Le message ne contient jamais de détail interne ni de valeur saisie.
 */

export type StatusMessageProps = {
  tone: "error" | "success" | "info";
  message: string;
  id?: string;
};

const TONES: Record<StatusMessageProps["tone"], string> = {
  error: "border-[#f3c9c4] bg-[#fdf2f1] text-[#95312a]",
  success: "border-[#bfe3d0] bg-[#effaf3] text-[#036b4b]",
  info: "border-[#c7dcf7] bg-[#f0f6ff] text-[#0b2a5b]",
};

export function StatusMessage({ tone, message, id }: StatusMessageProps) {
  const toneClass = message.length > 0 ? `rounded-lg border px-3 py-2 text-sm ${TONES[tone]}` : "sr-only";

  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={toneClass}
    >
      {message}
    </div>
  );
}
