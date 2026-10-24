import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppSettings } from '../types';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export const SIP_CONFIG_ROW_ID = '__sip_users_config__';

export interface CloudTwoFactorToken {
  code: string;
  email: string;
  expiresAt: string;
}

export function normalizeSupabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  return rawUrl.trim().replace(/\/rest\/v1\/?.*$/i, '').replace(/\/+$/, '');
}

export const DEFAULT_SUPABASE_URL = 'https://ofdqsfkuxiikxygthnov.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mZHFzZmt1eGlpa3h5Z3Robm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MzYzMzAsImV4cCI6MjEwODQxMjMzMH0.xU0FNyWPpmA7A25UqOFcbV3QeAA6T3xk4dV25HdqImk';

export function getSupabaseClient(_settings?: Partial<AppSettings> | null): SupabaseClient | null {
  const url = DEFAULT_SUPABASE_URL;
  const key = DEFAULT_SUPABASE_ANON_KEY;

  const cacheToken = `${url}::${key}`;
  if (cachedClient && cachedKey === cacheToken) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: { persistSession: true, detectSessionInUrl: true },
    });
    cachedKey = cacheToken;
    return cachedClient;
  } catch {
    return null;
  }
}

/**
 * Einheitliche SiP-Tabelle in Supabase:
 * Wir setzen durchgehend auf 'sip_state' mit den Spalten id (Text) und payload (JSONB).
 */
export const SIP_DATABASE_TABLE = 'sip_state';

/**
 * Universelle Abfrage für SiP-Datensätze aus der einheitlichen Tabelle.
 */
export async function querySipRow(
  client: SupabaseClient,
  rowId: string
): Promise<{ data: any | null; error: any | null; tableUsed: string }> {
  try {
    const { data, error } = await client
      .from(SIP_DATABASE_TABLE)
      .select('*')
      .eq('id', rowId)
      .maybeSingle();

    return { data, error, tableUsed: SIP_DATABASE_TABLE };
  } catch (err) {
    return { data: null, error: err, tableUsed: SIP_DATABASE_TABLE };
  }
}

/**
 * Universelles Upsert für SiP-Datensätze in die einheitliche Tabelle.
 */
export async function upsertSipRow(
  client: SupabaseClient,
  row: {
    id: string;
    payload: any;
    name?: string;
    category?: string;
    quantity?: number;
  }
): Promise<{ success: boolean; error?: any; tableUsed: string }> {
  const record = {
    id: row.id,
    payload: row.payload,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await client.from(SIP_DATABASE_TABLE).upsert(record);
    return { success: !error, error, tableUsed: SIP_DATABASE_TABLE };
  } catch (err) {
    return { success: false, error: err, tableUsed: SIP_DATABASE_TABLE };
  }
}

/**
 * Sendet einen 2FA-Bestätigungscode / Magic-Link an die hinterlegte Admin-E-Mail-Adresse über Supabase Auth.
 * Falls das Supabase-Limit erreicht ist, wird rateLimited: true zurückgegeben und der Backup-Code verwendet.
 */
