import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  DEFAULT_SIP_SESSION,
  SipAntrag,
  SipMeme,
  SipNotification,
  SipSession,
  VoteRecommendation,
  SipActivityLogEntry,
} from './types';
import { AppSettings } from '../types';
import { getSupabaseClient } from '../utils/supabaseSync';
import { archiveCurrentSession } from './utils/archiveService';

export const SIP_STORAGE_KEY = 'sip_current_session_v1';
export const SIP_NOTIFICATION_STORAGE_KEY = 'sip_recent_notifications_v1';
export const SIP_REALTIME_CHANNEL_NAME = 'sip_parlament_live';
export const SIP_DB_ROW_ID = '__sip_session_current__';

export type SipRealtimeMessage =
  | { type: 'STATE_SYNC'; session: SipSession }
  | { type: 'NEW_ACTIVE_ANTRAG'; antragId: string; antrag: SipAntrag }
  | { type: 'VOTE_REC_CHANGED'; recommendation: VoteRecommendation }
  | { type: 'ANTRAG_CLAIMED'; antragId: string; antragTitle: string; claimedBy: string }
  | { type: 'ANTRAG_UNCLAIMED'; antragId: string; antragTitle: string; unclaimedBy: string }
  | { type: 'ANTRAG_SUBMITTED'; antrag: SipAntrag }
  | { type: 'ANTRAG_APPROVED'; antrag: SipAntrag }
  | { type: 'MEME_ADDED'; meme: SipMeme };

class SipRealtimeService {
  private localChannel: BroadcastChannel | null = null;
  private supabaseChannel: RealtimeChannel | null = null;
  private currentSession: SipSession = DEFAULT_SIP_SESSION;
  private listeners: Set<(session: SipSession) => void> = new Set();
  private notificationListeners: Set<(notif: SipNotification) => void> = new Set();
  private activeBlurPopupListeners: Set<(antrag: SipAntrag) => void> = new Set();
  private isInitialized = false;

  private syncInterval: any = null;

  constructor() {
    this.initLocalChannel();
  }

