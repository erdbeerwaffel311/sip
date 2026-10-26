import React, { useState } from 'react';
import {
  X,
  Sparkles,
  CheckSquare,
  Square,
  FileText,
  Check,
  CheckCircle2,
  FolderOpen,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { SipAntrag, ANTRAG_TYPE_CONFIG } from '../types';
import { convertParsedToSipAntraege, parseAntraegeFromText, ParsedRawAntrag } from '../sipParser';
import {
  AutoImportResult,
  AutoImportProgress,
  parseAntragsmappeText,
  createHauptantraegeFromParsed,
  mergeHauptAndNebenantraege,
} from '../utils/sipAutoImporter';
import {
  executeOnlineDriveImport,
  downloadAndParseDriveStrategieFiles,
  GoogleDriveFolderManifest,
} from '../utils/driveFolderCrawler';
import { extractTextFromPdfArrayBuffer } from '../utils/pdfHelper';

interface MotionParserModalProps {
  onClose: () => void;
  onImport: (antraege: SipAntrag[], strategyNotes?: string) => void;
  initialDriveUrl?: string;
}

export const MotionParserModal: React.FC<MotionParserModalProps> = ({
  onClose,
  onImport,
  initialDriveUrl = '',
}) => {
  const [activeMode, setActiveMode] = useState<'online_drive' | 'raw_text'>('online_drive');

  // Online Drive Mode – Getrennte States für PDF-Hauptanträge und DOCX-Nebenanträge
  const [driveUrlInput, setDriveUrlInput] = useState(initialDriveUrl);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<AutoImportProgress | null>(null);
  const [autoResult, setAutoResult] = useState<AutoImportResult | null>(null);
  const [pendingHauptantraege, setPendingHauptantraege] = useState<SipAntrag[]>([]);
  const [pendingNebenantraege, setPendingNebenantraege] = useState<SipAntrag[]>([]);
  const [pendingStrategyNotes, setPendingStrategyNotes] = useState<string>('');
  const [manualUploadRequired, setManualUploadRequired] = useState(false);
  const [pendingManifest, setPendingManifest] = useState<GoogleDriveFolderManifest | null>(null);
  const [manualUploadFileName, setManualUploadFileName] = useState<string>('');

  // Raw Text Mode
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedRawAntrag[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  async function handleOnlineDriveImport() {
    if (!driveUrlInput.trim()) {
      alert('Bitte gib zuerst einen Google Drive Ordner-Link ein.');
      return;
    }

    setIsProcessing(true);
    setManualUploadRequired(false);
    setPendingManifest(null);
    setPendingHauptantraege([]);
    setPendingNebenantraege([]);
    setPendingStrategyNotes('');
    setImportProgress({ percent: 5, statusText: 'Verbinde mit Google Drive...' });
    setAutoResult(null);

    try {
      const res = await executeOnlineDriveImport({
        folderUrlOrId: driveUrlInput.trim(),
        onProgress: (p) => setImportProgress(p),
      });

      const hauptantraege =
        res.hauptantraege || res.antraege.filter((a) => a.type === 'HAUPTANTRAG');
      const nebenantraege =
        res.nebenantraege || res.antraege.filter((a) => a.type !== 'HAUPTANTRAG');

      setPendingHauptantraege(hauptantraege);
      setPendingNebenantraege(nebenantraege);
      setPendingStrategyNotes(res.strategyNotes || '');

      const finalMotions = [...hauptantraege, ...nebenantraege];
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );

      setAutoResult({
        ...res,
        antraege: finalMotions,
        hauptantraege,
        nebenantraege,
      });
      setManualUploadRequired(false);
      setPendingManifest(null);
    } catch (err: any) {
      console.error('Fehler beim Online-Drive-Import:', err);
      if (
        err.isDownloadBlocked ||
        err.name === 'DriveDownloadBlockedError' ||
        /403|408|blockier/i.test(err.message)
      ) {
        setManualUploadRequired(true);
        if (err.manifest) {
          setPendingManifest(err.manifest);
        }
        if (Array.isArray(err.pendingNebenantraege) && err.pendingNebenantraege.length > 0) {
          setPendingNebenantraege(err.pendingNebenantraege);
        }
        if (err.strategyNotes) {
          setPendingStrategyNotes(err.strategyNotes);
        }
        if (err.file?.name) {
          setManualUploadFileName(err.file.name);
        }
        setImportProgress(null);
      } else {
        alert(err.message || 'Fehler beim Abrufen der Google Drive Dokumente.');
        setImportProgress(null);
      }
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleManualPdfSelected(file: File) {
    if (!file) return;
    setIsProcessing(true);
    setImportProgress({ percent: 15, statusText: `Lese manuell hochgeladene Datei ${file.name} ein...` });

    try {
      // 1. Manuelle PDF parsen und in pendingHauptantraege speichern
      const arrayBuffer = await file.arrayBuffer();
      const pdfText = await extractTextFromPdfArrayBuffer(arrayBuffer.slice(0));
      const { hauptAntraege, goExcluded } = parseAntragsmappeText(pdfText);
      const parsedHauptantraege = createHauptantraegeFromParsed(hauptAntraege);

      console.log('Manuell hochgeladene PDF geparst. Anzahl Hauptanträge:', parsedHauptantraege.length);
      setPendingHauptantraege(parsedHauptantraege);

      // 2. Sicherstellen, dass die DOCX-Nebenanträge (pendingNebenantraege) ebenfalls vorliegen
      let currentNebenantraege = pendingNebenantraege;
      let currentStrategyNotes = pendingStrategyNotes;
      let strategyFilesCount = pendingManifest?.strategieFiles.length || 0;

      if (currentNebenantraege.length === 0 && pendingManifest && pendingManifest.strategieFiles.length > 0) {
        setImportProgress({ percent: 45, statusText: 'Lade zugehörige Strategiedateien (DOCX) aus Google Drive...' });
        const stratRes = await downloadAndParseDriveStrategieFiles(
          pendingManifest,
          (p) => setImportProgress(p),
          45,
          35
        );
        currentNebenantraege = stratRes.nebenantraege;
        currentStrategyNotes = stratRes.strategyNotes;
        setPendingNebenantraege(currentNebenantraege);
        setPendingStrategyNotes(currentStrategyNotes);
      } else if (currentNebenantraege.length === 0 && driveUrlInput.trim()) {
        setImportProgress({ percent: 45, statusText: 'Lade zugehörige Strategiedateien (DOCX) aus Google Drive...' });
        const importResult = await executeOnlineDriveImport({
          folderUrlOrId: driveUrlInput.trim(),
          manualPdfBuffer: arrayBuffer.slice(0),
          cachedManifest: pendingManifest || undefined,
          onProgress: (p) => setImportProgress(p),
        });
        currentNebenantraege =
          importResult.nebenantraege || importResult.antraege.filter((a) => a.type !== 'HAUPTANTRAG');
        currentStrategyNotes = importResult.strategyNotes || '';
        strategyFilesCount = importResult.summary.strategyFilesCount;
        setPendingNebenantraege(currentNebenantraege);
        setPendingStrategyNotes(currentStrategyNotes);
      }

      // 3. Expliziter Merge-Schritt der getrennten States (pendingHauptantraege + pendingNebenantraege)
      const merged = mergeHauptAndNebenantraege(parsedHauptantraege, currentNebenantraege);
      const hauptantraege = merged.hauptantraege;
      const nebenantraege = merged.nebenantraege;
      const finalMotions = [...hauptantraege, ...nebenantraege];

      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );

      setPendingHauptantraege(hauptantraege);
      setPendingNebenantraege(nebenantraege);

      const finalResult: AutoImportResult = {
        success: finalMotions.length > 0,
        message: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
        antraege: finalMotions,
        hauptantraege,
        nebenantraege,
        summary: {
          hauptAntraegeCount: hauptantraege.length,
          subAntraegeCount: nebenantraege.length,
          matchedSectionsCount: merged.matchedSectionsCount,
          goExcluded,
          strategyFilesCount,
        },
        strategyNotes: currentStrategyNotes,
      };

      setImportProgress({
        percent: 100,
        currentMotionNumber: hauptantraege.length,
        totalMotions: hauptantraege.length,
        statusText: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
      });
      setAutoResult(finalResult);
      setManualUploadRequired(false);
      setPendingManifest(null);

      // 4. Erst dieses vereinte finalMotions-Array an Supabase / den Haupt-State der App übergeben
      onImport(finalMotions, finalResult.strategyNotes);
    } catch (err: any) {
      console.error('Fehler nach manuellem PDF-Upload:', err);
      alert('Fehler beim Verarbeiten der hochgeladenen PDF-Datei: ' + (err?.message || err));
      setImportProgress(null);
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
    if (activeMode === 'online_drive') {
      const hauptantraege =
        pendingHauptantraege.length > 0
          ? pendingHauptantraege
          : (autoResult?.antraege || []).filter((a) => a.type === 'HAUPTANTRAG');
      const nebenantraege =
        pendingNebenantraege.length > 0
          ? pendingNebenantraege
          : (autoResult?.antraege || []).filter((a) => a.type !== 'HAUPTANTRAG');

      const finalMotions = [...hauptantraege, ...nebenantraege];
      if (finalMotions.length === 0) return;

      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );

      onImport(finalMotions, autoResult?.strategyNotes || pendingStrategyNotes);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white my-auto max-h-[92vh] flex flex-col overflow-hidden">
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
            onClick={() => setActiveMode('online_drive')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeMode === 'online_drive'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Online aus Google Drive laden</span>
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
          {activeMode === 'online_drive' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-950 to-indigo-950/40 border border-purple-500/40 space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Google Drive Ordner (Link):
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <FolderOpen className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        value={driveUrlInput}
                        onChange={(e) => {
                          setDriveUrlInput(e.target.value);
                          setAutoResult(null);
                        }}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isProcessing || !driveUrlInput.trim()}
                      onClick={handleOnlineDriveImport}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isProcessing ? 'Lädt online...' : 'Dokumente online aus Drive laden'}</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Greift online direkt auf den freigegebenen Google Drive-Ordner zu. Das System lädt vollautomatisch die <strong>Antragsmappe (.pdf)</strong> und alle Strategiedateien aus dem Unterordner <strong>„Strategie“ (.docx)</strong> herunter. <em>Alle anderen Dateien und Ordner werden ignoriert.</em>
                </p>
              </div>

              {/* Fallback auf manuellen Upload (Der Lebensretter) */}
              {manualUploadRequired && !autoResult && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-200 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 border border-amber-500/30">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm sm:text-base text-amber-300">
                        Google blockiert den automatischen Download der Antragsmappe. Bitte lade die Datei hier manuell hoch.
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Google Drive verweigert den automatischen Browser-Download (Anti-Bot / HTTP 403).
                        {manualUploadFileName ? ` Erwartet: „${manualUploadFileName}“. ` : ' '}
                        Die Strategiedateien aus Google Drive werden anschließend automatisch mit der Mappe zusammengeführt.
                      </p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-amber-500/50 hover:border-amber-400 bg-slate-950/80 hover:bg-slate-950 rounded-2xl p-5 cursor-pointer transition group shadow-inner">
                      <Upload className="w-8 h-8 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="text-xs sm:text-sm font-bold text-white mb-0.5">
                        Antragsmappe (.pdf) auswählen
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Hier klicken, um die Datei vom Rechner hochzuladen
                      </span>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            await handleManualPdfSelected(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

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

              {/* Vorschau der geladenen Anträge */}
              {autoResult && !isProcessing && autoResult.antraege.length > 0 && (
                <div className="space-y-2 pt-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Erkannte Anträge ({autoResult.antraege.length}):
                    </h3>
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      {autoResult.summary.hauptAntraegeCount} Hauptanträge &bull; {autoResult.summary.subAntraegeCount} Nebenanträge
                    </span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {autoResult.antraege.map((item) => {
                      const conf = ANTRAG_TYPE_CONFIG[item.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;
                      const isHaupt = item.type === 'HAUPTANTRAG';
                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border flex items-start gap-3 ${
                            isHaupt
                              ? 'bg-purple-950/30 border-purple-500/50'
                              : 'bg-slate-950/70 border-slate-800/80'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                              {item.author && (
                                <span className="text-[10px] text-slate-400 truncate">
                                  von {item.author}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-white line-clamp-1">
                              {item.title}
                            </h4>
                            {item.content && (
                              <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                                {item.content}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
              activeMode === 'online_drive'
                ? !autoResult || autoResult.antraege.length === 0
                : !hasScanned || parsedItems.filter((i) => i.selected).length === 0
            }
            onClick={handleCommitImport}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {activeMode === 'online_drive'
                ? `${autoResult?.antraege.length || 0} Anträge jetzt importieren`
                : `${parsedItems.filter((i) => i.selected).length} Anträge importieren`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
