import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Clock,
  Key,
  Copy,
  Check,
  Trash2,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Search,
  Settings,
  Mail,
  Lock,
  Star,
  StarOff,
  Send,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  AppSettings,
  generateRandomMemberPassword,
  isAccountExpired,
  MemberAccount,
} from '../types';
import { sendAdmin2FAEmail, verifyAdmin2FACode } from '../utils/supabaseSync';

interface SipAdminViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClose: () => void;
}

export const SipAdminView: React.FC<SipAdminViewProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'settings'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'STRATEGIE' | 'MEMBER' | 'EXTERNAL' | 'EXPIRED'>('ALL');

  // Modal für neuen Zugang
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState(generateRandomMemberPassword());
  const [newRole, setNewRole] = useState<'gast' | 'mitglied' | 'presse' | 'strategie'>('gast');
  const [expirationPreset, setExpirationPreset] = useState<'never' | '2h' | '6h' | '12h' | '24h' | '48h' | 'custom'>('12h');
  const [customExpiresAt, setCustomExpiresAt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Settings state (General)
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(settings.supabaseUrl);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState(settings.supabaseAnonKey);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // 2FA Protected Area State (wie im Inventurprogramm)
  const [twoFactorStage, setTwoFactorStage] = useState<'idle' | 'code_sent' | 'verified'>('idle');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [initial2FAEmailInput, setInitial2FAEmailInput] = useState(settings.adminEmail || '');

  const [twoFactorNewAdminPassword, setTwoFactorNewAdminPassword] = useState('');
  const [twoFactorNewStrategiePassword, setTwoFactorNewStrategiePassword] = useState('');
  const [twoFactorNewEmail, setTwoFactorNewEmail] = useState('');

  function showBanner(msg: string) {
    setBannerMessage(msg);
    setTimeout(() => {
      setBannerMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return settings.memberAccounts.filter((acc) => {
      const isExp = isAccountExpired(acc);

      if (roleFilter === 'STRATEGIE' && acc.role !== 'strategie') return false;
      if (roleFilter === 'MEMBER' && (acc.isExternal || acc.role === 'strategie')) return false;
      if (roleFilter === 'EXTERNAL' && !acc.isExternal) return false;
      if (roleFilter === 'EXPIRED' && !isExp) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          acc.name.toLowerCase().includes(q) ||
          acc.username.toLowerCase().includes(q) ||
          (acc.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [settings.memberAccounts, roleFilter, searchQuery]);

  function calculateExpiresAt(preset: string, customDate: string): string | null {
    if (preset === 'never') return null;
    if (preset === 'custom') return customDate ? new Date(customDate).toISOString() : null;

    const now = Date.now();
    let ms = 0;
    if (preset === '2h') ms = 2 * 3600 * 1000;
    else if (preset === '6h') ms = 6 * 3600 * 1000;
    else if (preset === '12h') ms = 12 * 3600 * 1000;
    else if (preset === '24h') ms = 24 * 3600 * 1000;
    else if (preset === '48h') ms = 48 * 3600 * 1000;

    return new Date(now + ms).toISOString();
  }

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;

    let cleanUser = newUsername.trim();
    if (!cleanUser) {
      cleanUser =
        cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '.') +
        (newRole === 'gast' ? '@gast.sip' : '@schuelerunion.at');
    }

    const expiresAt = calculateExpiresAt(expirationPreset, customExpiresAt);

    const newAccount: MemberAccount = {
      name: cleanName,
      username: cleanUser,
      password: newPassword.trim() || generateRandomMemberPassword(),
      role: newRole,
      isExternal: newRole === 'gast' || newRole === 'presse',
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    const updatedAccounts = [newAccount, ...settings.memberAccounts];
    onUpdateSettings({
      ...settings,
      memberAccounts: updatedAccounts,
    });

    // Reset Form
    setNewName('');
    setNewUsername('');
    setNewPassword(generateRandomMemberPassword());
    setShowAddModal(false);
    showBanner(`Zugang für „${cleanName}“ erfolgreich erstellt!`);
  }

  function handleToggleStrategieRole(username: string) {
    const target = settings.memberAccounts.find((a) => a.username === username);
    if (!target) return;
    const isNowLeader = target.role === 'strategie';
    const nextRole = isNowLeader ? 'mitglied' : 'strategie';

    const updated = settings.memberAccounts.map((acc) => {
      if (acc.username !== username) return acc;
      return {
        ...acc,
        role: nextRole as MemberAccount['role'],
      };
    });

    onUpdateSettings({ ...settings, memberAccounts: updated });
    showBanner(
      nextRole === 'strategie'
        ? `„${target.name}“ wurde zur Strategieführung ernannt! (Führungsfunktionen beim Login aktiv)`
        : `Strategieführungs-Rolle für „${target.name}“ aufgehoben.`
    );
  }

  function handleDeleteUser(username: string) {
    if (!confirm('Diesen Benutzerzugang wirklich unwiderruflich löschen?')) return;
    const updated = settings.memberAccounts.filter((a) => a.username !== username);
    onUpdateSettings({
      ...settings,
      memberAccounts: updated,
    });
    showBanner('Benutzerzugang gelöscht.');
  }

  function handleExtendUser(username: string, additionalHours: number) {
    const updated = settings.memberAccounts.map((acc) => {
      if (acc.username !== username) return acc;
      const baseTime = acc.expiresAt && !isAccountExpired(acc) ? new Date(acc.expiresAt).getTime() : Date.now();
      const newExp = new Date(baseTime + additionalHours * 3600 * 1000).toISOString();
      return { ...acc, expiresAt: newExp };
    });
    onUpdateSettings({ ...settings, memberAccounts: updated });
    showBanner(`Gültigkeit um +${additionalHours} Stunden verlängert.`);
  }

  function handleCopyCredentials(acc: MemberAccount) {
    let text = `🏛️ SiP Zugangsdaten für: ${acc.name}\n`;
    text += `👤 Benutzername: ${acc.username}\n`;
    text += `🔑 Passwort: ${acc.password}\n`;
    text += `🌐 URL: https://sip.schuelerunion-vorarlberg.at/\n`;
    if (acc.role === 'strategie') {
      text += `⭐ Rolle: Strategieführung (Plenumsleitung & Antragssteuerung)\n`;
    }
    if (acc.expiresAt) {
      const formatted = new Date(acc.expiresAt).toLocaleString('de-AT', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      text += `⏳ Gültig bis: ${formatted} Uhr\n`;
    } else {
      text += `⏳ Gültigkeit: Unbegrenzt\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedId(acc.username);
    setTimeout(() => setCopiedId(null), 3000);
  }

  // 2FA Handlers
  function handleSaveInitial2FAEmail() {
    const clean = initial2FAEmailInput.trim();
    if (!clean || !clean.includes('@')) {
      setTwoFactorError('Bitte eine gültige E-Mail-Adresse für den 2FA-Schutz eingeben.');
      return;
    }
    const updated: AppSettings = {
      ...settings,
      adminEmail: clean,
    };
    onUpdateSettings(updated);
    setTwoFactorError(null);
    showBanner(`2FA-Schutz mit E-Mail „${clean}“ erfolgreich aktiviert!`);
  }

  async function handleRequest2FACode() {
    if (!settings.adminEmail?.trim()) return;
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      const res = await sendAdmin2FAEmail(settings, settings.adminEmail);
      setTwoFactorStage('code_sent');
      setTwoFactorNewEmail(settings.adminEmail);
      setTwoFactorNewAdminPassword('');
      setTwoFactorNewStrategiePassword('');
      if (res.rateLimited) {
        showBanner('Eingabefeld geöffnet! (Supabase E-Mail-Limit erreicht - verwende den empfangenen Link oder Backup-Code).');
      } else {
        showBanner(`2FA-Bestätigungs-E-Mail wurde an ${settings.adminEmail} gesendet!`);
      }
    } catch {
      setTwoFactorStage('code_sent');
      setTwoFactorError('ungültiges Passwort, bitte versuche es erneut!');
    } finally {
      setTwoFactorLoading(false);
    }
  }

  async function handleVerify2FACode(e: React.FormEvent) {
    e.preventDefault();
    if (!settings.adminEmail?.trim() || !twoFactorCodeInput.trim()) return;
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      const ok = await verifyAdmin2FACode(settings, settings.adminEmail, twoFactorCodeInput);
      if (ok) {
        setTwoFactorStage('verified');
        setTwoFactorCodeInput('');
        setTwoFactorError(null);
        setTwoFactorNewEmail(settings.adminEmail);
        showBanner('2FA erfolgreich bestätigt! Du kannst die Passwörter und die 2FA-E-Mail jetzt ändern.');
      } else {
        setTwoFactorError('ungültiges Passwort, bitte versuche es erneut!');
      }
    } catch {
      setTwoFactorError('ungültiges Passwort, bitte versuche es erneut!');
    } finally {
      setTwoFactorLoading(false);
    }
  }

  function handleSave2FAProtectedChanges(e: React.FormEvent) {
    e.preventDefault();
    if (twoFactorStage !== 'verified') return;

    const nextEmail = twoFactorNewEmail.trim() || settings.adminEmail || '';
    const nextAdminPassword = twoFactorNewAdminPassword.trim() || settings.adminPassword;
    const nextStrategiePassword = twoFactorNewStrategiePassword.trim() || settings.strategiePassword;

    if (nextAdminPassword === 'admin') {
      setTwoFactorError('ungültiges Passwort, bitte versuche es erneut!');
      return;
    }

    const updated: AppSettings = {
      ...settings,
      adminPassword: nextAdminPassword,
      strategiePassword: nextStrategiePassword,
      adminEmail: nextEmail,
    };

    onUpdateSettings(updated);
    setTwoFactorStage('idle');
    setTwoFactorNewAdminPassword('');
    setTwoFactorNewStrategiePassword('');
    setTwoFactorError(null);
    showBanner('Admin-Passwort, Strategieführungs-Passwort und 2FA-E-Mail wurden sicher aktualisiert!');
  }

  function handleSaveDatabaseSettings(e: React.FormEvent) {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      supabaseUrl: supabaseUrlInput.trim(),
      supabaseAnonKey: supabaseKeyInput.trim(),
    });
    showBanner('Datenbank-Verbindung erfolgreich gespeichert!');
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6">
      {/* Toast Banner */}
      {bannerMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xl animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black">
              SiP Administration & Strategie
            </h1>
            <p className="text-xs text-slate-400">
              Verwalte Zugangsdaten, erhebe Mitglieder zur Strategieführung und sichere Passwörter mit 2FA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/20 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Neuen Zugang anlegen</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'users'
              ? 'bg-sky-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Benutzer & Konten ({settings.memberAccounts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-sky-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Passwörter, 2FA & Cloud</span>
        </button>
      </div>

      {/* Tab 1: Users & Strategy Team */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Person nach Name oder Benutzername suchen..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
              <button
                type="button"
                onClick={() => setRoleFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
                  roleFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Alle ({settings.memberAccounts.length})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('STRATEGIE')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer flex items-center gap-1 ${
                  roleFilter === 'STRATEGIE' ? 'bg-amber-500 text-slate-950' : 'text-amber-300 hover:bg-slate-800'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
                <span>Strategieführung ({settings.memberAccounts.filter((a) => a.role === 'strategie').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('EXTERNAL')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
                  roleFilter === 'EXTERNAL' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Externe Gäste ({settings.memberAccounts.filter((a) => a.isExternal).length})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('EXPIRED')}
                className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
                  roleFilter === 'EXPIRED' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                Abgelaufen ({settings.memberAccounts.filter((a) => isAccountExpired(a)).length})
              </button>
            </div>
          </div>

          {/* User Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAccounts.map((acc) => {
              const isExpired = isAccountExpired(acc);
              const isLeader = acc.role === 'strategie';

              return (
                <div
                  key={acc.username}
                  className={`p-4 rounded-2xl border transition-all ${
                    isExpired
                      ? 'bg-rose-950/10 border-rose-500/30'
                      : isLeader
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-500/5'
                      : acc.isExternal
                      ? 'bg-sky-950/15 border-sky-500/30'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="font-bold text-white text-sm">{acc.name}</span>
                        {isLeader && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px] font-black flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            Strategieführung
                          </span>
                        )}
                        {acc.isExternal && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-bold">
                            Gast / Extern
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono block">
                        {acc.username}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyCredentials(acc)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                      title="Zugangsdaten für WhatsApp/Signal kopieren"
                    >
                      {copiedId === acc.username ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Password & Expiration Box */}
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-slate-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{acc.password}</span>
                    </div>

                    {acc.expiresAt ? (
                      <div
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
                          isExpired
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>
                          {isExpired
                            ? 'Abgelaufen'
                            : `Bis ${new Date(acc.expiresAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} Uhr`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">Unbegrenzt</span>
                    )}
                  </div>

                  {/* Strategy & Expiration Action Controls */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs gap-2 flex-wrap">
                    {/* 1-Click Role Toggle: Zur Strategieführung ernennen */}
                    <button
                      type="button"
                      onClick={() => handleToggleStrategieRole(acc.username)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                        isLeader
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 hover:bg-amber-500/10 text-slate-400 hover:text-amber-300 border-slate-700 hover:border-amber-500/30'
                      }`}
                      title={isLeader ? 'Strategieführungs-Rechte aufheben' : 'Zur Strategieführung ernennen'}
                    >
                      {isLeader ? (
                        <>
                          <StarOff className="w-3 h-3 text-amber-400" />
                          <span>Strategieführung aufheben</span>
                        </>
                      ) : (
                        <>
                          <Star className="w-3 h-3 text-amber-400" />
                          <span>Zur Strategieführung ernennen</span>
                        </>
                      )}
                    </button>

                    {/* Expiration extensions / deletion */}
                    <div className="flex items-center gap-1 ml-auto">
                      {acc.isExternal && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleExtendUser(acc.username, 6)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                            title="Um 6 Stunden verlängern"
                          >
                            +6 Std.
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExtendUser(acc.username, 24)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                            title="Um 24 Stunden verlängern"
                          >
                            +24 Std.
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteUser(acc.username)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Benutzerzugang löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Passwörter, 2FA-Schutz & Cloud-Datenbank */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          {/* 2FA-Geschützter Bereich: Admin & Strategie Passwörter */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl text-white space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">Passwörter & 2FA-Zwei-Faktor-Authentifizierung</h3>
                <p className="text-xs text-slate-400">
                  Schütze das Admin-Passwort und das Strategieführungs-Passwort durch deine E-Mail-Adresse
                </p>
              </div>
            </div>

            {twoFactorError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{twoFactorError}</span>
              </div>
            )}

            {/* Fall A: Noch keine 2FA-E-Mail hinterlegt */}
            {!settings.adminEmail ? (
              <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Hinterlege hier einmalig deine <strong>Admin-E-Mail-Adresse für die 2-Faktor-Authentifizierung (2FA)</strong>.
                  Sobald sie gespeichert ist, können das Admin-Passwort und das Strategieführungs-Passwort nur noch nach
                  Bestätigung über einen per E-Mail gesendeten Code/Link geändert werden.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="email"
                      value={initial2FAEmailInput}
                      onChange={(e) => setInitial2FAEmailInput(e.target.value)}
                      placeholder="admin@schuelerunion.at"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveInitial2FAEmail}
                    className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    2FA-E-Mail aktivieren
                  </button>
                </div>
              </div>
            ) : (
              /* Fall B: 2FA aktiv */
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Hinterlegte 2FA-E-Mail-Adresse:</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-[11px]">
                      2FA aktiv
                    </span>
                  </div>
                  <p className="font-mono text-sm text-white font-bold">{settings.adminEmail}</p>
                </div>

                {/* Stufe 1: Idle (Code anfordern) */}
                {twoFactorStage === 'idle' && (
                  <button
                    type="button"
                    onClick={handleRequest2FACode}
                    disabled={twoFactorLoading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {twoFactorLoading ? 'Sende 2FA-E-Mail...' : 'Passwörter / 2FA-E-Mail ändern (E-Mail senden)'}
                    </span>
                  </button>
                )}

                {/* Stufe 2: Code gesendet -> Eingabe */}
                {twoFactorStage === 'code_sent' && (
                  <form onSubmit={handleVerify2FACode} className="space-y-3 pt-2 border-t border-slate-800">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Wir haben eine 2FA-E-Mail an <strong>{settings.adminEmail}</strong> gesendet.
                      Trage einfach den <strong>6-stelligen Bestätigungscode</strong> aus der E-Mail hier ein (du musst nicht auf den Link klicken):
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        required
                        value={twoFactorCodeInput}
                        onChange={(e) => setTwoFactorCodeInput(e.target.value)}
                        placeholder="6-stelliger Code oder Link"
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={twoFactorLoading || !twoFactorCodeInput.trim()}
                        className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition disabled:opacity-50"
                      >
                        {twoFactorLoading ? 'Prüfe...' : '2FA bestätigen'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={handleRequest2FACode}
                        disabled={twoFactorLoading}
                        className="text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        E-Mail erneut senden
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFactorStage('idle');
                          setTwoFactorError(null);
                        }}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                )}

                {/* Stufe 3: 2FA Verifiziert -> Passwörter & E-Mail änderbar */}
                {twoFactorStage === 'verified' && (
                  <form onSubmit={handleSave2FAProtectedChanges} className="space-y-4 pt-2 border-t border-slate-800">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                      ✓ 2FA erfolgreich bestätigt! Du kannst jetzt das Admin-Passwort, das Strategieführungs-Passwort und die 2FA-E-Mail ändern:
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-xs">
                        Neues Administrator-Passwort (separater Systemzugang)
                      </label>
                      <input
                        type="text"
                        value={twoFactorNewAdminPassword}
                        onChange={(e) => setTwoFactorNewAdminPassword(e.target.value)}
                        placeholder={settings.adminPassword}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-xs">
                        Neues Strategieführungs-Passwort (für manuelle Plenumsfreischaltung)
                      </label>
                      <input
                        type="text"
                        value={twoFactorNewStrategiePassword}
                        onChange={(e) => setTwoFactorNewStrategiePassword(e.target.value)}
                        placeholder={settings.strategiePassword || 'strategie2026'}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-xs">
                        2FA-E-Mail-Adresse (änderbar)
                      </label>
                      <input
                        type="email"
                        value={twoFactorNewEmail}
                        onChange={(e) => setTwoFactorNewEmail(e.target.value)}
                        placeholder={settings.adminEmail}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer transition shadow-lg shadow-emerald-500/20"
                      >
                        Passwörter & 2FA-E-Mail speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFactorStage('idle');
                          setTwoFactorNewAdminPassword('');
                          setTwoFactorNewStrategiePassword('');
                        }}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Cloud Database Sync Settings */}
          <form
            onSubmit={handleSaveDatabaseSettings}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl text-white space-y-4 text-xs sm:text-sm"
          >
            <h3 className="font-bold text-base mb-1">Supabase Echtzeit-Cloud & Synchronisation</h3>
            <p className="text-xs text-slate-400 mb-2">
              Alle Benutzer, Konten und Anträge werden live über die Supabase-Datenbank synchronisiert.
            </p>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 text-xs">
                Supabase Project URL
              </label>
              <input
                type="text"
                required
                value={supabaseUrlInput}
                onChange={(e) => setSupabaseUrlInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 text-xs">
                Supabase Anon Key
              </label>
              <input
                type="password"
                required
                value={supabaseKeyInput}
                onChange={(e) => setSupabaseKeyInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              Datenbank-Verbindung speichern
            </button>
          </form>
        </div>
      )}

      {/* Modal: Neuen Zugang / Gast anlegen */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-md w-full text-white space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="text-lg font-black flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                <span>Neuen Zugang erstellen</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Vollständiger Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Vor- und Nachname"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Rolle im SiP
                </label>
                <select
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as 'gast' | 'mitglied' | 'presse' | 'strategie')
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="gast">Externer Gast (mit Ablaufzeit)</option>
                  <option value="mitglied">Reguläres SiP-Mitglied</option>
                  <option value="strategie">⭐ Strategieführung (Volle Leitungsrechte)</option>
                  <option value="presse">Presse / Beobachter</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Benutzername (optional leer lassen)
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="automatisch generiert"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold">SiP-Passwort</label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomMemberPassword())}
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Neu generieren</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold"
                />
              </div>

              {/* Ablaufzeit Presets */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Gültigkeitsdauer (Ablaufzeit)
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs mb-2">
                  {(['2h', '6h', '12h', '24h', '48h', 'never', 'custom'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExpirationPreset(preset)}
                      className={`py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer ${
                        expirationPreset === preset
                          ? 'bg-sky-500 text-slate-950 shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {preset === 'never'
                        ? 'Unbegrenzt'
                        : preset === 'custom'
                        ? 'Datum...'
                        : `${preset.replace('h', ' Std.')}`}
                    </button>
                  ))}
                </div>

                {expirationPreset === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customExpiresAt}
                    onChange={(e) => setCustomExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold shadow-lg shadow-sky-500/20 cursor-pointer"
                >
                  Zugang jetzt erstellen
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
