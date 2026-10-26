import React, { useState, useEffect, useMemo } from 'react';
import {
  Archive,
  Calendar,
  Download,
  Trash2,
  Eye,
  PlusCircle,
  FileText,
  Clock,
  CheckCircle2,
  X,
  AlertTriangle,
  Play,
  FolderOpen,
  Sparkles,
  UploadCloud,
  Check,
} from 'lucide-react';
import { SipArchivedSession, SipSession, SipAntrag, ANTRAG_TYPE_CONFIG } from '../types';
import { AppSettings } from '../../types';
import {
  fetchArchivedSessions,
  archiveCurrentSession,
  deleteArchivedSession,
} from '../utils/archiveService';
import { downloadSipProtocol } from '../utils/protocolExporter';
import { executeAutoSiPImport, AutoImportResult } from '../utils/sipAutoImporter';

/**
 * Berechnet intelligent den Folgetitel für ein Schüler:innenparlament:
 * Standardmäßig 2 SiPs pro Schuljahr. Nach dem 2. SiP 24/25 folgt das 1. SiP 25/26.
 */
export function getNextSipTitle(currentTitle: string): string {
  const match = currentTitle.match(/(\d+)\.\s*(?:Schüler:innenparlament\s*\(SiP\)|SiP)?\s*.*?(\d{2,4})\s*[/–-]\s*(\d{2,4})/i);

  if (match) {
    const num = parseInt(match[1], 10);
    const startYearStr = match[2];
    const endYearStr = match[3];

    let startYear = parseInt(startYearStr, 10);
    let endYear = parseInt(endYearStr, 10);
    if (startYear < 100) startYear += 2000;
    if (endYear < 100) endYear += 2000;

    if (num === 1) {
      const displayStart = startYearStr.length === 2 ? (startYear % 100).toString().padStart(2, '0') : startYear.toString();
      const displayEnd = endYearStr.length === 2 ? (endYear % 100).toString().padStart(2, '0') : endYear.toString();
      return `2. Schüler:innenparlament (SiP) ${displayStart}/${displayEnd}`;
    } else {
      const nextStartYear = startYear + 1;
      const nextEndYear = endYear + 1;
      const displayStart = startYearStr.length === 2 ? (nextStartYear % 100).toString().padStart(2, '0') : nextStartYear.toString();
      const displayEnd = endYearStr.length === 2 ? (nextEndYear % 100).toString().padStart(2, '0') : nextEndYear.toString();
      return `1. Schüler:innenparlament (SiP) ${displayStart}/${displayEnd}`;
    }
  }

  return `1. Schüler:innenparlament (SiP) 2025/26`;
}

interface SipArchiveViewProps {
  currentSession: SipSession;
  settings: AppSettings;
  currentUserName: string;
  onArchiveAndClearSession?: () => Promise<void>;
  onStartNewSession: (options: {
    title: string;
    driveFolderUrl: string;
    skipArchive?: boolean;
    antraege?: SipAntrag[];
    strategyNotes?: string;
  }) => Promise<void>;
}

