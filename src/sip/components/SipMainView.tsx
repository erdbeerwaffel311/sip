import React, { useState, useEffect, useMemo } from 'react';
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
  const [isStrategieLeader, setIsStrategieLeader] = useState<boolean>(isAdminUnlocked);

  // Modals & Popups
  const [activeBlurAntrag, setActiveBlurAntrag] = useState<SipAntrag | null>(null);
  const [showNewAntragModal, setShowNewAntragModal] = useState(false);
  const [editingAntrag, setEditingAntrag] = useState<SipAntrag | null>(null);
  const [showParserModal, setShowParserModal] = useState(false);

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
      // Blurry Screen nur anzeigen, wenn der Nutzer nicht selbst gerade der Admin ist, der ihn aufgerufen hat
      setActiveBlurAntrag(antrag);
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

  // Wenn globaler Admin entsperrt ist, Strategieführung aktivieren
  useEffect(() => {
    if (isAdminUnlocked) {
      setIsStrategieLeader(true);
    }
  }, [isAdminUnlocked]);

  // Anträge filtern
  const filteredAntraege = useMemo(() => {
    return session.antraege.filter((item) => {
      // Wenn der Antrag noch nicht freigegeben ist:
      // Strategieführung sieht alle; normale Mitglieder sehen nur freigegebene ODER ihre selbst eingereichten
      if (item.status === 'pending_approval') {
        if (!isStrategieLeader && item.author !== currentUserName) {
          return false;
        }
      }

      if (item.status === 'rejected') {
        return false;
      }

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
  }, [session.antraege, typeFilter, claimFilter, searchQuery, isStrategieLeader, currentUserName]);

  // Zähler für Anträge zur Prüfung
  const pendingCount = useMemo(() => {
    return session.antraege.filter((a) => a.status === 'pending_approval').length;
  }, [session.antraege]);

  // Handlers
  function handleActivateAntrag(antragId: string) {
    sipRealtime.activateAntrag(antragId, settings);
  }

  function handleClaimAntrag(antragId: string) {
    sipRealtime.claimAntrag(antragId, currentUserName, settings);
  }

  function handleUnclaimAntrag(antragId: string) {
    sipRealtime.unclaimAntrag(antragId, currentUserName, settings);
  }

  function handleVoteRecommendationUpdate(rec: { type: VoteType; note: string }) {
    sipRealtime.setVoteRecommendation(
      {
        type: rec.type,
        note: rec.note,
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

      {/* Blurry Screen Modal for New Motions */}
      {activeBlurAntrag && (
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

      {/* Modals for Custom Motion, Edit Motion, Parser */}
      {showNewAntragModal && (
        <NewAntragModal
          currentUserName={currentUserName}
          isStrategieLeader={isStrategieLeader}
          onClose={() => setShowNewAntragModal(false)}
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
              if (!isStrategieLeader && !isAdminUnlocked) {
                const pass = prompt('Bitte Passwort für die Strategieführung (Admin) eingeben:');
                if (pass === settings.adminPassword || pass === 'strategie2026') {
                  setIsStrategieLeader(true);
                } else if (pass !== null) {
                  alert('Ungültiges Passwort für die Strategieführung.');
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
          {/* Action Row: Create Motion & Import Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewAntragModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Neuen Antrag schreiben</span>
              </button>

              {isStrategieLeader && (
                <button
                  type="button"
                  onClick={() => setShowParserModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-bold text-xs sm:text-sm transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Aus Dokument einlesen</span>
                </button>
              )}
            </div>

            <div className="text-xs text-slate-400 font-medium">
              Zeige {filteredAntraege.length} von {session.antraege.length} Anträgen
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
          {pendingCount > 0 && isStrategieLeader && (
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
                      isStrategieLeader={isStrategieLeader}
                      onClaim={handleClaimAntrag}
                      onUnclaim={handleUnclaimAntrag}
                      onActivate={handleActivateAntrag}
                      onEdit={(a) => setEditingAntrag(a)}
                      onDelete={handleDeleteAntrag}
                      onApprove={handleApproveAntrag}
                      onReject={handleRejectAntrag}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Motion Cards List */}
          <div className="space-y-3.5">
            {filteredAntraege.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 text-slate-400">
                <Gavel className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium">Keine Anträge gefunden.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Passe deine Filtereinstellungen an oder reiche einen neuen Antrag ein!
                </p>
              </div>
            ) : (
              filteredAntraege.map((antrag) => (
                <AntragCard
                  key={antrag.id}
                  antrag={antrag}
                  currentUserName={currentUserName}
                  isStrategieLeader={isStrategieLeader}
                  onClaim={handleClaimAntrag}
                  onUnclaim={handleUnclaimAntrag}
                  onActivate={handleActivateAntrag}
                  onEdit={(a) => setEditingAntrag(a)}
                  onDelete={handleDeleteAntrag}
                  onApprove={handleApproveAntrag}
                  onReject={handleRejectAntrag}
                />
              ))
            )}
          </div>
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
