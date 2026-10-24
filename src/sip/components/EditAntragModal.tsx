import React, { useState } from 'react';
import { X, Check, Edit3, Trash2 } from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, AntragType, SipAntrag } from '../types';

interface EditAntragModalProps {
  antrag: SipAntrag;
  onClose: () => void;
  onSave: (antragId: string, updates: Partial<SipAntrag>) => void;
  onDelete: (antragId: string) => void;
}

export const EditAntragModal: React.FC<EditAntragModalProps> = ({
  antrag,
  onClose,
  onSave,
  onDelete,
}) => {
  const [type, setType] = useState<AntragType>(antrag.type);
  const [title, setTitle] = useState(antrag.title);
  const [lineOrParagraph, setLineOrParagraph] = useState(antrag.lineOrParagraph || '');
  const [content, setContent] = useState(antrag.content);
  const [adminNotes, setAdminNotes] = useState(antrag.adminNotes || '');
  const [status, setStatus] = useState(antrag.status);
  const [claimedBy, setClaimedBy] = useState(antrag.claimedBy || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(antrag.id, {
      type,
      title: title.trim(),
      lineOrParagraph: lineOrParagraph.trim() || undefined,
      content: content.trim(),
      adminNotes: adminNotes.trim() || undefined,
      status,
      claimedBy: claimedBy.trim() || null,
      claimedAt: claimedBy.trim() ? antrag.claimedAt || new Date().toISOString() : null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Antrag bearbeiten (Strategieführung)</h2>
              <p className="text-xs text-slate-400">
                Eingereicht von: {antrag.author}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Antragstyp
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AntragType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
              >
                {(Object.keys(ANTRAG_TYPE_CONFIG) as AntragType[]).map((t) => (
                  <option key={t} value={t}>
                    {ANTRAG_TYPE_CONFIG[t].shortLabel} - {ANTRAG_TYPE_CONFIG[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Freigabe-Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="approved">Freigegeben (im Plenum sichtbar)</option>
                <option value="pending_approval">Wartet auf Prüfung (Pending)</option>
                <option value="rejected">Abgelehnt</option>
                <option value="completed">Abgeschlossen</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Bezug (Zeile, Absatz, TOP)
            </label>
            <input
              type="text"
              value={lineOrParagraph}
              onChange={(e) => setLineOrParagraph(e.target.value)}
              placeholder="z.B. Zeile 45-48"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Titel des Antrags
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Antragstext / Formulierung (redaktionell anpassen)
            </label>
            <textarea
              required
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Geclaimed durch (Redner:in zuweisen oder leeren)
            </label>
            <input
              type="text"
              value={claimedBy}
              onChange={(e) => setClaimedBy(e.target.value)}
              placeholder="Name der Person oder leer lassen"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Interne Strategienotiz zu diesem Antrag (nur Führung)
            </label>
            <input
              type="text"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="z.B. Nur einbringen wenn Fraktion X dagegen stimmt"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                if (confirm('Möchtest du diesen Antrag wirklich löschen?')) {
                  onDelete(antrag.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Löschen</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Änderungen speichern</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