export async function sendAdmin2FAEmail(
  settings: AppSettings,
  targetEmail: string
): Promise<{ rateLimited: boolean; backupCode?: string }> {
  const client = getSupabaseClient(settings);
  if (!client) {
    throw new Error('Keine gültige Supabase-Datenbankverbindung konfiguriert.');
  }
  const cleanEmail = targetEmail.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
  }

  // Erstelle einen 6-stelligen Code (15 Minuten gültig)
  const backupCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Speichere in Supabase (sip_state)
  try {
    const { data: currentRecord } = await querySipRow(client, SIP_CONFIG_ROW_ID);
    const payload = currentRecord?.payload || {};

    await upsertSipRow(client, {
      id: SIP_CONFIG_ROW_ID,
      payload: {
        ...payload,
        twoFactorToken: {
          code: backupCode,
          email: cleanEmail.toLowerCase(),
          expiresAt,
        },
      },
    });
  } catch (err) {
    console.warn('Konnte Cloud-2FA-Token nicht speichern:', err);
  }

  const redirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?2fa=verify&source=sip`
      : 'https://sip.schuelerunion-vorarlberg.at/?2fa=verify&source=sip';

  const { error } = await client.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) {
    const msgLower = (error.message || '').toLowerCase();
    if (
      msgLower.includes('rate limit') ||
      msgLower.includes('over_email_send_rate_limit') ||
      error.status === 429
    ) {
      return { rateLimited: true, backupCode };
    }
    throw new Error(error.message || 'Fehler beim Senden der 2FA-E-Mail.');
  }

  return { rateLimited: false, backupCode };
}

/**
 * Prüft den eingegebenen 2FA-Code (6-8-stelliger Zahlencode), einen aus der E-Mail kopierten
 * Bestätigungs-Link oder die Weiterleitungs-URL.
 */
export async function verifyAdmin2FACode(
  settings: AppSettings,
  email: string,
  tokenOrLink: string
): Promise<boolean> {
  const client = getSupabaseClient(settings);
  if (!client) {
    throw new Error('Keine gültige Supabase-Verbindung vorhanden.');
  }
  const cleanEmail = email.trim().toLowerCase();
  const rawInput = tokenOrLink.trim();
  if (!rawInput) return false;

  // 1. Hilfsprüfung gegen den in Supabase hinterlegten Cloud-Token
  async function checkCloudTwoFactorToken(candidateCode: string): Promise<boolean> {
    const cleanCandidate = candidateCode.trim();
    if (!cleanCandidate) return false;
    try {
      const { data } = await querySipRow(client!, SIP_CONFIG_ROW_ID);
      const payload = data?.payload;
      const t = payload?.twoFactorToken as CloudTwoFactorToken | undefined;
      if (
        t &&
        t.code === cleanCandidate &&
        t.email.toLowerCase() === cleanEmail &&
        new Date(t.expiresAt).getTime() > Date.now()
      ) {
        return true;
      }
    } catch {
      // Ignorieren
    }
    return false;
  }

  // 2. Falls eine URL eingefügt wurde
  if (
    rawInput.startsWith('http://') ||
    rawInput.startsWith('https://') ||
    rawInput.startsWith('localhost') ||
    rawInput.includes('access_token=') ||
    rawInput.includes('token=') ||
    rawInput.includes('2fa_code=')
  ) {
    try {
      const normalizedUrlStr = rawInput.startsWith('localhost')
        ? `http://${rawInput}`
        : rawInput.startsWith('http')
        ? rawInput
        : `https://dummy.local/?${rawInput.replace(/^#/, '')}`;
      const parsedUrl = new URL(normalizedUrlStr);

      const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
      const accessToken =
        hashParams.get('access_token') || parsedUrl.searchParams.get('access_token');
      if (accessToken) {
        const { data, error } = await client.auth.getUser(accessToken);
        if (!error && (data?.user?.email?.toLowerCase() === cleanEmail || data?.user)) {
          return true;
        }
      }

      const directCode =
        parsedUrl.searchParams.get('2fa_code') || parsedUrl.searchParams.get('code');
      if (directCode) {
        if (await checkCloudTwoFactorToken(directCode)) return true;
        const { data, error } = await client.auth.exchangeCodeForSession(directCode);
        if (!error && (data?.user?.email?.toLowerCase() === cleanEmail || data?.session)) {
          return true;
        }
      }

      const tokenHash =
        parsedUrl.searchParams.get('token_hash') || parsedUrl.searchParams.get('token');
      if (tokenHash) {
        if (await checkCloudTwoFactorToken(tokenHash)) return true;
        const linkTypes: Array<'magiclink' | 'email' | 'signup'> = [
          (parsedUrl.searchParams.get('type') as 'magiclink' | 'email' | 'signup') || 'magiclink',
          'magiclink',
          'email',
          'signup',
        ];
        for (const t of linkTypes) {
          const { data, error } = await client.auth.verifyOtp({
            token_hash: tokenHash,
            type: t,
          });
          if (!error && (data?.session || data?.user)) {
            return true;
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Prüfung gegen 6-stelligen Cloud-Token
  const cleanToken = rawInput.replace(/\s+/g, '');
  if (await checkCloudTwoFactorToken(cleanToken)) {
    return true;
  }

  // 4. Prüfung gegen Supabase Auth OTP
  const typesToTry: Array<'email' | 'magiclink' | 'signup'> = ['email', 'magiclink', 'signup'];
  for (const otpType of typesToTry) {
    try {
      const { data, error } = await client.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: otpType,
      });
      if (!error && (data?.session || data?.user)) {
        return true;
      }
    } catch {}
  }

  return false;
}
