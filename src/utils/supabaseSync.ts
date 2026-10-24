import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppSettings } from '../types';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function normalizeSupabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  return rawUrl.trim().replace(/\/rest\/v1\/?.*$/i, '').replace(/\/+$/, '');
}

export function getSupabaseClient(settings: AppSettings): SupabaseClient | null {
  const url = normalizeSupabaseUrl(settings.supabaseUrl);
  const key = settings.supabaseAnonKey?.trim();
  if (!url || !key) return null;

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
