import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Gavel,
  Target,
  FolderOpen,
  Smile,
  Plus,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Filter,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Radio,
  FileText,
  User,
  Users,
  Play,
  UserCheck,
  UserX,
  Clock,
  XCircle,
  Copy,
  Mic,
} from 'lucide-react';
import { AppSettings, MemberAccount } from '../../types';
import {
  ANTRAG_TYPE_CONFIG,
  AntragType,
  SipAntrag,
  SipNotification,
  SipSession,
  VoteType,
} from '../types';
import { sipRealtime } from '../sipRealtime';
import { VoteRecommendationBanner } from './VoteRecommendationBanner';
import { AntragCard } from './AntragCard';
import { BlurryMotionModal } from './BlurryMotionModal';
import { NewAntragModal } from './NewAntragModal';
import { EditAntragModal } from './EditAntragModal';
import { MotionParserModal } from './MotionParserModal';
import { DriveFolderViewer } from './DriveFolderViewer';
import { MemeFeedTab } from './MemeFeedTab';
import { StrategyNotesTab } from './StrategyNotesTab';

interface SipMainViewProps {
  settings: AppSettings;
  currentMember: MemberAccount | null;
  isAdminUnlocked: boolean;
}

export type SipSubTab = 'antraege' | 'strategy' | 'drive' | 'memes';

