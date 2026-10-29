import { SipArchivedSession, SipSession } from '../types';
import { AppSettings } from '../../types';
import { querySipRow, upsertSipRow, SIP_ARCHIVE_ROW_ID } from '../../utils/supabaseSync';

export { SIP_ARCHIVE_ROW_ID };
export const SIP_ARCHIVE_STORAGE_KEY = 'sip_archived_sessions_v1';

/**
 * Lädt alle archivierten SiP-Sitzungen (PocketBase mit Fallback auf LocalStorage)
 */
export async function fetchArchivedSessions(_settings?: AppSettings): Promise<SipArchivedSession[]> {
  const res = await querySipRow(SIP_ARCHIVE_ROW_ID);
  const data = res ? res.data : null;
  const error = res ? res.error : null;

  if (!error && data && data.payload && Array.isArray(data.payload.archives)) {
    const archives = data.payload.archives as unknown as SipArchivedSession[];
    try {
      localStorage.setItem(SIP_ARCHIVE_STORAGE_KEY, JSON.stringify(archives));
    } catch (err) {
      console.warn('LocalStorage error:', err);
    }
    return archives;
  }

  // Fallback auf LocalStorage
  try {
    const saved = localStorage.getItem(SIP_ARCHIVE_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as unknown as SipArchivedSession[];
    }
  } catch (err) {
    console.warn('LocalStorage error:', err);
  }

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
  } catch (err) {
    console.warn('LocalStorage error:', err);
  }

  // In PocketBase speichern
  const archivePayload = {
    archives: updatedArchives,
  };
  const recordData = {
    id: SIP_ARCHIVE_ROW_ID,
    payload: archivePayload,
  };

  await upsertSipRow(recordData);

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
  } catch (err) {
    console.warn('LocalStorage error:', err);
  }

  // In PocketBase speichern
  const archivePayload = {
    archives: updatedArchives,
  };
  const recordData = {
    id: SIP_ARCHIVE_ROW_ID,
    payload: archivePayload,
  };

  await upsertSipRow(recordData);

  return updatedArchives;
}
