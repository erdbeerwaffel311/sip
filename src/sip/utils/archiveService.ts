import { SipArchivedSession, SipSession } from '../types';
import { AppSettings } from '../../types';
import { getSupabaseClient, querySipRow, upsertSipRow } from '../../utils/supabaseSync';

export const SIP_ARCHIVE_ROW_ID = '__sip_archives__';
export const SIP_ARCHIVE_STORAGE_KEY = 'sip_archived_sessions_v1';

/**
 * Lädt alle archivierten SiP-Sitzungen (Supabase mit Fallback auf LocalStorage)
 */
export async function fetchArchivedSessions(settings?: AppSettings): Promise<SipArchivedSession[]> {
  const client = getSupabaseClient(settings);
  if (client) {
    try {
      const { data, error } = await querySipRow(client, SIP_ARCHIVE_ROW_ID);

      if (!error && data && data.payload && Array.isArray(data.payload.archives)) {
        const archives = data.payload.archives as SipArchivedSession[];
        try {
          localStorage.setItem(SIP_ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
        } catch {}
        return archives;
      }
    } catch (err) {
      console.warn('Could not fetch archives from Supabase:', err);
    }
  }

  // Fallback auf LocalStorage
  try {
    const saved = localStorage.getItem(SIP_ARCHIVE_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as SipArchivedSession[];
    }
  } catch {}

  return [];
}

/**
 * Archiviert die aktuelle SiP-Sitzung
 */
export async function archiveCurrentSession(
  session: SipSession,
  archivedBy: string,
  settings?: AppSettings
): Promise<SipArchivedSession[]> {
  const currentArchives = await fetchArchivedSessions(settings);

  const newArchiveEntry: SipArchivedSession = {
    id: `archive_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionTitle: session.title,
    archivedAt: new Date().toISOString(),
    archivedBy: archivedBy || 'Strategieführung',
    antraegeCount: session.antraege.length,
    activityCount: (session.activityLog || []).length,
    sessionData: JSON.parse(JSON.stringify(session)),
  };

  const updatedArchives = [newArchiveEntry, ...currentArchives];

  // In LocalStorage speichern
  try {
    localStorage.setItem(SIP_ARCHIVE_STORAGE_KEY, JSON.stringify(updatedArchives));
  } catch {}

  // In Supabase speichern
  const client = getSupabaseClient(settings);
  if (client) {
    try {
      await upsertSipRow(client, {
        id: SIP_ARCHIVE_ROW_ID,
        name: 'SiP Archivierte Sitzungen',
        category: '__sip_system__',
        quantity: updatedArchives.length,
        payload: {
          archives: updatedArchives,
        },
      });
    } catch (err) {
      console.error('Error persisting archive to Supabase:', err);
    }
  }

  return updatedArchives;
}

/**
 * Löscht eine archivierte Sitzung aus dem Archiv
 */
export async function deleteArchivedSession(
  archiveId: string,
  settings?: AppSettings
): Promise<SipArchivedSession[]> {
  const currentArchives = await fetchArchivedSessions(settings);
  const updatedArchives = currentArchives.filter((a) => a.id !== archiveId);

  // In LocalStorage speichern
  try {
    localStorage.setItem(SIP_ARCHIVE_STORAGE_KEY, JSON.stringify(updatedArchives));
  } catch {}

  // In Supabase speichern
  const client = getSupabaseClient(settings);
  if (client) {
    try {
      await upsertSipRow(client, {
        id: SIP_ARCHIVE_ROW_ID,
        name: 'SiP Archivierte Sitzungen',
        category: '__sip_system__',
        quantity: updatedArchives.length,
        payload: {
          archives: updatedArchives,
        },
      });
    } catch (err) {
      console.error('Error updating archive in Supabase:', err);
    }
  }

  return updatedArchives;
}
