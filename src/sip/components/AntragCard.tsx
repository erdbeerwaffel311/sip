import React, { useState } from 'react';
import {
  UserCheck,
  UserX,
  Play,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, SipAntrag } from '../types';

interface AntragCardProps {
  antrag: SipAntrag;
  currentUserName: string;
  isStrategieLeader: boolean;
  onClaim: (antragId: string) => void;
  onUnclaim: (antragId: string) => void;
  onActivate: (antragId: string) => void;
  onEdit: (antrag: SipAntrag) => void;
  onDelete: (antragId: string) => void;
  onApprove?: (antragId: string) => void;
  onReject?: (antragId: string) => void;
}

export const AntragCard: React.FC<AntragCardProps> = ({
  antrag,
  currentUserName,
  isStrategieLeader,
  onClaim,
  onUnclaim,
  onActivate,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const typeConfig = ANTRAG_TYPE_CONFIG[antrag.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;
  const isClaimedByMe = antrag.claimedBy === currentUserName;
  const isPending = antrag.status === 'pending_approval';

  return (
    <div
      id={`antrag-${antrag.id}`}
      className={`relative rounded-2xl border transition-all duration-300 p-4 sm:p-5 ${
        antrag.isActive
          ? 'bg-slate-900 border-sky-400 ring-2 ring-sky-400/40 shadow-xl shadow-sky-500/10'
          : isPending
          ? 'bg-slate-900/60 border-amber-500/40'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Top Banner if Active in Plenum */}
      {antrag.isActive && (
        <div className="absolute -top-3 left-4 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-sky-500 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Aktuell im Plenum</span>
        </div>
      )}

      {/* Pending status warning */}
      {isPending && (
        <div className="mb-3 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-300">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Wartet auf Prüfung & Freigabe durch die Strategieführung
          </span>
          {isStrategieLeader && onApprove && onReject && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onApprove(antrag.id)}
                className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer"
              >
                Freigeben
              </button>
              <button
                type="button"
                onClick={() => onReject(antrag.id)}
                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-medium text-[11px] cursor-pointer"
              >
                Ablehnen
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Left: Badges & Title */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border ${typeConfig.badgeColor}`}
            >
              {typeConfig.shortLabel}
            </span>

            {antrag.lineOrParagraph && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                📍 {antrag.lineOrParagraph}
              </span>
            )}

            <span className="text-[11px] text-slate-400">
              von {antrag.author}
            </span>
          </div>

          <h3 className="text-base sm:text-lg font-bold text-white mb-2 leading-snug">
            {antrag.title}
          </h3>

          {/* Content / Text */}
          <div className="relative">
            <p
              className={`text-xs sm:text-sm text-slate-300 leading-relaxed ${
                !isExpanded ? 'line-clamp-3' : ''
              }`}
            >
              {antrag.content}
            </p>
            {antrag.content.length > 180 && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-1 text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-0.5 cursor-pointer"
              >
                {isExpanded ? (
                  <>
                    <span>Weniger anzeigen</span>
                    <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <span>Ganzen Antrag lesen</span>
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right / Bottom: Claim Status & Actions */}
        <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
          {/* Claim Status Display */}
          <div className="flex items-center gap-1.5 text-xs">
            {antrag.claimedBy ? (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold border ${
                  isClaimedByMe
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {isClaimedByMe ? (
                    <>Von dir geclaimed</>
                  ) : (
                    <>
                      Geclaimed von: <strong>{antrag.claimedBy}</strong>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <span className="text-slate-400 text-xs italic">
                Noch nicht vergeben
              </span>
            )}
          </div>

          {/* Claiming Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!antrag.claimedBy ? (
              <button
                type="button"
                onClick={() => onClaim(antrag.id)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-sky-500/20 transition cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Antrag claimen</span>
              </button>
            ) : isClaimedByMe || isStrategieLeader ? (
              <button
                type="button"
                onClick={() => onUnclaim(antrag.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 font-medium text-xs transition cursor-pointer"
                title="Claim freigeben"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Claim abgeben</span>
              </button>
            ) : null}

            {/* Strategieführung Controls */}
            {isStrategieLeader && (
              <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
                {!antrag.isActive && (
                  <button
                    type="button"
                    onClick={() => onActivate(antrag.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition cursor-pointer"
                    title="Im Plenum aufrufen (ploppt auf allen Geräten auf!)"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Aufrufen</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onEdit(antrag)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Antrag bearbeiten"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => onDelete(antrag.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  title="Antrag löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
