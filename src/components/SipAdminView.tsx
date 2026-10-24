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
  Edit2,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  Settings,
} from 'lucide-react';
import {
  AppSettings,
  generateRandomMemberPassword,
  isAccountExpired,
  MemberAccount,
} from '../types';

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
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MEMBER' | 'EXTERNAL' | 'EXPIRED'>('ALL');

  // Modal für neuen Zugang
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState(generateRandomMemberPassword());
  const [newRole, setNewRole] = useState<'gast' | 'mitglied' | 'presse' | 'strategie'>('gast');
  const [expirationPreset, setExpirationPreset] = useState<'never' | '2h' | '6h' | '12h' | '24h' | '48h' | 'custom'>('12h');
  const [customExpiresAt, setCustomExpiresAt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Settings form state
  const [adminPasswordInput, setAdminPasswordInput] = useState(settings.adminPassword);
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(settings.supabaseUrl);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState(settings.supabaseAnonKey);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return settings.memberAccounts.filter((acc) => {
      const isExp = isAccountExpired(acc);

      if (roleFilter === 'MEMBER' && acc.isExternal) return false;
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
  }

  function handleDeleteUser(username: string) {
    if (!confirm('Diesen Benutzerzugang wirklich unwiderruflich löschen?')) return;
    const updated = settings.memberAccounts.filter((a) => a.username !== username);
    onUpdateSettings({
      ...settings,
      memberAccounts: updated,
    });
  }

  function handleExtendUser(username: string, additionalHours: number) {
    const updated = settings.memberAccounts.map((acc) => {
      if (acc.username !== username) return acc;
      const baseTime = acc.expiresAt && !isAccountExpired(acc) ? new Date(acc.expiresAt).getTime() : Date.now();
      const newExp = new Date(baseTime + additionalHours * 3600 * 1000).toISOString();
      return { ...acc, expiresAt: newExp };
    });
    onUpdateSettings({ ...settings, memberAccounts: updated });
  }

  function handleCopyCredentials(acc: MemberAccount) {
    let text = `🏛️ SiP Zugangsdaten für: ${acc.name}\n`;
    text += `👤 Benutzername: ${acc.username}\n`;
    text += `🔑 Passwort: ${acc.password}\n`;
    text += `🌐 URL: https://erdbeerwaffel311.github.io/sip/\n`;
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

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      adminPassword: adminPasswordInput.trim(),
      supabaseUrl: supabaseUrlInput.trim(),
      supabaseAnonKey: supabaseKeyInput.trim(),
    });
    alert('Einstellungen erfolgreich gespeichert!');
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6">
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black">
              SiP Admin- & Zugangsverwaltung
            </h1>
            <p className="text-xs text-slate-400">
              Verwalte Zugangsdaten, Passwörter und erstelle zeitlich begrenzte Gast-Zugänge
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
            <span>Neuen Gast / Zugang anlegen</span>
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
          <span>Benutzer & Gäste ({settings.memberAccounts.length})</span>
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
          <span>System-Einstellungen & Cloud</span>
        </button>
      </div>

      {/* Tab 1: Users & Guests */}
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
              return (
                <div
                  key={acc.username}
                  className={`p-4 rounded-2xl border transition-all ${
                    isExpired
                      ? 'bg-rose-950/10 border-rose-500/30'
                      : acc.isExternal
                      ? 'bg-sky-950/15 border-sky-500/30'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-white text-sm">{acc.name}</span>
                        {acc.isExternal && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-bold">
                            Gast / Extern
                          </span>
                        )}
                        {acc.role === 'strategie' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                            Führung
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

                  {/* Action buttons for external users */}
                  {acc.isExternal && (
                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleExtendUser(acc.username, 6)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                        >
                          +6 Std.
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExtendUser(acc.username, 24)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                        >
                          +24 Std.
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteUser(acc.username)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Gastzugang löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Settings */}
      {activeTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl text-white space-y-4 max-w-xl text-xs sm:text-sm"
        >
          <h3 className="font-bold text-base mb-2">SiP System-Konfiguration</h3>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Admin-Passwort für die Strategieführung
            </label>
            <input
              type="text"
              required
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              required
              value={supabaseUrlInput}
              onChange={(e) => setSupabaseUrlInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Supabase Anon Key
            </label>
            <input
              type="text"
              required
              value={supabaseKeyInput}
              onChange={(e) => setSupabaseKeyInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold shadow-md cursor-pointer"
            >
              Einstellungen speichern
            </button>
          </div>
        </form>
      )}

      {/* Modal: Neuen Gast / Zugang anlegen */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-base sm:text-lg">Neuen Gast-Zugang anlegen</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Name der Person *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Julia Huber (Gastdelegierte)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Benutzername (optional, wird sonst automatisch erzeugt)
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="z.B. julia.huber@gast.sip"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    SiP-Passwort
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setNewPassword(generateRandomMemberPassword())}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      title="Neues Passwort generieren"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Rolle
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="gast">Gast / Externer Delegierter</option>
                    <option value="presse">Presse / Beobachter</option>
                    <option value="mitglied">Vollmitglied</option>
                    <option value="strategie">Strategieführung</option>
                  </select>
                </div>
              </div>

              {/* Ablaufzeit Presets */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Gültigkeitsdauer (Ablaufzeit)</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-2">
                  {[
                    { id: '2h', label: '2 Std.' },
                    { id: '6h', label: '6 Std.' },
                    { id: '12h', label: '12 Std.' },
                    { id: '24h', label: '24 Std.' },
                    { id: '48h', label: '48 Std.' },
                    { id: 'never', label: 'Unbegrenzt' },
                    { id: 'custom', label: 'Benutzerdefiniert' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setExpirationPreset(p.id as any)}
                      className={`py-1.5 px-2 rounded-xl font-bold text-xs border transition cursor-pointer ${
                        expirationPreset === p.id
                          ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {expirationPreset === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customExpiresAt}
                    onChange={(e) => setCustomExpiresAt(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-sky-500 text-xs font-mono"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-xs"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer"
                >
                  Zugang erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
