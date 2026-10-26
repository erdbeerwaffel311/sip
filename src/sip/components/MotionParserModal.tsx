import React, { useState, useRef } from 'react';
import {
  X,
  Sparkles,
  CheckSquare,
  Square,
  FileText,
  Check,
  AlertCircle,
  UploadCloud,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, SipAntrag } from '../types';
import { convertParsedToSipAntraege, parseAntraegeFromText, ParsedRawAntrag } from '../sipParser';
import {
  executeAutoSiPImport,
  classifySiPFolderFiles,
  AutoImportResult,
  AutoImportProgress,
} from '../utils/sipAutoImporter';

interface MotionParserModalProps {
  onClose: () => void;
  onImport: (antraege: SipAntrag[], strategyNotes?: string) => void;
}

export const MotionParserModal: React.FC<MotionParserModalProps> = ({
  onClose,
  onImport,
}) => {
  const [activeMode, setActiveMode] = useState<'auto_files' | 'raw_text'>('auto_files');

  // Auto Files Mode
  const [antragsmappeFile, setAntragsmappeFile] = useState<File | null>(null);
  const [strategieFiles, setStrategieFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<AutoImportProgress | null>(null);
  const [autoResult, setAutoResult] = useState<AutoImportResult | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Raw Text Mode
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedRawAntrag[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  async function handleFolderSelect(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setImportProgress({ percent: 5, statusText: 'Lese SiP-Ordner ein...' });
    try {
      const classified = classifySiPFolderFiles(files);
      if (classified.antragsmappeFile) {
        setAntragsmappeFile(classified.antragsmappeFile);
      }
      if (classified.strategieFiles.length > 0) {
        setStrategieFiles(classified.strategieFiles);
      }
      const res = await executeAutoSiPImport({
        files,
        onProgress: (p) => setImportProgress(p),
      });
      setAutoResult(res);
    } catch (err) {
      console.error('Fehler beim Ordner-Import:', err);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleProcessAutoFiles(mappe?: File | null, strats?: File[] | File | null) {
    const targetMappe = mappe !== undefined ? mappe : antragsmappeFile;
    let targetStrats: File[] = [];
    if (strats !== undefined) {
      if (Array.isArray(strats)) targetStrats = strats;
      else if (strats) targetStrats = [strats];
    } else {
      targetStrats = strategieFiles;
    }

    if (!targetMappe && targetStrats.length === 0) {
      setAutoResult(null);
      setImportProgress(null);
      return;
    }

    setIsProcessing(true);
    setImportProgress({ percent: 5, statusText: 'Lese Dateien ein...' });
    try {
      const res = await executeAutoSiPImport({
        antragsmappeFile: targetMappe || undefined,
        strategieFiles: targetStrats.length > 0 ? targetStrats : undefined,
        onProgress: (p) => setImportProgress(p),
      });
      setAutoResult(res);
    } catch (err) {
      console.error('Fehler beim Extrahieren:', err);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleScanRawText() {
    const detected = parseAntraegeFromText(inputText);
    setParsedItems(detected);
    setHasScanned(true);
  }

  function toggleItem(id: string) {
    setParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  }

  function handleCommitImport() {
    if (activeMode === 'auto_files') {
      if (!autoResult || autoResult.antraege.length === 0) return;
      onImport(autoResult.antraege, autoResult.strategyNotes);
      onClose();
    } else {
      const selected = parsedItems.filter((i) => i.selected);
      if (selected.length === 0) return;
      const sipAntraege = convertParsedToSipAntraege(selected, 'Google Docs Dokument');
      onImport(sipAntraege);
      onClose();
    }
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
              <h2 className="text-lg sm:text-xl font-bold">SiP-Anträge automatisch importieren</h2>
              <p className="text-xs text-slate-400">
                Verknüpft Antragsmappe (PDF) mit Strategie (DOCX) & ignoriert Geschäftsordnung
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

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveMode('auto_files')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeMode === 'auto_files'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Dateien kombinieren (PDF + DOCX)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('raw_text')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeMode === 'raw_text'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Freitext einfügen</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {activeMode === 'auto_files' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-950 to-indigo-950/40 border border-purple-500/40 space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Lade den gesamten freigegebenen SiP-Ordner oder die PDF-Antragsmappe (z.B. <strong className="text-white">„2. SiP Antragsmappe.pdf“</strong>) und die Strategie-Dateien aus dem Unterordner <strong className="text-white">„Strategie“</strong> (DOCX) hoch. Die Antragstexte werden automatisch den Strategien zugeordnet und die Geschäftsordnung am Schluss wird herausgefiltert.
                </p>

                {/* 1-Klick SiP-Ordner Auswählen */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-2">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-left">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4 text-amber-400" />
                        <span>Kompletten SiP-Ordner auswählen (1-Klick)</span>
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Liest Antragsmappe (.pdf) und alle Strategiedokumente im Unterordner „Strategie“ automatisch ein.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition cursor-pointer shrink-0"
                    >
                      Ordner auswählen
                    </button>
                    <input
                      ref={folderInputRef}
                      type="file"
                      {...({ webkitdirectory: '', directory: '' } as any)}
                      multiple
                      className="hidden"
                      onChange={(e) => handleFolderSelect(e.target.files)}
                    />
                  </div>
                </div>

                <div className="text-center text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                  — oder Dateien manuell auswählen —
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* File 1: Antragsmappe PDF */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      📄 1. SiP Antragsmappe (PDF):
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0] || null;
                        setAntragsmappeFile(file);
                        await handleProcessAutoFiles(file, undefined);
                      }}
                      className="block w-full text-xs text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer bg-slate-900 rounded-xl border border-slate-800 p-1"
                    />
                    <span className="text-[11px] text-slate-500 block truncate">
                      {antragsmappeFile ? antragsmappeFile.name : 'z.B. (Nummer). SiP Antragsmappe.pdf'}
                    </span>
                  </div>

                  {/* File 2: Strategie DOCX / Text (Mehrfachauswahl möglich) */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      🎯 2. Strategie-Dateien (DOCX / Text):
                    </label>
                    <input
                      type="file"
                      accept=".docx,.doc,.txt"
                      multiple
                      onChange={async (e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        setStrategieFiles(files);
                        await handleProcessAutoFiles(undefined, files);
                      }}
                      className="block w-full text-xs text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer bg-slate-900 rounded-xl border border-slate-800 p-1"
                    />
                    <span className="text-[11px] text-slate-500 block truncate">
                      {strategieFiles.length > 0
                        ? `${strategieFiles.length} Strategiedatei(en) gewählt`
                        : 'z.B. alle Dateien aus Unterordner "Strategie"'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ladebalken während des Uploads / Imports */}
              {isProcessing && importProgress && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-purple-500/40 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />
                      <span>
                        {importProgress.currentMotionNumber
                          ? `Lade Antrag ${importProgress.currentMotionNumber} von ${importProgress.totalMotions}...`
                          : 'Upload läuft...'}
                      </span>
                    </span>
                    <span className="font-mono font-bold text-white bg-purple-900/60 px-2 py-0.5 rounded-lg border border-purple-500/30">
                      {importProgress.percent}%
                    </span>
                  </div>

                  {/* Ladebalken */}
                  <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                    <div
                      className="bg-gradient-to-r from-purple-500 via-sky-500 to-emerald-400 h-full rounded-full transition-all duration-200 ease-out shadow-sm shadow-purple-500/50"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-300 truncate" title={importProgress.statusText}>
                    {importProgress.statusText}
                  </p>
                </div>
              )}

              {autoResult && !isProcessing && (
                <div
                  className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2.5 animate-in fade-in ${
                    autoResult.success
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span>
                      {autoResult.success
                        ? 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!'
                        : 'Hinweis beim Import:'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200">{autoResult.message}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Hauptanträge:</span>
                      <strong className="text-white text-sm">
                        {autoResult.summary.hauptAntraegeCount}
                      </strong>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Nebenanträge:</span>
                      <strong className="text-white text-sm">
                        {autoResult.summary.subAntraegeCount}
                      </strong>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Geschäftsordnung:</span>
                      <strong className="text-emerald-400 text-xs">Automatisch ignoriert</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
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
                  placeholder={`Füge hier den Text aus deinen SiP-Unterlagen ein. Beispiel:\n\n[ÄA] Zu Zeile 45: Streichung von "nur schulische Endgeräte" und Ergänzung von BYOD.\n\n[WM] Wortmeldung Simon zu Antrag 4: Mental Health Tage.\n\nAntrag auf Ende der Debatte`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={!inputText.trim()}
                  onClick={handleScanRawText}
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
                      Keine Anträge mit Standard-Kennungen gefunden.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {parsedItems.map((item) => {
                        const conf = ANTRAG_TYPE_CONFIG[item.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            Abbrechen
          </button>

          <button
            type="button"
            disabled={
              activeMode === 'auto_files'
                ? !autoResult || autoResult.antraege.length === 0
                : !hasScanned || parsedItems.filter((i) => i.selected).length === 0
            }
            onClick={handleCommitImport}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {activeMode === 'auto_files'
                ? `${autoResult?.antraege.length || 0} Anträge jetzt importieren`
                : `${parsedItems.filter((i) => i.selected).length} Anträge importieren`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
