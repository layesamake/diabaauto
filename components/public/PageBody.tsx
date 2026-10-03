import { parsePageBody } from "@/lib/site-pages/page-body";

/** Rendu d'un texte de page : éléments React uniquement, jamais de HTML injecté. */
export function PageBody({ body }: { body: string }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      {parsePageBody(body).map((block, index) => {
        if (block.type === "heading") {
          return (
            <h2 key={index} className="mt-4 text-xl font-semibold text-[#011D4F]">
              {block.text}
            </h2>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6 text-slate-700">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-line text-slate-700">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
