import React, { useEffect } from 'react';
import { Eye, Clock, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, SipAntrag } from '../types';

interface BlurryMotionModalProps {
  antrag: SipAntrag;
  onViewNow: () => void;
  onDismiss: () => void;
}

export const BlurryMotionModal: React.FC<BlurryMotionModalProps> = ({
  antrag,
  onViewNow,
  onDismiss,
}) => {
  const typeConfig = ANTRAG_TYPE_CONFIG[antrag.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;

  // Akustischer Ton beim Aufploppen (dezentes Ding-Dong via Web Audio API)
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch {}
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg bg-slate-900/95 border-2 border-sky-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-sky-500/20 text-white overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Badge & Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-400/40 text-sky-400 mb-4 animate-bounce">
            <AlertCircle className="w-8 h-8" />
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
            Plenum aufgerufen
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
            Neuer Antrag aufgerufen!
          </h2>

          <p className="text-slate-300 text-sm mb-5">
            Die Strategieführung hat soeben einen neuen Antrag im Plenum zur Behandlung aktiviert:
          </p>

          {/* Antrag Preview Box */}
          <div className="w-full text-left bg-slate-950/70 border border-slate-800 rounded-2xl p-4 mb-6 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${typeConfig.badgeColor}`}
              >
                {typeConfig.shortLabel} • {typeConfig.label}
              </span>
              {antrag.lineOrParagraph && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {antrag.lineOrParagraph}
                </span>
              )}
            </div>

            <h3 className="font-bold text-base text-slate-100 mb-1.5 leading-snug">
              {antrag.title}
            </h3>

            <p className="text-xs text-slate-400 line-clamp-3 italic">
              "{antrag.content}"
            </p>

            {antrag.claimedBy && (
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Bereits geclaimed von: <strong>{antrag.claimedBy}</strong></span>
              </div>
            )}
          </div>

          {/* Buttons: Jetzt ansehen vs. Später */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onViewNow}
              className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold shadow-lg shadow-sky-500/30 transition transform hover:-translate-y-0.5 cursor-pointer text-sm sm:text-base"
            >
              <Eye className="w-4 h-4" />
              <span>Jetzt ansehen</span>
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white font-medium transition cursor-pointer text-sm sm:text-base"
            >
              <Clock className="w-4 h-4" />
              <span>Später</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