export const SipMainView: React.FC<SipMainViewProps> = ({
  settings,
  currentMember,
  isAdminUnlocked,
}) => {
  const [session, setSession] = useState<SipSession>(() => sipRealtime.getSession());
  const [currentSubTab, setCurrentSubTab] = useState<SipSubTab>('antraege');
  const [isStrategieLeader, setIsStrategieLeader] = useState<boolean>(
    () => isAdminUnlocked || currentMember?.role === 'strategie' || currentMember?.role === 'admin'
  );

  const isStrategieLeaderRef = useRef(isStrategieLeader);
  useEffect(() => {
    isStrategieLeaderRef.current = isStrategieLeader;
  }, [isStrategieLeader]);

  // Modals & Popups
  const [activeBlurAntrag, setActiveBlurAntrag] = useState<SipAntrag | null>(null);
  const [confirmActivateAntrag, setConfirmActivateAntrag] = useState<SipAntrag | null>(null);
  const [showNewAntragModal, setShowNewAntragModal] = useState(false);
  const [newAntragPreset, setNewAntragPreset] = useState<{
    defaultType?: AntragType;
    parentAntrag?: SipAntrag | null;
  } | null>(null);
  const [editingAntrag, setEditingAntrag] = useState<SipAntrag | null>(null);
  const [showParserModal, setShowParserModal] = useState(false);
  const [hasCopiedHeroRede, setHasCopiedHeroRede] = useState(false);

  // Filter
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [claimFilter, setClaimFilter] = useState<'ALL' | 'FREE' | 'MINE' | 'CLAIMED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Live Toast Notifications
  const [activeToast, setActiveToast] = useState<SipNotification | null>(null);

  const currentUserName = currentMember?.name || (isAdminUnlocked ? 'Strategieführung' : 'Gast-Mitglied');

  // Initialize Realtime & Supabase
  useEffect(() => {
    sipRealtime.init(settings);

    const unsubSession = sipRealtime.subscribe((newSession) => {
      setSession(newSession);
    });

    const unsubBlur = sipRealtime.onBlurPopup((antrag) => {
      // WICHTIG: Das Blurry Overlay soll NUR auf den Bildschirmen der Mitglieder aufploppen,
      // NIEMALS auf dem Bildschirm der Strategieführung!
      if (!isStrategieLeaderRef.current) {
        setActiveBlurAntrag(antrag);
      }
    });

    const unsubNotif = sipRealtime.onNotification((notif) => {
      setActiveToast(notif);
      const timer = setTimeout(() => {
        setActiveToast((current) => (current?.id === notif.id ? null : current));
      }, 5000);
      return () => clearTimeout(timer);
    });

    return () => {
      unsubSession();
      unsubBlur();
      unsubNotif();
    };
  }, [settings]);

  // Wenn globaler Admin entsperrt ist oder Rolle strategie ist, Strategieführung aktivieren
  useEffect(() => {
    if (isAdminUnlocked || currentMember?.role === 'strategie' || currentMember?.role === 'admin') {
      setIsStrategieLeader(true);
    }
  }, [isAdminUnlocked, currentMember]);

  // Anträge filtern - Alle Mitglieder sehen alle Anträge und deren aktuellen Prüfstatus
  const filteredAntraege = useMemo(() => {
    return session.antraege.filter((item) => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) {
        return false;
      }

      if (claimFilter === 'FREE' && item.claimedBy) {
        return false;
      }
      if (claimFilter === 'MINE' && item.claimedBy !== currentUserName) {
        return false;
      }
      if (claimFilter === 'CLAIMED' && !item.claimedBy) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesContent = item.content.toLowerCase().includes(q);
        const matchesAuthor = item.author.toLowerCase().includes(q);
        const matchesClaimed = (item.claimedBy || '').toLowerCase().includes(q);
        const matchesLine = (item.lineOrParagraph || '').toLowerCase().includes(q);
        return matchesTitle || matchesContent || matchesAuthor || matchesClaimed || matchesLine;
      }

      return true;
    });
  }, [session.antraege, typeFilter, claimFilter, searchQuery, currentUserName]);

  // Zähler für Anträge zur Prüfung
  const pendingCount = useMemo(() => {
    return session.antraege.filter((a) => a.status === 'pending_approval').length;
  }, [session.antraege]);

  // Aktuell im Plenum aufgerufener Antrag
  const activeAntrag = useMemo(() => {
    if (session.activeAntragId) {
      const found = session.antraege.find((a) => a.id === session.activeAntragId);
      if (found) return found;
    }
    return session.antraege.find((a) => a.isActive) || null;
  }, [session.activeAntragId, session.antraege]);

  // Zusatzanträge & Wortmeldungen zu diesem aktiven Antrag (alle Mitglieder sehen diese samt Status)
  const activeSubAntraege = useMemo(() => {
    if (!activeAntrag) return [];
    return session.antraege.filter((a) => a.parentAntragId === activeAntrag.id);
  }, [activeAntrag, session.antraege]);

  // Handlers
  function handleActivateAntrag(antragId: string) {
    sipRealtime.activateAntrag(antragId, settings);
  }

  function handleClearActiveAntrag() {
    sipRealtime.clearActiveAntrag(settings);
  }

  function handleClaimAntrag(antragId: string) {
    sipRealtime.claimAntrag(antragId, currentUserName, settings);
  }

  function handleUnclaimAntrag(antragId: string) {
    sipRealtime.unclaimAntrag(antragId, currentUserName, settings);
  }

  function handleVoteRecommendationUpdate(rec: { type: VoteType; note: string; isPublished: boolean }) {
    sipRealtime.setVoteRecommendation(
      {
        type: rec.type,
        note: rec.note,
        isPublished: rec.isPublished,
        updatedBy: currentUserName,
      },
      settings
    );
  }

  function handleCreateAntrag(
    antragData: Omit<SipAntrag, 'id' | 'isPreFab' | 'status' | 'createdAt'>
  ) {
    const created = sipRealtime.submitCustomAntrag(antragData, settings);
    // Wenn Strategieführung, direkt freigeben
    if (isStrategieLeader) {
      sipRealtime.updateOrApproveAntrag(created.id, { status: 'approved' }, settings);
    }
  }

  function handleApproveAntrag(antragId: string) {
    sipRealtime.updateOrApproveAntrag(antragId, { status: 'approved' }, settings);
  }

  function handleRejectAntrag(antragId: string) {
    sipRealtime.updateOrApproveAntrag(antragId, { status: 'rejected' }, settings);
  }

  function handleSaveEditedAntrag(antragId: string, updates: Partial<SipAntrag>) {
    sipRealtime.updateOrApproveAntrag(antragId, updates, settings);
  }

  function handleDeleteAntrag(antragId: string) {
    sipRealtime.deleteAntrag(antragId, settings);
  }

  function handleImportAntraege(imported: SipAntrag[]) {
    sipRealtime.importAntraege(imported, settings);
  }

  function handleUpdateStrategyNotes(notes: string) {
    sipRealtime.updateStrategyNotes(notes, settings);
  }

  function handleUpdateDriveUrl(url: string) {
    sipRealtime.updateSessionMetadata({ driveFolderUrl: url }, settings);
  }

  function handleAddMeme(meme: { author: string; imageUrl: string; caption: string }) {
    sipRealtime.addMeme(meme, settings);
  }

  function handleReactMeme(memeId: string, emoji: string) {
    sipRealtime.toggleMemeReaction(memeId, emoji, currentUserName, settings);
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6">
      {/* Toast Notification for Claims / Events */}
      {activeToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-900 border-2 border-sky-400 text-white rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shrink-0">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-sky-300 leading-snug">
                {activeToast.title}
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                {activeToast.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Blurry Screen Modal: NUR für Mitglieder-Accounts, NIEMALS für die Strategieführung */}
      {activeBlurAntrag && !isStrategieLeader && (
        <BlurryMotionModal
          antrag={activeBlurAntrag}
          onViewNow={() => {
            setActiveBlurAntrag(null);
            setCurrentSubTab('antraege');
            // Scroll to antrag
            setTimeout(() => {
              const el = document.getElementById(`antrag-${activeBlurAntrag.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          }}
          onDismiss={() => setActiveBlurAntrag(null)}
        />
      )}

      {/* Bestätigungsfenster: Antrag im Plenum aufrufen */}
      {confirmActivateAntrag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-sky-500/50 rounded-3xl p-6 sm:p-7 shadow-2xl text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center shrink-0">
                <Play className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">
                  Antrag im Plenum aufrufen?
                </h3>
                <p className="text-xs text-slate-400">
                  Wird auf allen Geräten der Delegierten live geschaltet
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 mb-5">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                    ANTRAG_TYPE_CONFIG[confirmActivateAntrag.type]?.badgeColor || 'bg-slate-800'
                  }`}
                >
                  {ANTRAG_TYPE_CONFIG[confirmActivateAntrag.type]?.shortLabel}
                </span>
                {confirmActivateAntrag.lineOrParagraph && (
                  <span className="text-xs text-slate-400 font-mono">
                    📍 {confirmActivateAntrag.lineOrParagraph}
                  </span>
                )}
                {confirmActivateAntrag.claimedBy && (
                  <span className="text-xs text-emerald-400 font-semibold ml-auto">
                    🎙️ {confirmActivateAntrag.claimedBy}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-sm sm:text-base text-slate-100">
                {confirmActivateAntrag.title}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-3 italic">
                "{confirmActivateAntrag.content}"
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 mb-6 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span className="leading-relaxed">
                Soll dieser Antrag nun auf allen Geräten angezeigt werden? Es ertönt ein akustischer Hinweis und das Blurry-Vollbildoverlay öffnet sich auf allen Bildschirmen.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmActivateAntrag(null)}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmActivateAntrag;
                  setConfirmActivateAntrag(null);
                  handleActivateAntrag(target.id);
                  // Kein Blur-Overlay für Strategieführung!
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/25 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Ja, auf allen Geräten aufrufen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals for Custom Motion, Edit Motion, Parser */}
      {showNewAntragModal && (
        <NewAntragModal
          currentUserName={currentUserName}
          isStrategieLeader={isStrategieLeader}
          parentAntrag={newAntragPreset?.parentAntrag}
          defaultType={newAntragPreset?.defaultType || 'AAA'}
          onClose={() => {
            setShowNewAntragModal(false);
            setNewAntragPreset(null);
          }}
          onSubmit={handleCreateAntrag}
        />
      )}

      {editingAntrag && (
        <EditAntragModal
          antrag={editingAntrag}
          onClose={() => setEditingAntrag(null)}
          onSave={handleSaveEditedAntrag}
          onDelete={handleDeleteAntrag}
        />
      )}

      {showParserModal && (
        <MotionParserModal
          onClose={() => setShowParserModal(false)}
          onImport={handleImportAntraege}
        />
      )}

      {/* Top Banner / SiP Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
            <Gavel className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                SiP Parlament Live-Tool
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Sync aktiv
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {session.title}
            </h1>
          </div>
        </div>

        {/* Right: Role toggle & User badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
            <User className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400">Angemeldet:</span>
            <strong className="text-slate-200">{currentUserName}</strong>
          </div>

          {/* Strategieführung Toggle */}
          <button
            type="button"
            onClick={() => {
              if (!isStrategieLeader && !isAdminUnlocked && currentMember.role !== 'strategie' && currentMember.role !== 'admin') {
                const pass = prompt('Bitte Passwort für die Strategieführung eingeben:');
                const validPass = settings.strategiePassword || 'strategie2026';
                if (pass !== null && pass === validPass) {
                  setIsStrategieLeader(true);
                } else if (pass !== null) {
                  alert('ungültiges Passwort, bitte versuche es erneut!');
                }
              } else {
                setIsStrategieLeader(!isStrategieLeader);
              }
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-bold transition cursor-pointer border ${
              isStrategieLeader
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
            }`}
          >
            {isStrategieLeader ? (
              <>
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Strategieführung (Admin)</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>Strategieführung aktivieren</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Prominent Vote Recommendation Banner (Always visible in Plenum) */}
      <VoteRecommendationBanner
        recommendation={session.voteRecommendation}
        isStrategieLeader={isStrategieLeader}
        onUpdateRecommendation={handleVoteRecommendationUpdate}
      />

      {/* Subtabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800 scrollbar-none">
        <button
          type="button"
          onClick={() => setCurrentSubTab('antraege')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            currentSubTab === 'antraege'
              ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Gavel className="w-4 h-4" />
          <span>Anträge & Wortmeldungen</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              currentSubTab === 'antraege'
                ? 'bg-slate-950 text-sky-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {session.antraege.filter((a) => a.status === 'approved').length}
          </span>
          {pendingCount > 0 && isStrategieLeader && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
              {pendingCount} neu
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCurrentSubTab('strategy')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            currentSubTab === 'strategy'
              ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Strategie & Redner:innen</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSubTab('drive')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            currentSubTab === 'drive'
              ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Google Drive Unterlagen</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSubTab('memes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap ${
            currentSubTab === 'memes'
              ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md shadow-pink-500/20'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Smile className="w-4 h-4 text-pink-400" />
          <span>Meme-Feed 🎭</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              currentSubTab === 'memes'
                ? 'bg-white text-pink-900'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {session.memes.length}
          </span>
        </button>
      </div>

      {/* Subtab 1: Anträge & Wortmeldungen */}
      {currentSubTab === 'antraege' && (
        <div className="space-y-5">
          {/* ========================================================================= */}
          {/* A: STRATEGIEFÜHRUNGS-VIEW (Alle Anträge untereinander sichtbar & aufrufbar) */}
          {/* ========================================================================= */}
          {isStrategieLeader ? (
            <div className="space-y-5">
              {/* Active Plenum Banner for Leadership */}
              {activeAntrag && (
                <div className="bg-gradient-to-r from-sky-950/60 via-slate-900 to-indigo-950/60 border-2 border-sky-400 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3.5 w-3.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                          Aktuell auf allen Geräten im Plenum aktiv
                        </span>
                        <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${ANTRAG_TYPE_CONFIG[activeAntrag.type]?.badgeColor}`}>
                          {ANTRAG_TYPE_CONFIG[activeAntrag.type]?.shortLabel}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        {activeAntrag.title}
                      </h3>
                      {activeAntrag.claimedBy && (
                        <p className="text-xs text-emerald-400 font-medium">
                          🎙️ Redner:in: {activeAntrag.claimedBy}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearActiveAntrag}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold self-start sm:self-auto cursor-pointer transition"
                    title="Beendet die Live-Anzeige im Plenum (Mitglieder kehren auf den Warteraum zurück)"
                  >
                    <span>Aufruf beenden (Pause)</span>
                  </button>
                </div>
              )}

              {/* Action Row: Create Motion & Import Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewAntragPreset(null);
                      setShowNewAntragModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Neuen Antrag schreiben</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowParserModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-bold text-xs sm:text-sm transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Aus Dokument einlesen</span>
                  </button>
                </div>

                <div className="text-xs text-slate-400 font-medium">
                  Zeige {filteredAntraege.length} von {session.antraege.length} Anträgen (Strategieführungs-Ansicht)
                </div>
              </div>

              {/* Filter Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Search */}
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Suche nach Zeile, Stichwort, Redner:in oder Titel..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-sky-500"
                  />

                  {/* Claim Filter Buttons */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      type="button"
                      onClick={() => setClaimFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        claimFilter === 'ALL'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Alle Anträge
                    </button>
                    <button
                      type="button"
                      onClick={() => setClaimFilter('FREE')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        claimFilter === 'FREE'
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      🟢 Noch frei
                    </button>
                    <button
                      type="button"
                      onClick={() => setClaimFilter('MINE')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        claimFilter === 'MINE'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Meine geclaimten
                    </button>
                  </div>
                </div>

                {/* Type Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      typeFilter === 'ALL'
                        ? 'bg-sky-500 text-slate-950'
                        : 'bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    Alle Typen
                  </button>
                  {(Object.keys(ANTRAG_TYPE_CONFIG) as AntragType[]).map((t) => {
                    const conf = ANTRAG_TYPE_CONFIG[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTypeFilter(t)}
                        className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer whitespace-nowrap ${
                          typeFilter === t
                            ? 'bg-white text-slate-950 border-white'
                            : `${conf.badgeColor} hover:opacity-80`
                        }`}
                      >
                        {conf.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pending Approval Section for Leadership */}
              {pendingCount > 0 && (
                <div className="bg-amber-950/20 border-2 border-amber-500/40 rounded-3xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-amber-300">
                      Anträge von Mitgliedern zur Prüfung & Freigabe ({pendingCount})
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {session.antraege
                      .filter((a) => a.status === 'pending_approval')
                      .map((antrag) => (
                        <AntragCard
                          key={antrag.id}
                          antrag={antrag}
                          currentUserName={currentUserName}
                          isStrategieLeader={true}
                          onClaim={handleClaimAntrag}
                          onUnclaim={handleUnclaimAntrag}
                          onActivate={(a) => setConfirmActivateAntrag(a)}
                          onEdit={(a) => setEditingAntrag(a)}
                          onDelete={handleDeleteAntrag}
                          onApprove={handleApproveAntrag}
                          onReject={handleRejectAntrag}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Hint Bar for Leadership */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                <Play className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  <strong>Tipp:</strong> Klicke auf einen Antrag oder den Button <strong>„Aufrufen“</strong>, um das Bestätigungsfenster zu öffnen und den Antrag im Plenum für alle sichtbar zu schalten.
                </span>
              </div>

              {/* Motion Cards List Untereinander */}
              <div className="space-y-3.5">
                {filteredAntraege.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 text-slate-400">
                    <Gavel className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-medium">Keine Anträge gefunden.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Passe deine Filtereinstellungen an oder erstelle einen neuen Antrag!
                    </p>
                  </div>
                ) : (
                  filteredAntraege.map((antrag) => (
                    <AntragCard
                      key={antrag.id}
                      antrag={antrag}
                      currentUserName={currentUserName}
                      isStrategieLeader={true}
                      onClaim={handleClaimAntrag}
                      onUnclaim={handleUnclaimAntrag}
                      onActivate={(a) => setConfirmActivateAntrag(a)}
                      onEdit={(a) => setEditingAntrag(a)}
                      onDelete={handleDeleteAntrag}
                      onApprove={handleApproveAntrag}
                      onReject={handleRejectAntrag}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* B: MITGLIEDER-VIEW (Immer nur der von der Strategieführung freigegebene TOP) */
            /* ========================================================================= */
            <div className="space-y-5">
              {activeAntrag ? (
                <div className="space-y-5">
                  {/* Hero Card des aktuell freigegebenen Antrags */}
                  <div className="relative bg-slate-900 border-2 border-sky-400 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-sky-500/15 overflow-hidden">
                    {/* Background glow */}
                    <div className="absolute -top-24 -right-24 w-56 h-56 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

                    {/* Top Header Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                          Aktuell im Plenum aufgerufen
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            ANTRAG_TYPE_CONFIG[activeAntrag.type]?.badgeColor || 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          {ANTRAG_TYPE_CONFIG[activeAntrag.type]?.shortLabel} • {ANTRAG_TYPE_CONFIG[activeAntrag.type]?.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-sky-300 bg-sky-950/80 border border-sky-500/40 px-3 py-1 rounded-xl shadow-sm">
                          Antragsteller:in: <strong className="text-white">{activeAntrag.author}</strong>
                        </span>
                        {activeAntrag.lineOrParagraph && (
                          <span className="text-xs font-mono px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                            📍 {activeAntrag.lineOrParagraph}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Motion Title & Content */}
                    <h2 className="text-xl sm:text-2xl font-black text-white mb-3 leading-tight">
                      {activeAntrag.title}
                    </h2>

                    {/* Konkrete Forderungspunkte des Hauptantrags */}
                    {activeAntrag.forderungspunkte && activeAntrag.forderungspunkte.length > 0 && (
                      <div className="bg-gradient-to-r from-sky-950/50 via-slate-900 to-indigo-950/40 border border-sky-500/40 rounded-2xl p-4 sm:p-5 mb-5 shadow-lg">
                        <div className="flex items-center gap-2 text-sm font-bold text-sky-300 mb-3">
                          <Target className="w-4 h-4 text-sky-400" />
                          <span>Konkrete Forderungen des Hauptantrags ({activeAntrag.forderungspunkte.length}):</span>
                        </div>
                        <ul className="space-y-2.5">
                          {activeAntrag.forderungspunkte.map((fp, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-100">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-bold text-xs shrink-0 mt-0.5 border border-sky-500/40">
                                {idx + 1}
                              </span>
                              <span className="leading-relaxed font-medium">{fp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Vorbereitete Rede aus den SiP-Unterlagen */}
                    {activeAntrag.rede ? (
                      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-5 shadow-inner">
                        <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <Mic className="w-4 h-4 text-indigo-400" />
                            <h3 className="text-xs sm:text-sm font-bold text-indigo-300">
                              Vorbereitete Rede für das Plenum ({activeAntrag.author})
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(activeAntrag.rede || '');
                              setHasCopiedHeroRede(true);
                              setTimeout(() => setHasCopiedHeroRede(false), 2000);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                            title="Redetext in Zwischenablage kopieren"
                          >
                            {hasCopiedHeroRede ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Rede kopiert!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Rede kopieren</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                          {activeAntrag.rede}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-5 text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-sans shadow-inner">
                        {activeAntrag.content}
                      </div>
                    )}

                    {/* Bildungsdirektion / Admin Notes if present */}
                    {activeAntrag.adminNotes && (
                      <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs sm:text-sm text-amber-200">
                        <span className="font-bold block text-amber-300 mb-1">
                          🏛️ Stellungnahme & Erläuterung der Bildungsdirektion:
                        </span>
                        <p className="leading-relaxed whitespace-pre-wrap">
                          {activeAntrag.adminNotes}
                        </p>
                      </div>
                    )}

                    {/* Redezeit / Claiming Section */}
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                      <div>
                        <span className="text-xs font-semibold text-slate-400 block mb-0.5">
                          Redner:in zu diesem Antrag:
                        </span>
                        {activeAntrag.claimedBy ? (
                          <div className="flex items-center gap-2 text-sm font-bold text-white">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>
                              {activeAntrag.claimedBy === currentUserName ? (
                                <span className="text-emerald-300">Du hältst diese Rede! 🎙️</span>
                              ) : (
                                <span>Geclaimed von: <strong>{activeAntrag.claimedBy}</strong></span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-400 font-medium italic">
                            Noch kein(e) Redner:in eingeteilt – halte jetzt deine Rede!
                          </span>
                        )}
                      </div>

                      <div>
                        {!activeAntrag.claimedBy ? (
                          <button
                            type="button"
                            onClick={() => handleClaimAntrag(activeAntrag.id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-sky-500/20 transition cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4" />
                            <span>Redezeit claimen</span>
                          </button>
                        ) : activeAntrag.claimedBy === currentUserName ? (
                          <button
                            type="button"
                            onClick={() => handleUnclaimAntrag(activeAntrag.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-rose-300 border border-slate-700 text-xs font-medium transition cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Claim abgeben</span>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Interaktiver Bereich: ÄA, EA, SA, WM einreichen */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-950/40 via-slate-950 to-indigo-950/40 border border-sky-500/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">
                          Zusatzantrag oder Wortmeldung zu diesem Antrag
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">
                        Möchtest du eine Änderung, Streichung oder Wortmeldung zu diesem aktuellen Antrag einbringen?
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'AAA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-sky-500/20 border border-sky-500/40 text-sky-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">✏️ ÄA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Abänderungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'EA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">➕ EA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Erweiterungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'SA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-rose-500/20 border border-rose-500/40 text-rose-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">❌ SA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Streichungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'WM', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-amber-500/40 text-amber-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">🙋 WM</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Wortmeldung</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'ENDE_DEBATTE', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-purple-500/20 border border-purple-500/40 text-purple-200 transition text-center cursor-pointer group shadow col-span-2 sm:col-span-1"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">⚖️ GO</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Geschäftsordnung</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Eingereichte Zusatzanträge zu diesem Antrag - für alle Mitglieder sichtbar! */}
                  {activeSubAntraege.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
                      <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                        <span>Zusatzanträge zu diesem Antrag ({activeSubAntraege.length})</span>
                      </h3>
                      <div className="space-y-3">
                        {activeSubAntraege.map((sub) => (
                          <div
                            key={sub.id}
                            className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-white"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${ANTRAG_TYPE_CONFIG[sub.type]?.badgeColor}`}>
                                  {ANTRAG_TYPE_CONFIG[sub.type]?.shortLabel} • {ANTRAG_TYPE_CONFIG[sub.type]?.label}
                                </span>
                                <span className="text-xs font-semibold text-sky-300">
                                  Antragsteller:in: <strong className="text-white">{sub.author}</strong>
                                </span>
                              </div>

                              {/* Live Status Badge */}
                              {sub.status === 'pending_approval' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold">
                                  <Clock className="w-3 h-3 text-amber-400" />
                                  Bestätigung ausstehend
                                </span>
                              ) : sub.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  {sub.isEditedByAdmin ? 'Geändert durch Strategieführung' : 'Bestätigt & freigegeben'}
                                </span>
                              ) : sub.status === 'rejected' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold">
                                  <XCircle className="w-3 h-3 text-rose-400" />
                                  Von Strategieführung abgelehnt
                                </span>
                              ) : null}
                            </div>
                            <h4 className="font-bold text-sm text-slate-100 mb-1.5">{sub.title}</h4>
                            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                              <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{sub.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Warteraum wenn noch kein Antrag aufgerufen ist */
                <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center text-white shadow-xl flex flex-col items-center justify-center">
                  <div className="relative mb-5">
                    <div className="w-16 h-16 rounded-3xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center animate-pulse">
                      <Radio className="w-8 h-8" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 animate-ping" />
                  </div>

                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
                    Plenum bereit • Live verbunden
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white mb-2">
                    Warte auf Aufruf der Strategieführung...
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                    Sobald die Strategieführung den nächsten Antrag im Plenum aufruft, ploppt dieser automatisch mit akustischem Signal und Vollbild-Overlay auf deinem Bildschirm auf.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setNewAntragPreset(null);
                      setShowNewAntragModal(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Antrag / Wortmeldung vorab vorbereiten</span>
                  </button>

                  {/* Eingereichte Anträge aus dem Plenum im Warteraum anzeigen */}
                  {session.antraege.filter((a) => !a.isPreFab).length > 0 && (
                    <div className="w-full max-w-2xl mt-8 text-left bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                        Aus dem Plenum eingereichte Anträge:
                      </h4>
                      <div className="space-y-2.5">
                        {session.antraege
                          .filter((a) => !a.isPreFab)
                          .map((a) => (
                            <div key={a.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-200">{a.title}</span>
                                {a.status === 'pending_approval' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                    ⏳ Bestätigung ausstehend
                                  </span>
                                ) : a.status === 'approved' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                    {a.isEditedByAdmin ? '✏️ Geändert von Strategieführung' : '✅ Bestätigt'}
                                  </span>
                                ) : a.status === 'rejected' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                    ❌ Abgelehnt
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-[11px] text-slate-400">Antragsteller:in: {a.author}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Strategie & Taktik */}
      {currentSubTab === 'strategy' && (
        <StrategyNotesTab
          strategyNotes={session.strategyNotes}
          antraege={session.antraege}
          isStrategieLeader={isStrategieLeader}
          onSaveNotes={handleUpdateStrategyNotes}
        />
      )}

      {/* Subtab 3: Google Drive & Unterlagen */}
      {currentSubTab === 'drive' && (
        <DriveFolderViewer
          driveFolderUrl={session.driveFolderUrl}
          isStrategieLeader={isStrategieLeader}
          onUpdateFolderUrl={handleUpdateDriveUrl}
          onOpenParser={() => setShowParserModal(true)}
        />
      )}

      {/* Subtab 4: Meme-Feed */}
      {currentSubTab === 'memes' && (
        <MemeFeedTab
          memes={session.memes}
          currentUserName={currentUserName}
          onAddMeme={handleAddMeme}
          onReactMeme={handleReactMeme}
        />
      )}
    </div>
  );
};
