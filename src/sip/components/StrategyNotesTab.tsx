import React, { useState } from 'react';
import {
  Target,
  Edit2,
  Check,
  Users,
  ShieldAlert,
  Sparkles,
  Award,
  BookOpen,
} from 'lucide-react';
import { SipAntrag } from '../types';

interface StrategyNotesTabProps {
  strategyNotes: string;
  antraege: SipAntrag[];
  isStrategieLeader: boolean;
  onSaveNotes: (notes: string) => void;
}

export const StrategyNotesTab: React.FC<StrategyNotesTabProps> = ({
  strategyNotes,
  antraege,
  isStrategieLeader,
  onSaveNotes,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(strategyNotes);

  const claimedAntraege = antraege.filter((a) => a.claimedBy);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSaveNotes(text);
    setIsEditing(false);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Card: Strategy Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">SiP-Strategie & Leitfaden</h2>
              <p className="text-xs text-slate-400">
                Zentrale Taktik und Beschlussziele der Strategieführung
              </p>
            </div>
          </div>

          {isStrategieLeader && (
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs sm:text-sm font-medium text-slate-200 transition cursor-pointer self-start sm:self-auto"
            >
              <Edit2 className="w-3.5 h-3.5 text-sky-400" />
              <span>{isEditing ? 'Abbrechen' : 'Strategie bearbeiten'}</span>
            </button>
          )}
        </div>

        {isEditing && isStrategieLeader ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Strategie-Text (Markdown & Formatierung möglich):
              </label>
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-mono text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setText(strategyNotes);
                  setIsEditing(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Strategie für alle speichern</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="prose prose-invert max-w-none text-xs sm:text-sm leading-relaxed text-slate-300 whitespace-pre-wrap bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80">
            {strategyNotes || 'Noch keine Strategienotizen hinterlegt.'}
          </div>
        )}
      </div>

      {/* Speaker / Claimed Motions Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold">Redner:innen & Claim-Matrix</h3>
            <p className="text-xs text-slate-400">
              Übersicht, welche Personen welche Anträge im Plenum vortragen
            </p>
          </div>
        </div>

        {claimedAntraege.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-400 text-xs">
            Bislang wurden noch keine Anträge von Mitgliedern geclaimed.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {claimedAntraege.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-emerald-400">
                      👤 {item.claimedBy}
                    </span>
                    {item.lineOrParagraph && (
                      <span className="text-[10px] text-slate-500">
                        ({item.lineOrParagraph})
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-semibold text-white line-clamp-1">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                    {item.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
