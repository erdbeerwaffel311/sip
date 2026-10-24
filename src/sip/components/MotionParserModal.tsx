import React, { useState } from 'react';
import { X, Sparkles, CheckSquare, Square, FileText, Check, AlertCircle } from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, SipAntrag } from '../types';
import { convertParsedToSipAntraege, parseAntraegeFromText, ParsedRawAntrag } from '../sipParser';

interface MotionParserModalProps {
  onClose: () => void;
  onImport: (antraege: SipAntrag[]) => void;
}

export const MotionParserModal: React.FC<MotionParserModalProps> = ({
  onClose,
  onImport,
}) => {
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedRawAntrag[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  function handleScan() {
    const detected = parseAntraegeFromText(inputText);
    setParsedItems(detected);
    setHasScanned(true);
  }

  function toggleItem(id: string) {
    setParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  }

  function handleImport() {
    const selected = parsedItems.filter((i) => i.selected);
    if (selected.length === 0) return;

    const sipAntraege = convertParsedToSipAntraege(selected, 'Google Docs Dokument');
    onImport(sipAntraege);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Anträge aus Dokument importieren</h2>
              <p className="text-xs text-slate-400">
                Automatische Erkennung von WM, AÄA, EA, SA & GO-Anträgen
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

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Text aus dem SiP-Dokument / Google Doc hier einfügen:
            </label>
            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setHasScanned(false);
              }}
              placeholder={`Füge hier den Text aus deinen SiP-Unterlagen ein. Beispiel:\n\n[AÄA] Zu Zeile 45: Streichung von "nur schulische Endgeräte" und Ergänzung von BYOD.\n\n[WM] Wortmeldung Simon zu TOP 4: Mental Health Tage.\n\nAntrag auf Ende der Debatte`}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={!inputText.trim()}
              onClick={handleScan}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition cursor-pointer shadow-md shadow-purple-600/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Dokument jetzt scannen</span>
            </button>

            {hasScanned && (
              <span className="text-xs font-medium text-slate-400">
                {parsedItems.length} Antrag/Anträge erkannt
              </span>
            )}
          </div>

          {/* Results List */}
          {hasScanned && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Erkannte Anträge zum Importieren auswählen:
              </h3>

              {parsedItems.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-950 text-center text-xs text-slate-400">
                  Keine Anträge mit Standard-Kennungen (WM, AÄA, EA, SA, Ende Debatte etc.) gefunden.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {parsedItems.map((item) => {
                    const conf = ANTRAG_TYPE_CONFIG[item.type];
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                          item.selected
                            ? 'bg-purple-950/20 border-purple-500/50'
                            : 'bg-slate-950/60 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="mt-0.5 text-purple-400">
                          {item.selected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${conf.badgeColor}`}
                            >
                              {conf.shortLabel}
                            </span>
                            {item.lineOrParagraph && (
                              <span className="text-[10px] text-slate-400">
                                📍 {item.lineOrParagraph}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-white line-clamp-1">
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                            {item.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
          >
            Abbrechen
          </button>

          <button
            type="button"
            disabled={!hasScanned || parsedItems.filter((i) => i.selected).length === 0}
            onClick={handleImport}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {parsedItems.filter((i) => i.selected).length} Antrag/Anträge ins SiP importieren
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