  private initLocalChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.localChannel = new BroadcastChannel('sip_local_broadcast');
        this.localChannel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel not supported or failed:', err);
      }
    }
  }

  private hasLoadedCloudSession = false;
  private cachedSettings: AppSettings | null = null;

  private mergeWithFreshPreFabs(session: Partial<SipSession>): SipSession {
    let activeId = session.activeAntragId !== undefined ? session.activeAntragId : null;
    if (activeId && activeId.includes('antrag_top_')) {
      activeId = activeId.replace('antrag_top_', 'antrag_');
    }

    const customAntraege = (session.antraege || [])
      .filter((a) => !a.isPreFab)
      .map((a) => (a.id.includes('antrag_top_') ? { ...a, id: a.id.replace('antrag_top_', 'antrag_') } : a));

    const existingClaims = new Map<
      string,
      { claimedBy: string | null; claimedAt: string | null; isActive?: boolean }
    >();
    (session.antraege || []).forEach((a) => {
      const cleanId = a.id.replace('antrag_top_', 'antrag_');
      if (a.claimedBy || a.isActive) {
        existingClaims.set(cleanId, {
          claimedBy: a.claimedBy || null,
          claimedAt: a.claimedAt || null,
          isActive: a.isActive,
        });
      }
    });

    const refreshedPreFabs = DEFAULT_SIP_SESSION.antraege.map((fresh) => {
      const claim = existingClaims.get(fresh.id);
      const isCurrentlyActive = activeId ? fresh.id === activeId : (claim?.isActive ?? false);
      return {
        ...fresh,
        claimedBy: claim ? claim.claimedBy : fresh.claimedBy,
        claimedAt: claim ? claim.claimedAt : fresh.claimedAt,
        isActive: isCurrentlyActive,
      };
    });

    return {
      ...DEFAULT_SIP_SESSION,
      ...session,
      title: session.title || DEFAULT_SIP_SESSION.title,
      strategyNotes: session.strategyNotes || DEFAULT_SIP_SESSION.strategyNotes,
      driveFolderUrl: session.driveFolderUrl || DEFAULT_SIP_SESSION.driveFolderUrl,
      activeAntragId: activeId,
      voteRecommendation: session.voteRecommendation || DEFAULT_SIP_SESSION.voteRecommendation,
      antraege: [...refreshedPreFabs, ...customAntraege],
      memes: session.memes && session.memes.length > 0 ? session.memes : DEFAULT_SIP_SESSION.memes,
    };
  }

  private applyCloudSession(cloudSession: SipSession) {
    if (!cloudSession) return;
    const merged = this.mergeWithFreshPreFabs(cloudSession);

    const prevActiveId = this.currentSession.activeAntragId;
    const newActiveId = merged.activeAntragId;
    const isNewActive = Boolean(newActiveId && newActiveId !== prevActiveId);

    // Supabase ist die offizielle Single Source of Truth für alle Teilnehmer im Plenum
    this.hasLoadedCloudSession = true;
    this.currentSession = merged;
    this.notify();

    if (isNewActive && newActiveId) {
      const newlyActiveAntrag = merged.antraege.find((a) => a.id === newActiveId);
      if (newlyActiveAntrag) {
        this.triggerBlurPopup(newlyActiveAntrag);
        this.triggerNotification({
          id: `notif_${Date.now()}`,
          title: '🚨 Neuer Antrag aufgerufen!',
          message: `${newlyActiveAntrag.title} wird jetzt im Parlament verhandelt.`,
          type: 'motion',
          timestamp: new Date().toISOString(),
          antragId: newlyActiveAntrag.id,
        });
      }
    }
  }

  public init(settings: AppSettings) {
    this.cachedSettings = settings;

    // Lade gespeicherte Session aus LocalStorage
    try {
      const saved = localStorage.getItem(SIP_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.currentSession = this.mergeWithFreshPreFabs({ ...DEFAULT_SIP_SESSION, ...parsed });
      }
    } catch {
      this.currentSession = DEFAULT_SIP_SESSION;
    }

    // Verbinde mit Supabase Realtime
    this.setupSupabase(settings);

    // Versuche neuesten Stand sofort aus Supabase abzurufen
    this.fetchFromSupabase(settings).catch(() => {});

    // Schneller Sync-Takt alle 2 Sekunden zur garantierten Ausfallsicherheit
    if (!this.syncInterval) {
      this.syncInterval = setInterval(() => {
        this.fetchFromSupabase(this.cachedSettings || settings).catch(() => {});
      }, 2000);
    }
  }

  public setupSupabase(settings: AppSettings) {
    const client = getSupabaseClient(settings);
    if (!client) return;

    if (this.supabaseChannel) {
      client.removeChannel(this.supabaseChannel);
    }

    try {
      this.supabaseChannel = client.channel(SIP_REALTIME_CHANNEL_NAME, {
        config: { broadcast: { self: false } },
      });

      this.supabaseChannel
        .on('broadcast', { event: 'sip_event' }, (payload) => {
          if (payload && payload.payload) {
            this.handleIncomingMessage(payload.payload as SipRealtimeMessage);
          }
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'keller_items',
            filter: `id=eq.${SIP_DB_ROW_ID}`,
          },
          (payload) => {
            if (payload && payload.new && (payload.new as any).payload) {
              const cloudSession = (payload.new as any).payload as SipSession;
              this.applyCloudSession(cloudSession);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[SiP Realtime] Connected to live channel');
          }
        });
    } catch (err) {
      console.warn('Supabase Realtime setup error:', err);
    }
  }

  public getSession(): SipSession {
    return this.currentSession;
  }

  public subscribe(cb: (session: SipSession) => void): () => void {
    this.listeners.add(cb);
    cb(this.currentSession);
    return () => this.listeners.delete(cb);
  }

  public onNotification(cb: (notif: SipNotification) => void): () => void {
    this.notificationListeners.add(cb);
    return () => this.notificationListeners.delete(cb);
  }

  public onBlurPopup(cb: (antrag: SipAntrag) => void): () => void {
    this.activeBlurPopupListeners.add(cb);
    return () => this.activeBlurPopupListeners.delete(cb);
  }

  private saveToStorage() {
    try {
      localStorage.setItem(SIP_STORAGE_KEY, JSON.stringify(this.currentSession));
    } catch {}
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.currentSession);
      } catch (err) {
        console.error('Error in session listener:', err);
      }
    });
    this.saveToStorage();
  }

  private triggerNotification(notif: SipNotification) {
    this.notificationListeners.forEach((cb) => {
      try {
        cb(notif);
      } catch (err) {
        console.error('Error in notification listener:', err);
      }
    });
  }

  private triggerBlurPopup(antrag: SipAntrag) {
    this.activeBlurPopupListeners.forEach((cb) => {
      try {
        cb(antrag);
      } catch (err) {
        console.error('Error in blur popup listener:', err);
      }
    });
  }

  private broadcastMessage(msg: SipRealtimeMessage, settings?: AppSettings) {
    // 1. Lokaler Broadcast
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(msg);
      } catch {}
    }

    // 2. Supabase Realtime Broadcast
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'sip_event',
          payload: msg,
        });
      } catch {}
    }

    // 3. Persistenz in Supabase im Hintergrund anstoßen
    this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession).catch(() => {});
  }

  private handleIncomingMessage(msg: SipRealtimeMessage) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'STATE_SYNC':
        if (msg.session && (!this.currentSession || msg.session.updatedAt >= this.currentSession.updatedAt)) {
          this.applyCloudSession(msg.session);
        }
        break;

      case 'NEW_ACTIVE_ANTRAG': {
        const targetAntrag =
          this.currentSession.antraege.find((a) => a.id === msg.antragId) || msg.antrag;

        this.currentSession = {
          ...this.currentSession,
          activeAntragId: msg.antragId,
          voteRecommendation: {
            type: 'KEINE',
            note: '',
            updatedAt: new Date().toISOString(),
            updatedBy: 'Strategieführung',
            isPublished: false,
          },
          antraege: this.currentSession.antraege.map((a) => ({
            ...a,
            isActive: a.id === msg.antragId,
          })),
          updatedAt: new Date().toISOString(),
        };
        this.notify();
        this.triggerBlurPopup(targetAntrag);
        this.triggerNotification({
          id: `notif_${Date.now()}`,
          title: '🚨 Neuer Antrag aufgerufen!',
          message: `${targetAntrag.title} wird jetzt im Parlament verhandelt.`,
          type: 'motion',
          timestamp: new Date().toISOString(),
          antragId: msg.antragId,
        });
        break;
      }

      case 'VOTE_REC_CHANGED': {
        this.currentSession = {
          ...this.currentSession,
          voteRecommendation: msg.recommendation,
          updatedAt: new Date().toISOString(),
        };
        this.notify();
        this.triggerNotification({
          id: `notif_${Date.now()}`,
          title: `🗳️ Abstimmungsempfehlung: ${msg.recommendation.type}`,
          message: msg.recommendation.note || 'Die Strategieführung hat die Empfehlung aktualisiert.',
          type: 'vote',
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'ANTRAG_CLAIMED': {
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antragId
              ? { ...a, claimedBy: msg.claimedBy, claimedAt: new Date().toISOString() }
              : a
          ),
          updatedAt: new Date().toISOString(),
        };
        this.notify();
        this.triggerNotification({
          id: `notif_${Date.now()}`,
          title: '📢 Antrag geclaimed!',
          message: `${msg.claimedBy} hat "${msg.antragTitle}" geclaimed.`,
          type: 'claim',
          timestamp: new Date().toISOString(),
          antragId: msg.antragId,
        });
        break;
      }

      case 'ANTRAG_UNCLAIMED': {
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antragId ? { ...a, claimedBy: null, claimedAt: null } : a
          ),
          updatedAt: new Date().toISOString(),
        };
        this.notify();
        break;
      }

      case 'ANTRAG_SUBMITTED': {
        const exists = this.currentSession.antraege.some((a) => a.id === msg.antrag.id);
        if (!exists) {
          this.currentSession = {
            ...this.currentSession,
            antraege: [msg.antrag, ...this.currentSession.antraege],
            updatedAt: new Date().toISOString(),
          };
          this.notify();
          this.triggerNotification({
            id: `notif_${Date.now()}`,
            title: '📝 Neuer Antrag eingereicht',
            message: `${msg.antrag.author} hat einen neuen Antrag eingereicht.`,
            type: 'motion',
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'ANTRAG_APPROVED': {
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antrag.id ? msg.antrag : a
          ),
          updatedAt: new Date().toISOString(),
        };
        this.notify();
        break;
      }

      case 'MEME_ADDED': {
        const exists = this.currentSession.memes.some((m) => m.id === msg.meme.id);
        if (!exists) {
          this.currentSession = {
            ...this.currentSession,
            memes: [msg.meme, ...this.currentSession.memes],
            updatedAt: new Date().toISOString(),
          };
          this.notify();
        }
        break;
      }
    }
  }

  // --- ACTIONS & AUDIT LOGGING ---

  public logActivity(entry: Omit<SipActivityLogEntry, 'id' | 'timestamp'>) {
    const fullEntry: SipActivityLogEntry = {
      ...entry,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    const currentLogs = this.currentSession.activityLog || [];
    this.currentSession = {
      ...this.currentSession,
      activityLog: [fullEntry, ...currentLogs].slice(0, 500),
    };
  }

  /**
   * Strategieführung ruft einen neuen Antrag auf (ploppt auf allen Geräten auf!)
   */
  public async activateAntrag(antragId: string, settings?: AppSettings) {
    const antrag = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!antrag) return;

    this.logActivity({
      action: 'ANTRAG_ACTIVATED',
      antragId,
      antragTitle: antrag.title,
      performedBy: 'Strategieführung',
      details: `Antrag "${antrag.title}" im Plenum aufgerufen`,
    });

    this.currentSession = {
      ...this.currentSession,
      activeAntragId: antragId,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: this.currentSession.antraege.map((a) => ({
        ...a,
        isActive: a.id === antragId,
      })),
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'NEW_ACTIVE_ANTRAG',
      antragId,
      antrag,
    };
    this.broadcastMessage(msg, settings);

    const stateMsg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(stateMsg, settings);

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Strategieführung beendet den aktuellen Aufruf (Pause / Zwischenabstimmung)
   */
  public async clearActiveAntrag(settings?: AppSettings) {
    this.logActivity({
      action: 'ANTRAG_CLEARED',
      performedBy: 'Strategieführung',
      details: 'Aufruf im Plenum beendet (Pause)',
    });

    this.currentSession = {
      ...this.currentSession,
      activeAntragId: null,
      antraege: this.currentSession.antraege.map((a) => ({
        ...a,
        isActive: false,
      })),
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Abstimmungsempfehlung zentral pushen
   */
  public setVoteRecommendation(
    rec: Omit<VoteRecommendation, 'updatedAt'>,
    settings?: AppSettings
  ) {
    const fullRec: VoteRecommendation = {
      ...rec,
      isPublished: rec.isPublished ?? true,
      updatedAt: new Date().toISOString(),
    };

    this.logActivity({
      action: 'VOTE_REC_SET',
      performedBy: fullRec.updatedBy || 'Strategieführung',
      details: `Offizielle Abstimmungsempfehlung geändert: ${fullRec.type}${fullRec.note ? ` (${fullRec.note})` : ''}`,
    });

    this.currentSession = {
      ...this.currentSession,
      voteRecommendation: fullRec,
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    if (fullRec.isPublished && fullRec.type !== 'KEINE') {
      this.triggerNotification({
        id: `notif_${Date.now()}`,
        title: '📢 Offizielle Abstimmungsempfehlung!',
        message: `Empfehlung: ${fullRec.type}${fullRec.note ? ` – ${fullRec.note}` : ''}`,
        type: 'vote',
        timestamp: new Date().toISOString(),
      });
    }

    const msg: SipRealtimeMessage = {
      type: 'VOTE_REC_CHANGED',
      recommendation: fullRec,
    };
    this.broadcastMessage(msg, settings);
  }

  /**
   * Ein Mitglied oder die Strategieführung claimt einen Antrag
   */
  public claimAntrag(antragId: string, memberName: string, settings?: AppSettings) {
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!target) return;

    this.logActivity({
      action: 'ANTRAG_CLAIMED',
      antragId,
      antragTitle: target.title,
      performedBy: memberName,
      details: `${memberName} hat Rede geclaimed: "${target.title}"`,
    });

    const claimedAt = new Date().toISOString();
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: memberName, claimedAt } : a
      ),
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    // Lokaler Toast sofort für den Nutzer
    this.triggerNotification({
      id: `notif_${Date.now()}`,
      title: '📢 Antrag geclaimed!',
      message: `${memberName} hat "${target.title}" geclaimed.`,
      type: 'claim',
      timestamp: new Date().toISOString(),
      antragId,
    });

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_CLAIMED',
      antragId,
      antragTitle: target.title,
      claimedBy: memberName,
    };
    this.broadcastMessage(msg, settings);
  }

  /**
   * Claim zurückziehen
   */
  public unclaimAntrag(antragId: string, memberName: string, settings?: AppSettings) {
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!target) return;

    this.logActivity({
      action: 'ANTRAG_UNCLAIMED',
      antragId,
      antragTitle: target.title,
      performedBy: memberName,
      details: `${memberName} hat Claim abgegeben: "${target.title}"`,
    });

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: null, claimedAt: null } : a
      ),
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_UNCLAIMED',
      antragId,
      antragTitle: target.title,
      unclaimedBy: memberName,
    };
    this.broadcastMessage(msg, settings);
  }

  /**
   * Neues Mitglied reicht eigenen Antrag ein (wartet auf Strategieführung)
   */
  public submitCustomAntrag(
    antragData: Omit<SipAntrag, 'id' | 'isPreFab' | 'status' | 'createdAt'>,
    settings?: AppSettings
  ): SipAntrag {
    const newAntrag: SipAntrag = {
      ...antragData,
      id: `antrag_custom_${Date.now()}`,
      isPreFab: false,
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      claimedBy: antragData.author, // automatisch geclaimed vom Verfasser
      claimedAt: new Date().toISOString(),
    };

    this.logActivity({
      action: 'ANTRAG_SUBMITTED',
      antragId: newAntrag.id,
      antragTitle: newAntrag.title,
      performedBy: antragData.author,
      details: `${antragData.author} hat [${newAntrag.type}] eingereicht: "${newAntrag.title}"`,
    });

    this.currentSession = {
      ...this.currentSession,
      antraege: [newAntrag, ...this.currentSession.antraege],
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_SUBMITTED',
      antrag: newAntrag,
    };
    this.broadcastMessage(msg, settings);

    return newAntrag;
  }

  /**
   * Strategieführung genehmigt oder überarbeitet einen Antrag
   */
  public updateOrApproveAntrag(
    antragId: string,
    updates: Partial<SipAntrag>,
    settings?: AppSettings
  ) {
    let updatedObj: SipAntrag | null = null;
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) => {
        if (a.id === antragId) {
          updatedObj = { ...a, ...updates, updatedAt: new Date().toISOString() } as SipAntrag;
          return updatedObj;
        }
        return a;
      }),
      updatedAt: new Date().toISOString(),
    };

    if (updatedObj) {
      const actAction = updates.status === 'approved' ? 'ANTRAG_APPROVED' : updates.status === 'rejected' ? 'ANTRAG_REJECTED' : 'ANTRAG_EDITED';
      const actDetail = updates.status === 'approved' ? `Antrag "${(updatedObj as SipAntrag).title}" bestätigt & freigegeben` : updates.status === 'rejected' ? `Antrag "${(updatedObj as SipAntrag).title}" abgelehnt` : `Antrag "${(updatedObj as SipAntrag).title}" redaktionell bearbeitet`;

      this.logActivity({
        action: actAction,
        antragId,
        antragTitle: (updatedObj as SipAntrag).title,
        performedBy: 'Strategieführung',
        details: actDetail,
      });
    }

    this.saveToStorage();
    this.notify();

    if (updatedObj) {
      const msg: SipRealtimeMessage = {
        type: 'ANTRAG_APPROVED',
        antrag: updatedObj,
      };
      this.broadcastMessage(msg, settings);
    }
  }

  /**
   * Löscht einen Antrag
   */
  public deleteAntrag(antragId: string, settings?: AppSettings) {
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (target) {
      this.logActivity({
        action: 'ANTRAG_DELETED',
        antragId,
        antragTitle: target.title,
        performedBy: 'Strategieführung',
        details: `Antrag "${target.title}" gelöscht`,
      });
    }

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.filter((a) => a.id !== antragId),
      activeAntragId:
        this.currentSession.activeAntragId === antragId
          ? null
          : this.currentSession.activeAntragId,
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession).catch(() => {});
  }

  /**
   * Archiviert die aktuelle Sitzung und startet ein neues SiP
   */
  public async startNewSession(newTitle: string, settings?: AppSettings): Promise<void> {
    const oldSession = { ...this.currentSession };
    await archiveCurrentSession(oldSession, 'Strategieführung', settings || this.cachedSettings || undefined);

    this.currentSession = {
      ...DEFAULT_SIP_SESSION,
      id: `session_${Date.now()}`,
      title: newTitle.trim() || DEFAULT_SIP_SESSION.title,
      activeAntragId: null,
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: new Date().toISOString(),
          performedBy: 'Strategieführung',
          action: 'SESSION_ARCHIVED',
          details: `Neue Sitzung "${newTitle.trim() || DEFAULT_SIP_SESSION.title}" gestartet. Vorherige Sitzung "${oldSession.title}" wurde im Archiv gesichert.`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    this.notify();

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
    this.broadcastMessage({ type: 'STATE_SYNC', session: this.currentSession }, settings);
  }

  /**
   * Batch-Import von vorgefertigten Anträgen aus Dokument
   */
  public importAntraege(newAntraege: SipAntrag[], settings?: AppSettings) {
    this.currentSession = {
      ...this.currentSession,
      antraege: [...newAntraege, ...this.currentSession.antraege],
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
  }

  /**
   * Aktualisiert Strategie-Notizen
   */
  public updateStrategyNotes(notes: string, settings?: AppSettings) {
    this.currentSession = {
      ...this.currentSession,
      strategyNotes: notes,
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    if (settings) {
      this.syncSessionToSupabase(settings, this.currentSession).catch(() => {});
    }
  }

  /**
   * Aktualisiert Google Drive Ordner Link oder SiP Titel
   */
  public updateSessionMetadata(
    metadata: { title?: string; driveFolderUrl?: string },
    settings?: AppSettings
  ) {
    this.currentSession = {
      ...this.currentSession,
      ...metadata,
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
  }

  /**
   * Fügt ein Meme hinzu
   */
  public addMeme(
    memeData: { author: string; imageUrl: string; caption: string },
    settings?: AppSettings
  ) {
    const newMeme: SipMeme = {
      id: `meme_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      author: memeData.author,
      imageUrl: memeData.imageUrl,
      caption: memeData.caption,
      createdAt: new Date().toISOString(),
      reactions: {},
    };

    this.currentSession = {
      ...this.currentSession,
      memes: [newMeme, ...this.currentSession.memes],
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'MEME_ADDED',
      meme: newMeme,
    };
    this.broadcastMessage(msg, settings);
  }

  /**
   * Reagiert auf ein Meme mit einem Emoji
   */
  public toggleMemeReaction(
    memeId: string,
    emoji: string,
    userName: string,
    settings?: AppSettings
  ) {
    this.currentSession = {
      ...this.currentSession,
      memes: this.currentSession.memes.map((meme) => {
        if (meme.id !== memeId) return meme;

        const currentUsers = meme.reactions[emoji] || [];
        const hasReacted = currentUsers.includes(userName);
        const updatedUsers = hasReacted
          ? currentUsers.filter((u) => u !== userName)
          : [...currentUsers, userName];

        const updatedReactions = { ...meme.reactions };
        if (updatedUsers.length > 0) {
          updatedReactions[emoji] = updatedUsers;
        } else {
          delete updatedReactions[emoji];
        }

        return { ...meme, reactions: updatedReactions };
      }),
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
  }

  // --- SUPABASE PERSISTENCE ---

  private async fetchFromSupabase(settings?: AppSettings) {
    const client = getSupabaseClient(settings || this.cachedSettings || undefined);
    if (!client) return;

    try {
      // Wir nutzen keller_items als universelle persistente Tabelle, falls vorhanden
      const { data, error } = await client
        .from('keller_items')
        .select('*')
        .eq('id', SIP_DB_ROW_ID)
        .maybeSingle();

      if (!error && data && data.payload) {
        const cloudSession = data.payload as SipSession;
        this.applyCloudSession(cloudSession);
      }
    } catch (err) {
      console.warn('Could not fetch SiP session from Supabase:', err);
    }
  }

  public async syncSessionToSupabase(settings?: AppSettings, session?: SipSession) {
    const client = getSupabaseClient(settings || this.cachedSettings || undefined);
    if (!client) return;

    const sess = session || this.currentSession;
    try {
      const { error } = await client.from('keller_items').upsert({
        id: SIP_DB_ROW_ID,
        name: `SiP Session: ${sess.title}`,
        category: '__sip_system__',
        quantity: 1,
        updated_at: new Date().toISOString(),
        payload: sess,
      });

      if (error) {
        console.error('[SiP Realtime] Error persisting session to Supabase:', error);
      }
    } catch (err) {
      console.warn('Could not persist SiP session to Supabase:', err);
    }
  }
}

export const sipRealtime = new SipRealtimeService();
