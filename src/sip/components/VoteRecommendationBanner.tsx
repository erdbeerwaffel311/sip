import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  MinusCircle,
  HelpCircle,
  Sparkles,
  Edit3,
  Send,
  Volume2,
} from 'lucide-react';
import { VoteRecommendation, VoteType } from '../types';

interface VoteRecommendationBannerProps {
  recommendation: VoteRecommendation;
  isStrategieLeader: boolean;
  onUpdateRecommendation: (rec: { type: VoteType; note: string }) => void;
}

export const VoteRecommendationBanner: React.FC<VoteRecommendationBannerProps> = ({
  recommendation,
  isStrategieLeader,
  onUpdateRecommendation,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedType, setSelectedType] = useState<VoteType>(recommendation.type);
  const [customNote, setCustomNote] = useState(recommendation.note);

  const getStyleForVote = (type: VoteType) => {
    switch (type) {
      case 'JA':
        return {
          bg: 'bg-gradient-to-r from-emerald-600 to-green-700',
          border: 'border-emerald-400',
          badgeBg: 'bg-white text-emerald-900',
          icon: <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white shrink-0" />,
          label: 'JA',
          title: 'ABSTIMMUNGSEMPFEHLUNG: JA',
        };
      case 'NEIN':
        return {
          bg: 'bg-gradient-to-r from-rose-600 to-red-700',
          border: 'border-rose-400',
          badgeBg: 'bg-white text-rose-900',
          icon: <XCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white shrink-0" />,
          label: 'NEIN',
          title: 'ABSTIMMUNGSEMPFEHLUNG: NEIN',
        };
      case 'ENTHALTUNG':
        return {
          bg: 'bg-gradient-to-r from-amber-600 to-yellow-700',
          border: 'border-amber-400',
          badgeBg: 'bg-white text-amber-900',
          icon: <MinusCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white shrink-0" />,
          label: 'ENTHALTUNG',
          title: 'ABSTIMMUNGSEMPFEHLUNG: ENTHALTUNG',
        };
      case 'FREI':
        return {
          bg: 'bg-gradient-to-r from-sky-600 to-blue-700',
          border: 'border-sky-400',
          badgeBg: 'bg-white text-sky-900',
          icon: <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-white shrink-0" />,
          label: 'FREIE WAHL',
          title: 'FREIE ABSTIMMUNG / GEWISSENSENTSCHEID',
        };
      case 'KEINE':
      default:
        return {
          bg: 'bg-slate-800',
          border: 'border-slate-700',
          badgeBg: 'bg-slate-700 text-slate-200',
          icon: <HelpCircle className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400 shrink-0" />,
          label: 'NOCH OFFEN',
          title: 'KEINE ABSTIMMUNGSEMPFEHLUNG',
        };
    }
  };

  const currentStyle = getStyleForVote(recommendation.type);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onUpdateRecommendation({
      type: selectedType,
      note: customNote.trim(),
    });
    setIsEditing(false);
  }

  return (
    <div className="w-full mb-6">
      <div
        className={`relative overflow-hidden rounded-2xl border-2 ${currentStyle.border} ${currentStyle.bg} p-4 sm:p-5 text-white shadow-xl shadow-black/30 transition-all duration-300`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Vote icon & Decision */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-black/20 backdrop-blur border border-white/20">
              {currentStyle.icon}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/30 border border-white/20">
                  Zentrale Strategie
                </span>
                <span className="text-xs text-white/80">
                  {new Date(recommendation.updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  Uhr
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-xs sm:text-sm font-semibold opacity-90">
                  Offizielle Empfehlung:
                </span>
                <span
                  className={`text-2xl sm:text-3xl font-black tracking-tight px-3 py-0.5 rounded-xl shadow-md ${currentStyle.badgeBg}`}
                >
                  {currentStyle.label}
                </span>
              </div>

              {recommendation.note && (
                <p className="mt-1 text-xs sm:text-sm text-white/95 font-medium leading-relaxed max-w-2xl bg-black/15 p-2 rounded-lg border border-white/10">
                  💬 {recommendation.note}
                </p>
              )}
            </div>
          </div>

          {/* Right: Quick Action Controls for Strategieführung */}
          {isStrategieLeader && (
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType(recommendation.type);
                    setCustomNote(recommendation.note);
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur border border-white/30 text-white text-xs sm:text-sm font-bold transition cursor-pointer"
                  title="Abstimmungsempfehlung anpassen & zentral pushen"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Empfehlung ändern</span>
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Inline Editor for Leadership */}
        {isEditing && isStrategieLeader && (
          <form
            onSubmit={handleSave}
            className="mt-4 pt-4 border-t border-white/20 bg-black/25 p-4 rounded-xl"
          >
            <div className="text-xs font-bold uppercase tracking-wider mb-2 text-white/90">
              Neue Abstimmungsempfehlung an alle Mitglieder senden:
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {(['JA', 'NEIN', 'ENTHALTUNG', 'FREI'] as VoteType[]).map((type) => {
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`py-2 px-3 rounded-xl font-black text-xs sm:text-sm border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-white text-slate-950 border-white shadow-md'
                        : 'bg-black/30 text-white hover:bg-black/40 border-white/20'
                    }`}
                  >
                    {type === 'JA' && '✅ JA'}
                    {type === 'NEIN' && '❌ NEIN'}
                    {type === 'ENTHALTUNG' && '⚠️ ENTHALTUNG'}
                    {type === 'FREI' && '⚖️ FREIE WAHL'}
                  </button>
                );
              })}
            </div>

            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-white/80 mb-1">
                Begründung / taktische Notiz für alle Mitglieder:
              </label>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="z.B. Unbedingt zustimmen, stärkt unsere Initiative!"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg bg-black/40 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-white text-slate-950 font-bold text-xs sm:text-sm hover:bg-slate-100 transition shadow-md cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Zentral an alle senden</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
