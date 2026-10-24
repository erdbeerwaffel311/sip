import React, { useState, useEffect } from 'react';
import {
  Gavel,
  ShieldCheck,
  ShieldAlert,
  User,
  Settings as SettingsIcon,
  LogOut,
  Users,
  Key,
} from 'lucide-react';
import {
  AppSettings,
  DEFAULT_ALLOWED_MEMBERS,
  DEFAULT_SIP_SETTINGS,
  isAccountExpired,
  MemberAccount,
} from './types';
import { SipLoginView } from './components/SipLoginView';
import { SipAdminView } from './components/SipAdminView';
import { SipMainView } from './sip/components/SipMainView';
import { getSupabaseClient } from './utils/supabaseSync';

const STORAGE_KEYS = {
  SETTINGS: 'sip_standalone_settings_v2',
  LOGGED_USER: 'sip_logged_in_user_v2',
  ADMIN_UNLOCKED: 'sip_admin_unlocked_v2',
};

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.adminPassword === 'admin' || !parsed.adminPassword) {
          parsed.adminPassword = 'strategie2026';
        }
        return { ...DEFAULT_SIP_SETTINGS, ...parsed, adminPassword: parsed.adminPassword };
      }
    } catch {}
    return DEFAULT_SIP_SETTINGS;
  });

  const [currentUser, setCurrentUser] = useState<MemberAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGGED_USER);
      if (saved) {
        const acc = JSON.parse(saved) as MemberAccount;
        if (!isAccountExpired(acc)) return acc;
      }
    } catch {}
    return null;
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.ADMIN_UNLOCKED) === 'true';
  });

  const [currentView, setCurrentView] = useState<'parliament' | 'admin'>('parliament');

  // Cloud Sync für Einstellungen & Accounts
  useEffect(() => {
    const client = getSupabaseClient(settings);
    if (!client) return;

    // Lade neuesten Stand der Benutzerkonten aus Supabase
    async function fetchUsers() {
      try {
        const { data, error } = await client!
          .from('keller_items')
          .select('*')
          .eq('id', '__sip_users_config__')
          .maybeSingle();

        if (!error && data?.payload?.memberAccounts) {
          setSettings((prev) => ({
            ...prev,
            memberAccounts: data.payload.memberAccounts,
            adminPassword: data.payload.adminPassword || prev.adminPassword,
          }));
        }
      } catch {}
    }
    fetchUsers();
  }, [settings.supabaseUrl, settings.supabaseAnonKey]);

  async function handleSaveSettings(newSettings: AppSettings) {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));

    // Persistiere in Supabase
    const client = getSupabaseClient(newSettings);
    if (client) {
      try {
        await client.from('keller_items').upsert({
          id: '__sip_users_config__',
          name: 'SiP Benutzerkonten & Gäste',
          category: '__sip_system__',
          quantity: newSettings.memberAccounts.length,
          updated_at: new Date().toISOString(),
          payload: {
            memberAccounts: newSettings.memberAccounts,
            adminPassword: newSettings.adminPassword,
          },
        });
      } catch {}
    }
  }

  function handleLoginSuccess(account: MemberAccount, isLeader: boolean) {
    setCurrentUser(account);
    localStorage.setItem(STORAGE_KEYS.LOGGED_USER, JSON.stringify(account));
    if (isLeader) {
      setIsAdminUnlocked(true);
      localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setIsAdminUnlocked(false);
    setCurrentView('parliament');
    localStorage.removeItem(STORAGE_KEYS.LOGGED_USER);
    localStorage.removeItem(STORAGE_KEYS.ADMIN_UNLOCKED);
  }

  // 1. Vorgeschaltetes Login-Fenster wenn nicht angemeldet
  if (!currentUser) {
    return (
      <SipLoginView
        memberAccounts={settings.memberAccounts}
        adminPassword={settings.adminPassword}
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
              <Gavel className="w-5 h-5" />
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
            {(isAdminUnlocked || currentUser.role === 'strategie') && (
              <button
                type="button"
                onClick={() =>
                  setCurrentView(currentView === 'admin' ? 'parliament' : 'admin')
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
                  currentView === 'admin'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{currentView === 'admin' ? 'Zum Parlament' : 'Admin & Gäste'}</span>
              </button>
            )}

            {/* User badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-200">
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">{currentUser.name}</span>
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
          />
        ) : (
          <SipMainView
            settings={settings}
            currentMember={currentUser}
            isAdminUnlocked={isAdminUnlocked || currentUser.role === 'strategie'}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900">
        Schüler:innenparlament (SiP) • Angemeldet als <strong>{currentUser.name}</strong> ({currentUser.username})
      </footer>
    </div>
  );
};
export default App;
