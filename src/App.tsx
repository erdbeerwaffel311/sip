import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User,
  LogOut,
  Star,
} from 'lucide-react';
import { AppSettings, DEFAULT_SIP_SETTINGS, isAccountExpired, MemberAccount } from './types';
import suLogo from './assets/su-logo.png';
import { SipLoginView } from './components/SipLoginView';
import { SipAdminView } from './components/SipAdminView';
import { SipMainView } from './sip/components/SipMainView';
import { sipRealtime } from './sip/sipRealtime';
import { verifyAdmin2FACode, querySipRow, upsertSipRow, SIP_CONFIG_ROW_ID } from './utils/supabaseSync';
import { verifyTotpCode } from './utils/totp';

const STORAGE_KEYS = {
  SETTINGS: 'sip_standalone_settings_v3',
  LOGGED_USER: 'sip_logged_in_user_v3',
  ADMIN_UNLOCKED: 'sip_admin_unlocked_v3',
};

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.adminPassword === 'admin') {
          parsed.adminPassword = 'admin2026!';
        }
        return {
          ...DEFAULT_SIP_SETTINGS,
          ...parsed,
          adminPassword: parsed.adminPassword || 'admin2026!',
          strategiePassword: parsed.strategiePassword || 'strategie2026',
          totpSecret: parsed.totpSecret || '',
          totpEnabled: parsed.totpEnabled ?? false,
        };
      }
    } catch (loadSettingsErr) {}
    return DEFAULT_SIP_SETTINGS;
  });

  const [currentUser, setCurrentUser] = useState<MemberAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGGED_USER);
      if (saved) {
        const acc = JSON.parse(saved) as MemberAccount;
        if (!isAccountExpired(acc)) return acc;
      }
    } catch (loadUserErr) {}
    return null;
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.ADMIN_UNLOCKED) === 'true';
  });

  const [currentView, setCurrentView] = useState<'parliament' | 'admin'>('parliament');
  const [initial2FAVerified, setInitial2FAVerified] = useState(false);

  // Automatische Erkennung beim Öffnen über den 2FA-Bestätigungslink aus der E-Mail (wie im Inventurprogramm)
  useEffect(() => {
    const url = new URL(window.location.href);
    const has2FAParam =
      url.searchParams.get('2fa') === 'verify' ||
      url.hash.includes('access_token') ||
      Boolean(url.searchParams.get('2fa_code'));

    function grantAdminSession() {
      setInitial2FAVerified(true);
      setIsAdminUnlocked(true);
      localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
      setCurrentView('admin');

      // Falls aktuell noch kein Benutzer eingeloggt ist, erstelle eine verifizierte Admin-Sitzung
      setCurrentUser((prev) => {
        if (prev) return prev;
        const matched = settings.memberAccounts.find(
          (a) => a.username.toLowerCase() === settings.adminEmail?.toLowerCase()
        );
        const adminUser: MemberAccount = matched || {
          name: 'Administrator',
          username: settings.adminEmail || 'admin@schuelerunion.at',
          password: settings.adminPassword,
          role: 'admin',
        };
        localStorage.setItem(STORAGE_KEYS.LOGGED_USER, JSON.stringify(adminUser));
        return adminUser;
      });

      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (has2FAParam && settings.adminEmail) {
      verifyAdmin2FACode(settings, settings.adminEmail, window.location.href).then((ok) => {
        if (ok) {
          grantAdminSession();
        }
      });
    }
  }, [settings.adminEmail, settings.memberAccounts, settings.adminPassword]);

  // Cloud Sync für Einstellungen & Accounts
  useEffect(() => {
    async function fetchUsers() {
      const res = await querySipRow(SIP_CONFIG_ROW_ID);
      const data = res ? res.data : null;
      const error = res ? res.error : null;

      if (!error && data && data.payload) {
        const payload = data.payload;
        setSettings((prev) => ({
          ...prev,
          memberAccounts: payload.memberAccounts || prev.memberAccounts,
          adminPassword: payload.adminPassword || prev.adminPassword,
          strategiePassword: payload.strategiePassword || prev.strategiePassword,
          adminEmail: payload.adminEmail !== undefined ? payload.adminEmail : prev.adminEmail,
          totpSecret: payload.totpSecret !== undefined ? payload.totpSecret : prev.totpSecret,
          totpEnabled: payload.totpEnabled !== undefined ? payload.totpEnabled : prev.totpEnabled,
        }));
      }
    }
    fetchUsers();
  }, []);

  // Initialisiere SiP-Realtime sofort beim Start der App (lädt currentsession0 sofort aus PocketBase)
  useEffect(() => {
    sipRealtime.init(settings);
  }, []);

  async function handleSaveSettings(newSettings: AppSettings) {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));

    // Persistiere in PocketBase (sip_state)
    const res = await querySipRow(SIP_CONFIG_ROW_ID);
    const data = res ? res.data : null;
    const oldPayload = data && data.payload ? data.payload : {};

    const newPayload = {
      ...oldPayload,
      memberAccounts: newSettings.memberAccounts,
      adminPassword: newSettings.adminPassword,
      strategiePassword: newSettings.strategiePassword,
      adminEmail: newSettings.adminEmail,
      totpSecret: newSettings.totpSecret,
      totpEnabled: newSettings.totpEnabled,
    };

    const recordData = {
      id: SIP_CONFIG_ROW_ID,
      payload: newPayload,
    };

    await upsertSipRow(recordData);
  }

  function handleLoginSuccess(account: MemberAccount) {
    setCurrentUser(account);
    localStorage.setItem(STORAGE_KEYS.LOGGED_USER, JSON.stringify(account));
  }

  function handleLogout() {
    setCurrentUser(null);
    setIsAdminUnlocked(false);
    setCurrentView('parliament');
    localStorage.removeItem(STORAGE_KEYS.LOGGED_USER);
    localStorage.removeItem(STORAGE_KEYS.ADMIN_UNLOCKED);
  }

  async function handleAdminButtonClick() {
    if (isAdminUnlocked) {
      setCurrentView(currentView === 'admin' ? 'parliament' : 'admin');
    } else {
      const pass = prompt('Bitte Administrator-Passwort eingeben:');
      if (pass === null) return;
      if (pass !== settings.adminPassword) {
        alert('ungültiges Passwort, bitte versuche es erneut!');
        return;
      }

      // Falls Authenticator-App (TOTP) aktiviert ist, frage nach dem 6-stelligen Code:
      if (settings.totpEnabled && settings.totpSecret) {
        const code = prompt('Bitte 6-stelligen Code aus der Authenticator-App eingeben:');
        if (code === null) return;
        const valid = await verifyTotpCode(settings.totpSecret, code);
        if (!valid) {
          alert('ungültiges Passwort, bitte versuche es erneut!');
          return;
        }
      }

      setIsAdminUnlocked(true);
      localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
      setCurrentView('admin');
    }
  }

  // 1. Vorgeschaltetes Login-Fenster wenn nicht angemeldet
  if (!currentUser) {
    return (
      <SipLoginView
        memberAccounts={settings.memberAccounts}
        strategiePassword={settings.strategiePassword}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // 2. Angemeldeter Bereich
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-slate-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div
            onClick={() => setCurrentView('parliament')}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg shrink-0">
              <img
                src={suLogo}
                alt="Schülerunion Vorarlberg"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-400 block leading-tight">
                Schüler:innenparlament
              </span>
              <span className="text-sm sm:text-base font-black text-white leading-tight">
                SiP Live-Tool
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switch: Parlament vs. Admin-Bereich */}
            <button
              type="button"
              onClick={handleAdminButtonClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
                currentView === 'admin'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{currentView === 'admin' ? 'Zum Plenum' : 'Admin & Konten'}</span>
            </button>

            {/* User badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-200">
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">{currentUser.name}</span>
              {currentUser.role === 'strategie' && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-black flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Strategie
                </span>
              )}
              {currentUser.role === 'admin' && (
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-1.5 py-0.2 rounded font-bold">
                  Admin
                </span>
              )}
              {currentUser.isExternal && (
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-bold">
                  Gast
                </span>
              )}
            </div>

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-medium transition cursor-pointer"
              title="Abmelden"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-4">
        {currentView === 'admin' ? (
          <SipAdminView
            settings={settings}
            onUpdateSettings={handleSaveSettings}
            onClose={() => setCurrentView('parliament')}
            initial2FAVerified={initial2FAVerified}
          />
        ) : (
          <SipMainView
            settings={settings}
            currentMember={currentUser}
            isAdminUnlocked={isAdminUnlocked || currentUser.role === 'strategie' || currentUser.role === 'admin'}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3">
        <span>Schüler:innenparlament (SiP) • Angemeldet als <strong>{currentUser.name}</strong> ({currentUser.username})</span>
        <span className="hidden sm:inline text-slate-700">•</span>
        <span className="text-slate-400 font-semibold">© Elias Mathis</span>
      </footer>
    </div>
  );
};
export default App;
