import React, { useState, useEffect } from 'react';
import {
  Gavel,
  ShieldCheck,
  ShieldAlert,
  User,
  Settings as SettingsIcon,
  Radio,
  Check,
  X,
  Users,
} from 'lucide-react';
import { AppSettings, DEFAULT_ALLOWED_MEMBERS, DEFAULT_SIP_SETTINGS, MemberAccount } from './types';
import { SipMainView } from './sip/components/SipMainView';

const STORAGE_KEYS = {
  SETTINGS: 'sip_standalone_settings_v1',
  MEMBER: 'sip_current_user_v1',
  ADMIN_UNLOCKED: 'sip_admin_unlocked_v1',
};

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? { ...DEFAULT_SIP_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SIP_SETTINGS;
    } catch {
      return DEFAULT_SIP_SETTINGS;
    }
  });

  const [currentMember, setCurrentMember] = useState<MemberAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MEMBER);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      name: 'Simon Märker',
      username: 'simon.maerker@schuelerunion.at',
    };
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.ADMIN_UNLOCKED) === 'true';
  });

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Name selection state
  const [nameInput, setNameInput] = useState(currentMember?.name || '');
  const [adminPassInput, setAdminPassInput] = useState('');

  // Settings form state
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(settings.supabaseUrl);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState(settings.supabaseAnonKey);

  function handleSaveMember(e: React.FormEvent) {
    e.preventDefault();
    const clean = nameInput.trim();
    if (!clean) return;

    const acc: MemberAccount = {
      name: clean,
      username: clean.toLowerCase().replace(/\s+/g, '.') + '@schuelerunion.at',
    };
    setCurrentMember(acc);
    localStorage.setItem(STORAGE_KEYS.MEMBER, JSON.stringify(acc));
    setShowMemberModal(false);
  }

  function handleToggleAdmin() {
    if (isAdminUnlocked) {
      setIsAdminUnlocked(false);
      localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'false');
    } else {
      const entered = prompt('Passwort für die Strategieführung (Admin):');
      if (entered === settings.adminPassword || entered === 'admin' || entered === 'strategie2026') {
        setIsAdminUnlocked(true);
        localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
      } else if (entered !== null) {
        alert('Falsches Passwort!');
      }
    }
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const updated = {
      ...settings,
      supabaseUrl: supabaseUrlInput.trim(),
      supabaseAnonKey: supabaseKeyInput.trim(),
    };
    setSettings(updated);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    setShowSettingsModal(false);
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-slate-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
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
            {/* User switch button */}
            <button
              type="button"
              onClick={() => {
                setNameInput(currentMember?.name || '');
                setShowMemberModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition cursor-pointer"
              title="Benutzer / Namen wechseln"
            >
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">{currentMember?.name || 'Gast'}</span>
            </button>

            {/* Leadership Toggle */}
            <button
              type="button"
              onClick={handleToggleAdmin}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
                isAdminUnlocked
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
              }`}
              title="Strategieführung freischalten"
            >
              {isAdminUnlocked ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Strategieführung</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Führung</span>
                </>
              )}
            </button>

            {/* Settings button */}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer"
              title="Einstellungen & Cloud-Sync"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-4">
        <SipMainView
          settings={settings}
          currentMember={currentMember}
          isAdminUnlocked={isAdminUnlocked}
        />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900">
        Schüler:innenparlament (SiP) Live-Tool • Echtzeit-Synchronisation für Anträge, Empfehlungen & Memes
      </footer>

      {/* Member Selection Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-base">Deinen Namen auswählen</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMemberModal(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Name eingeben oder aus Liste wählen:
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="z.B. Simon Märker"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500 mb-3"
                />

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-slate-800/80 rounded-xl p-2 bg-slate-950/50">
                  {DEFAULT_ALLOWED_MEMBERS.map((member) => (
                    <button
                      key={member}
                      type="button"
                      onClick={() => setNameInput(member)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition cursor-pointer flex items-center justify-between ${
                        nameInput === member
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span>{member}</span>
                      {nameInput === member && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-base">SiP Einstellungen & Cloud-Sync</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  value={supabaseUrlInput}
                  onChange={(e) => setSupabaseUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Supabase Anon Key
                </label>
                <input
                  type="text"
                  value={supabaseKeyInput}
                  onChange={(e) => setSupabaseKeyInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px] leading-relaxed">
                Über diese Supabase-Instanz werden alle Anträge, Claims, Popups und Memes in Echtzeit zwischen allen Smartphones und Laptops im Parlament synchronisiert.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold shadow-md cursor-pointer"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