export const SipArchiveView: React.FC<SipArchiveViewProps> = ({
  currentSession,
  settings,
  currentUserName,
  onArchiveAndClearSession,
  onStartNewSession,
}) => {
  const [archives, setArchives] = useState<SipArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectingArchive, setInspectingArchive] = useState<SipArchivedSession | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newDriveFolderUrl, setNewDriveFolderUrl] = useState('');
  const [antragsmappeFile, setAntragsmappeFile] = useState<File | null>(null);
  const [strategieFile, setStrategieFile] = useState<File | null>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [importResult, setImportResult] = useState<AutoImportResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadArchives();
  }, [settings]);

  // Prüft, ob das aktuelle SiP bereits archiviert wurde
  const isCurrentSessionAlreadyArchived = useMemo(() => {
    return archives.some(
      (a) =>
        a.sessionTitle === currentSession.title &&
        (currentSession.antraege.length === 0 || a.antraegeCount === currentSession.antraege.length)
    );
  }, [archives, currentSession.title, currentSession.antraege.length]);

  async function loadArchives() {
    setLoading(true);
    try {
      const data = await fetchArchivedSessions(settings);
      setArchives(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveNow() {
    if (
      !window.confirm(
        `Möchtest du das aktuelle SiP "${currentSession.title}" jetzt ins Archiv übertragen?\n\nAlle Kategorien (Anträge & Wortmeldungen, Vergangene Anträge, Strategie, Drive Unterlagen, Meme-Feed) werden dadurch für das Plenum geleert und sind danach nur noch hier im Archiv einsehbar.`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (onArchiveAndClearSession) {
        await onArchiveAndClearSession();
      } else {
        await archiveCurrentSession(currentSession, currentUserName, settings);
      }
      await loadArchives();
      alert('Sitzung erfolgreich im Archiv gesichert und alle Kategorien für die Vorbereitung geleert!');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(archiveId: string, title: string) {
    if (!window.confirm(`Möchtest du das archivierte SiP "${title}" wirklich unwiderruflich löschen?`)) {
      return;
    }
    const updated = await deleteArchivedSession(archiveId, settings);
    setArchives(updated);
    if (inspectingArchive?.id === archiveId) {
      setInspectingArchive(null);
    }
  }

  async function handleAutoImportFiles(mappe?: File | null, strat?: File | null) {
    const targetMappe = mappe !== undefined ? mappe : antragsmappeFile;
    const targetStrat = strat !== undefined ? strat : strategieFile;

    if (!targetMappe && !targetStrat) {
      setImportResult(null);
      return;
    }

    setIsProcessingFiles(true);
    try {
      const res = await executeAutoSiPImport({
        antragsmappeFile: targetMappe || undefined,
        strategieFile: targetStrat || undefined,
      });
      setImportResult(res);
    } catch (err) {
      console.error('Fehler beim automatischen Import:', err);
    } finally {
      setIsProcessingFiles(false);
    }
  }

  async function handleConfirmNewSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newSessionTitle.trim()) {
      alert('Bitte gib einen Namen für das neue SiP ein.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onStartNewSession({
        title: newSessionTitle.trim(),
        driveFolderUrl: newDriveFolderUrl.trim(),
        skipArchive: isCurrentSessionAlreadyArchived,
        antraege: importResult?.antraege || [],
        strategyNotes: importResult?.strategyNotes || '',
      });
      setShowNewSessionModal(false);
      setNewSessionTitle('');
      setNewDriveFolderUrl('');
      setAntragsmappeFile(null);
      setStrategieFile(null);
      const importedMsg = importResult ? `\n\n${importResult.message}` : '';
      setImportResult(null);
      await loadArchives();
      alert(
        `Neues SiP "${newSessionTitle.trim()}" gestartet!\n${
          isCurrentSessionAlreadyArchived
            ? 'Das vorherige SiP war bereits archiviert.'
            : 'Das vorherige SiP wurde im Archiv gesichert.'
        }${importedMsg}`
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border-2 border-amber-500/30 rounded-3xl p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <Archive className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Geschützter Bereich • Nur Strategieführung & Admin
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              SiP Sitzungs-Archiv & Protokolle
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Hier werden vergangene Schüler:innenparlamente sicher gespeichert. Du kannst historische
              Anträge und Wortmeldungen einsehen oder das lückenlose Audit-Protokoll (wer hat wann was eingereicht/geändert) exportieren.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleArchiveNow}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold text-xs sm:text-sm transition cursor-pointer shadow"
              title="Sichert den aktuellen Stand der laufenden Sitzung im Archiv"
            >
              <Archive className="w-4 h-4" />
              <span>Aktuelles SiP archivieren</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewSessionTitle(getNextSipTitle(currentSession.title));
                setNewDriveFolderUrl('');
                setShowNewSessionModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Neues SiP starten...</span>
            </button>
          </div>
        </div>
      </div>

      {/* Archive List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Gespeicherte Sitzungen ({archives.length})
          </h3>
          <button
            type="button"
            onClick={loadArchives}
            className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
          >
            Aktualisieren
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm bg-slate-900 rounded-3xl border border-slate-800">
            Lade Archiv...
          </div>
        ) : archives.length === 0 ? (
          <div className="p-10 text-center bg-slate-900/60 rounded-3xl border border-slate-800 text-slate-400">
            <Archive className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <h4 className="font-bold text-slate-200">Noch keine archivierten SiPs vorhanden</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Klicke oben auf <strong>„Aktuelles SiP archivieren“</strong> oder starte ein neues SiP, um den bisherigen Verlauf hier dauerhaft zu sichern.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {archives.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-lg flex flex-col justify-between gap-4 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.archivedAt).toLocaleDateString('de-AT', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Archiviert von: {item.archivedBy}
                    </span>
                  </div>

                  <h4 className="text-base sm:text-lg font-black text-white mb-2 leading-snug">
                    {item.sessionTitle}
                  </h4>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>📋 {item.antraegeCount} Anträge</span>
                    <span>⏱️ {item.activityCount} Protokoll-Einträge</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setInspectingArchive(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>Anschauen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadSipProtocol(item.sessionData)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold transition cursor-pointer"
                    title="Vollständiges Protokoll dieses SiPs als Textdatei exportieren"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Protokoll</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.sessionTitle)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    title="Archivierten Eintrag löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Neues SiP starten */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-7 shadow-2xl text-white">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Neues SiP starten</h3>
                  <span className="text-xs text-amber-300 font-semibold">
                    {isCurrentSessionAlreadyArchived
                      ? 'Vorheriges SiP ist bereits archiviert'
                      : 'Vorheriges SiP wird automatisch archiviert'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSessionModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmNewSession} className="space-y-4">
              {isCurrentSessionAlreadyArchived ? (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Das bisherige SiP <strong>„{currentSession.title}“</strong> wurde bereits gesichert. Es ist keine neuerliche Archivierung erforderlich.
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Das derzeitige SiP <strong>„{currentSession.title}“</strong> wird mit allen Claims, eingereichten Anträgen und Protokolleinträgen automatisch im Archiv gesichert.
                  </span>
                </div>
              )}

              {/* Titel des neuen SiP */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Name des neuen SiP:
                  </label>
                  <span className="text-[11px] text-amber-400/90 font-medium">
                    (Standard: 2 SiPs pro Schuljahr)
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  placeholder="z.B. 1. Schüler:innenparlament (SiP) 2025/26"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500"
                />
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] text-slate-400">Vorschlag:</span>
                  <button
                    type="button"
                    onClick={() => setNewSessionTitle(getNextSipTitle(currentSession.title))}
                    className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold transition cursor-pointer border border-slate-700"
                  >
                    {getNextSipTitle(currentSession.title)}
                  </button>
                </div>
              </div>

              {/* Neuer Google Drive Ordner */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Neuer Google Drive Ordner (Link):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <input
                    type="url"
                    value={newDriveFolderUrl}
                    onChange={(e) => setNewDriveFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Aus diesem Ordner können anschließend im Google Drive Tab die neuen Hauptanträge für das SiP importiert werden.
                </p>
              </div>

              {/* Automatischer Import: Antragsmappe PDF + Strategie DOCX */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-950 to-indigo-950/40 border border-purple-500/40 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    Automatischer Antrags- & Strategie-Import
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Lade die PDF-Antragsmappe und die Strategie-Datei (DOCX aus dem Ordner „Strategie“) hoch. Das System kombiniert automatisch den Antragstext mit der Strategie des jeweiligen Antrags anhand des gleichen Titels. Die Geschäftsordnung am Ende der Antragsmappe wird automatisch ignoriert.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* File 1: Antragsmappe PDF */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      📄 1. Antragsmappe (PDF):
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0] || null;
                        setAntragsmappeFile(file);
                        await handleAutoImportFiles(file, undefined);
                      }}
                      className="block w-full text-[11px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer bg-slate-900 rounded-xl border border-slate-800 p-1"
                    />
                    <span className="text-[10px] text-slate-500 block truncate">
                      {antragsmappeFile ? antragsmappeFile.name : 'z.B. 1. SiP Antragsmappe.pdf'}
                    </span>
                  </div>

                  {/* File 2: Strategie DOCX / Text */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      🎯 2. Strategie-Datei (DOCX / Text):
                    </label>
                    <input
                      type="file"
                      accept=".docx,.txt"
                      onChange={async (e) => {
                        const file = e.target.files?.[0] || null;
                        setStrategieFile(file);
                        await handleAutoImportFiles(undefined, file);
                      }}
                      className="block w-full text-[11px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer bg-slate-900 rounded-xl border border-slate-800 p-1"
                    />
                    <span className="text-[10px] text-slate-500 block truncate">
                      {strategieFile ? strategieFile.name : 'z.B. aus Unterordner "Strategie"'}
                    </span>
                  </div>
                </div>

                {/* Import Status Alert */}
                {isProcessingFiles && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300">
                    <Sparkles className="w-4 h-4 animate-spin shrink-0" />
                    <span>Dateien werden extrahiert, analysiert und Titel abgeglichen...</span>
                  </div>
                )}

                {importResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                      importResult.success
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block mb-0.5">
                        {importResult.success ? 'Erfolgreich vorbereitet!' : 'Hinweis:'}
                      </span>
                      <span>{importResult.message}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
                >
                  {isSubmitting
                    ? 'Wird initialisiert...'
                    : isCurrentSessionAlreadyArchived
                    ? 'Neues SiP initialisieren'
                    : 'Altes SiP archivieren & Neues starten'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Archivierte Sitzung ansehen */}
      {inspectingArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl text-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800 shrink-0">
              <div>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
                  Archivierte Sitzung • Schreibgeschützt
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  {inspectingArchive.sessionTitle}
                </h3>
                <span className="text-xs text-slate-400">
                  Archiviert am {new Date(inspectingArchive.archivedAt).toLocaleString('de-AT')} von {inspectingArchive.archivedBy}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadSipProtocol(inspectingArchive.sessionData)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Protokoll (.txt)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingArchive(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Tabs / Scrollable Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Chronological Log */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Chronologischer Sitzungsverlauf (Audit Trail)</span>
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {(inspectingArchive.sessionData.activityLog || []).length === 0 ? (
                    <span className="text-xs text-slate-500 italic">Keine Einträge protokolliert.</span>
                  ) : (
                    (inspectingArchive.sessionData.activityLog || []).map((entry) => (
                      <div key={entry.id} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-slate-500 font-mono shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <strong className="text-sky-300 shrink-0">{entry.performedBy}:</strong>
                        <span>{entry.details}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Anträge List */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Behandelte Anträge ({inspectingArchive.sessionData.antraege.length})
                </h4>
                <div className="space-y-2.5">
                  {inspectingArchive.sessionData.antraege.map((a) => {
                    const cfg = ANTRAG_TYPE_CONFIG[a.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;
                    return (
                      <div key={a.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badgeColor}`}>
                              {cfg.shortLabel}
                            </span>
                            <span className="text-xs font-semibold text-slate-300">
                              Autor: {a.author}
                            </span>
                          </div>
                          {a.claimedBy && (
                            <span className="text-xs text-emerald-400 font-medium">
                              🎙️ Redner:in: {a.claimedBy}
                            </span>
                          )}
                        </div>
                        <h5 className="font-bold text-sm text-slate-100">{a.title}</h5>
                        {a.forderungspunkte && a.forderungspunkte.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-slate-300">
                            {a.forderungspunkte.map((fp, idx) => (
                              <div key={idx}>• {fp}</div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-400 mt-2 line-clamp-3 italic">
                          {a.rede || a.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
