import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { SipArchivedSession, SipSession, ANTRAG_TYPE_CONFIG } from '../types';
import { AppSettings } from '../../types';
import {
  fetchArchivedSessions,
  archiveCurrentSession,
  deleteArchivedSession,
} from '../utils/archiveService';
import { downloadSipProtocol } from '../utils/protocolExporter';

interface SipArchiveViewProps {
  currentSession: SipSession;
  settings: AppSettings;
  currentUserName: string;
  onStartNewSession: (newTitle: string) => Promise<void>;
}

export const SipArchiveView: React.FC<SipArchiveViewProps> = ({
  currentSession,
  settings,
  currentUserName,
  onStartNewSession,
}) => {
  const [archives, setArchives] = useState<SipArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectingArchive, setInspectingArchive] = useState<SipArchivedSession | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadArchives();
  }, [settings]);

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
    if (!window.confirm(`Möchtest du die aktuelle Sitzung "${currentSession.title}" jetzt ins Archiv übertragen?`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      const updated = await archiveCurrentSession(currentSession, currentUserName, settings);
      setArchives(updated);
      alert('Sitzung erfolgreich im Archiv gesichert!');
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

  async function handleConfirmNewSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newSessionTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await onStartNewSession(newSessionTitle.trim());
      setShowNewSessionModal(false);
      setNewSessionTitle('');
      await loadArchives();
      alert(`Neue Sitzung "${newSessionTitle.trim()}" gestartet! Die vorherige Sitzung wurde im Archiv gesichert.`);
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
                setNewSessionTitle(`3. Schüler:innenparlament (SiP) 2024/25`);
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
                    Aktuelle Sitzung wird automatisch archiviert
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSessionModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmNewSession} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Die derzeitige Sitzung <strong>„{currentSession.title}“</strong> wird mit allen Claims, eingereichten Anträgen und Protokolleinträgen im Archiv gesichert.
                  Anschließend wird die neue Sitzung für das Plenum freigeschaltet.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Titel des neuen Schüler:innenparlaments:
                </label>
                <input
                  type="text"
                  required
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  placeholder="z.B. 3. Schüler:innenparlament (SiP) 2024/25"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
                >
                  {isSubmitting ? 'Wird initialisiert...' : 'Altes SiP archivieren & Neues starten'}
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
