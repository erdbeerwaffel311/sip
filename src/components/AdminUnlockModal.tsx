import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  Smartphone,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  X,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { verifyTotpCode, verifyAndConsumeBackupCode } from '../utils/totp';

interface AdminUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
  totpEnabled?: boolean;
  totpSecret?: string;
  totpBackupCodes?: string[];
  onConsumeBackupCode: (usedCode: string) => Promise<boolean>;
  onUnlockSuccess: () => void;
}

export const AdminUnlockModal: React.FC<AdminUnlockModalProps> = ({
  isOpen,
  onClose,
  adminPassword,
  totpEnabled,
  totpSecret,
  totpBackupCodes = [],
  onConsumeBackupCode,
  onUnlockSuccess,
}) => {
  const [stage, setStage] = useState<'password' | 'totp' | 'backup_code'>('password');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('password');
      setPasswordInput('');
      setTotpCodeInput('');
      setBackupCodeInput('');
      setErrorMsg(null);
      setSuccessNotice(null);
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const entered = passwordInput.trim();
    if (!entered) {
      setErrorMsg('Bitte gib das Administrator-Passwort ein.');
      return;
    }

    if (entered !== adminPassword) {
      setErrorMsg('Ungültiges Administrator-Passwort, bitte versuche es erneut!');
      return;
    }

    // Passwort korrekt -> Wenn 2FA aktiv ist, zur 2FA-Ebene wechseln
    if (totpEnabled && totpSecret) {
      setStage('totp');
      setTotpCodeInput('');
      setErrorMsg(null);
      return;
    }

    // Wenn kein 2FA aktiv ist, direkt entsperren
    onUnlockSuccess();
    onClose();
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!totpSecret) {
      setErrorMsg('2FA-Geheimschlüssel nicht gefunden. Bitte Notfallcode nutzen.');
      return;
    }

    const clean = totpCodeInput.replace(/\s+/g, '').trim();
    if (clean.length !== 6) {
      setErrorMsg('Bitte gib den vollständigen 6-stelligen Code ein.');
      return;
    }

    setIsVerifying(true);
    try {
      const valid = await verifyTotpCode(totpSecret, clean);
      if (!valid) {
        setErrorMsg('Ungültiger 6-stelliger Code. Bitte überprüfe die Authenticator-App und versuche es erneut.');
        return;
      }

      onUnlockSuccess();
      onClose();
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleBackupCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const cleanInput = backupCodeInput.trim();
    if (!cleanInput) {
      setErrorMsg('Bitte gib einen Notfallcode ein.');
      return;
    }

    const verification = verifyAndConsumeBackupCode(cleanInput, totpBackupCodes);
    if (!verification.valid || !verification.usedCode) {
      setErrorMsg('Ungültiger oder bereits verbrauchter Notfallcode. Bitte überprüfe deine Liste.');
      return;
    }

    setIsVerifying(true);
    try {
      const consumed = await onConsumeBackupCode(verification.usedCode);
      if (!consumed) {
        setErrorMsg('Fehler beim Einlösen des Notfallcodes. Bitte erneut versuchen.');
        return;
      }

      setSuccessNotice(`Notfallcode erfolgreich eingelöst! Noch ${verification.remainingCodes.length} Ersatzcodes übrig.`);
      setTimeout(() => {
        onUnlockSuccess();
        onClose();
      }, 700);
    } finally {
      setIsVerifying(false);
    }
  }

  const remainingBackupCount = totpBackupCodes.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Admin-Bereich entsperren</h2>
              <p className="text-xs text-slate-400">
                {stage === 'password' && 'Stufe 1: Administrator-Passwort'}
                {stage === 'totp' && 'Stufe 2: Zwei-Faktor-Authentifizierung (2FA)'}
                {stage === 'backup_code' && 'Notfallzugang: Ersatzcode'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Message */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successNotice && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-semibold">{successNotice}</span>
          </div>
        )}

        {/* STUFE 1: Passwort */}
        {stage === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Administrator-Passwort
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Passwort eingeben"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
            >
              Weiter
            </button>

            {/* Notfall-Link */}
            <div className="pt-2 text-center border-t border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setStage('backup_code');
                  setErrorMsg(null);
                }}
                className="text-xs text-slate-400 hover:text-amber-400 underline decoration-slate-600 underline-offset-4 transition cursor-pointer"
              >
                Passwort oder Handy verloren? Mit Notfallcode entsperren
              </button>
            </div>
          </form>
        )}

        {/* STUFE 2: 6-stelliger TOTP Handycode */}
        {stage === 'totp' && (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-2">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-white">6-stelligen Bestätigungscode eingeben</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Öffne deine Authenticator-App (z. B. Google Authenticator, Apple Passwörter) und gib den aktuellen Code ein:
              </p>
            </div>

            <div>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={totpCodeInput}
                onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full py-3 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-[0.5em] text-2xl font-bold focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying || totpCodeInput.length !== 6}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
            >
              {isVerifying ? 'Überprüfe Code...' : 'Code bestätigen & Admin entsperren'}
            </button>

            <div className="pt-2 flex flex-col items-center gap-2 border-t border-slate-800/60 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStage('backup_code');
                  setErrorMsg(null);
                }}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Kein Zugriff auf das Smartphone? Ersatzcode verwenden
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage('password');
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-slate-300 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Zurück zum Passwort</span>
              </button>
            </div>
          </form>
        )}

        {/* NOTFALLSTUFE: Ersatzcode */}
        {stage === 'backup_code' && (
          <form onSubmit={handleBackupCodeSubmit} className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <KeyRound className="w-4 h-4" />
                <span>Ersatzcode (Notfallzugang)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Gib einen deiner 10 Notfallcodes ein. Jeder Code kann genau einmal zur Anmeldung genutzt werden.
              </p>
              <div className="text-[11px] text-slate-400 font-mono pt-0.5">
                Verbleibende Ersatzcodes: <strong className="text-white">{remainingBackupCount}</strong> von 10
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Notfallcode eingeben (z. B. XXXX-XXXX)
              </label>
              <input
                type="text"
                required
                autoFocus
                value={backupCodeInput}
                onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-base font-bold focus:outline-none focus:border-amber-500 uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying || !backupCodeInput.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
            >
              {isVerifying ? 'Prüfe Notfallcode...' : 'Mit Notfallcode entsperren'}
            </button>

            <div className="pt-2 text-center border-t border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setStage('password');
                  setErrorMsg(null);
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Zurück zur regulären Anmeldung</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
