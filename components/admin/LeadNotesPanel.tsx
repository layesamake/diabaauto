"use client";

import { addLeadNoteAction } from "@/app/admin/prospects/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminTextareaField } from "@/components/admin/AdminFields";
import { formatDateTime } from "@/components/admin/admin-view";
import { leadMessages as msg } from "@/lib/i18n/leads.fr";
import type { LeadNoteView } from "@/services/lead.service";

/**
 * Journal privé d'un prospect (`lead_notes`).
 *
 * Liste chronologique et ajout d'une note. Une note appartient à son auteur et reste interne à
 * Diaba Auto : aucune donnée n'est exposée hors personnel. La permission `lead.update` est
 * revérifiée par le service.
 */
export function LeadNotesPanel({
  leadId,
  notes,
  canUpdate,
}: {
  leadId: string;
  notes: LeadNoteView[];
  canUpdate: boolean;
}) {
  return (
    <section aria-labelledby="lead-notes" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="lead-notes" className="text-lg font-semibold text-[#011D4F]">
        {msg.notes.title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{msg.notes.intro}</p>

      {canUpdate ? (
        <AdminForm
          action={addLeadNoteAction}
          submitLabel={msg.notes.submit}
          pendingLabel={msg.notes.pending}
          resetOnSuccess
          className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-[#f9fafc] p-4"
        >
          <input type="hidden" name="leadId" value={leadId} />
          <AdminTextareaField
            id="lead-note-content"
            name="content"
            label={msg.notes.addLabel}
            placeholder={msg.notes.addPlaceholder}
            hint={msg.notes.addHint}
            required
          />
        </AdminForm>
      ) : (
        <p className="mt-4 text-sm text-slate-600">{msg.notes.readOnly}</p>
      )}

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{msg.notes.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">
                {formatDateTime(note.createdAt)} — auteur {note.authorId}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-[#071525]">{note.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
