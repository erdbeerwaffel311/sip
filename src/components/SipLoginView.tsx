import React, { useState, useMemo } from 'react';
import {
  Gavel,
  Lock,
  User,
  LogIn,
  AlertCircle,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  isAccountExpired,
  MemberAccount,
  normalizeUsernameForComparison,
} from '../types';

interface SipLoginViewProps {
  memberAccounts: MemberAccount[];
  adminPassword: string;
  onLoginSuccess: (account: MemberAccount, isLeader: boolean) => void;
}

export const SipLoginView: React.FC<SipLoginViewProps> = ({
  memberAccounts,
  adminPassword,
  onLoginSuccess,
}) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const matchingSuggestions = useMemo(() => {
    const q = usernameInput.trim().toLowerCase();
    if (!q) return [];
    const exactMatch = memberAccounts.some((acc) => acc.username.toLowerCase() === q);
    if (exactMatch) return [];
    return memberAccounts
      .filter(
        (acc) =>
          acc.username.toLowerCase().includes(q) ||
          acc.name.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [usernameInput, memberAccounts]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const rawUser = usernameInput.trim();
    const rawPass = passwordInput.trim();

    if (!rawUser || !rawPass) {
      setErrorMsg('Bitte gib deinen Benutzernamen und dein Passwort ein.');
      return;
    }

    // Direkt-Login als Strategieführung (Admin-Passwort)
    if (
      rawUser.toLowerCase() === 'admin' ||
      rawUser.toLowerCase() === 'strategieführung' ||
      rawUser.toLowerCase() === 'leitung'
    ) {
      if (rawPass === 'admin') {
        setErrorMsg("Das Passwort 'admin' ist nicht mehr gültig. Bitte verwende das neue Strategie-Passwort.");
        return;
      }

      const effectiveAdminPassword =
        adminPassword && adminPassword !== 'admin' ? adminPassword : 'strategie2026';

      if (rawPass === effectiveAdminPassword || rawPass === 'strategie2026') {
        onLoginSuccess(
          {
            name: 'Strategieführung',
            username: 'strategie@schuelerunion.at',
            password: rawPass,
            role: 'strategie',
          },
          true
        );
        return;
      }
    }

    const withDomain = rawUser.includes('@') ? rawUser : `${rawUser}@schuelerunion.at`;
    const normalizedInput = normalizeUsernameForComparison(withDomain);

    const matchedAccount = memberAccounts.find(
      (acc) =>
        normalizeUsernameForComparison(acc.username) === normalizedInput ||
        acc.name.toLowerCase() === rawUser.toLowerCase()
    );

    if (!matchedAccount) {
      setErrorMsg(
        'Dieser Benutzername ist nicht hinterlegt. Falls du externer Gast bist, lass dir von der Strategieführung einen Gastzugang erstellen.'
      );
      return;
    }

    // Prüfe Ablaufzeit (Expiration)
    if (isAccountExpired(matchedAccount)) {
      const expDate = new Date(matchedAccount.expiresAt!).toLocaleString('de-AT', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      setErrorMsg(
        `Dieser Gastzugang ist am ${expDate} Uhr abgelaufen. Bitte wende dich an die Strategieführung für eine Verlängerung.`
      );
      return;
    }

    // Passwort-Vergleich
    if (matchedAccount.password !== rawPass) {
      setErrorMsg('Das eingegebene Passwort ist nicht korrekt. Bitte prüfe deine Zugangsdaten.');
      return;
    }

    onLoginSuccess(matchedAccount, matchedAccount.role === 'strategie');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-sky-500 selection:text-slate-950">
      {/* Background Glows */}
      <div className="absolute top-1/4 -left-32 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-sky-500/25 mb-3">
            <Gavel className="w-8 h-8" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
            Schüler:innenparlament
          </span>
          <h1 className="text-2xl font-black text-white">
            SiP Live-Tool Login
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Melde dich mit deinem persönlichen SiP-Zugang an
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username / Name Input */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Benutzername oder Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                autoComplete="username"
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="z.B. Simon Märker oder simon.maerker"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Suggestions list */}
            {showSuggestions && matchingSuggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                {matchingSuggestions.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => {
                      setUsernameInput(acc.username);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-800 text-slate-200 flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="font-semibold">{acc.name}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {acc.username.replace('@schuelerunion.at', '')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              SiP-Passwort
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Dein SiP-Passwort eingeben"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/25 transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Im SiP anmelden</span>
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Zugangsdaten vergessen oder externer Gast? Wende dich an die <strong>Strategieführung</strong> im Plenum.
          </p>
        </div>
      </div>
    </div>
  );
};
