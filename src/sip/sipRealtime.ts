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
import { getSupabaseClient, SIP_DATABASE_TABLE } from '../utils/supabaseSync';
import { archiveCurrentSession } from './utils/archiveService';

export const SIP_STORAGE_KEY = 'sip_current_session_v1';
export const SIP_NOTIFICATION_STORAGE_KEY = 'sip_recent_notifications_v1';
export const SIP_REALTIME_CHANNEL_NAME = 'sip-live-updates';
export const SIP_DB_ROW_ID = 'current_session';
export { SIP_DATABASE_TABLE };

export type SipRealtimeMessage =
  | { type: 'STATE_SYNC'; session: SipSession }
  | { type: 'NEW_ACTIVE_ANTRAG'; antragId: string; antrag: SipAntrag }
  | { type: 'VOTE_REC_CHANGED'; recommendation: VoteRecommendation }
  | { type: 'ANTRAG_CLAIMED'; antragId: string; antragTitle: string; claimedBy: string }
  | { type: 'ANTRAG_UNCLAIMED'; antragId: string; antragTitle: string; unclaimedBy: string }
  | { type: 'ANTRAG_SUBMITTED'; antrag: SipAntrag }
  | { type: 'ANTRAG_APPROVED'; antrag: SipAntrag }
  | { type: 'ANTRAG_DECIDED'; antragId: string; decision: 'ANGENOMMEN' | 'ABGELEHNT'; decidedAt: string }
  | { type: 'MEME_ADDED'; meme: SipMeme };

class SipRealtimeService {
  private localChannel: BroadcastChannel | null = null;
  private supabaseChannel: RealtimeChannel | null = null;
  private currentSession: SipSession = DEFAULT_SIP_SESSION;
  private listeners: Set<(session: SipSession) => void> = new Set();
  private notificationListeners: Set<(notif: SipNotification) => void> = new Set();
  private activeBlurPopupListeners: Set<(antrag: SipAntrag) => void> = new Set();
  private recentNotificationSignatures: Map<string, number> = new Map();
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
  private lastLocalMutationAt = 0;
  private isSyncingToSupabase = false;
  private pendingSyncSession: { settings?: AppSettings; session: SipSession } | null = null;

  /**
   * Erzeugt einen streng monoton steigenden ISO-Timestamp (immer > currentSession.updatedAt),
   * damit lokale Mutationen niemals denselben oder einen kleineren Timestamp haben.
   */
  private nextTimestamp(): string {
    const now = Date.now();
    const prev = this.currentSession?.updatedAt
      ? new Date(this.currentSession.updatedAt).getTime()
      : 0;
    const next = !isNaN(prev) && now <= prev ? prev + 1 : now;
    return new Date(next).toISOString();
  }

  private toCompactSession(session: SipSession): SipSession {
    const compactAntraege = (session.antraege || [])
      .filter((a) => !a.isPreFab || a.claimedBy || a.isActive || a.id === session.activeAntragId || a.isEditedByAdmin || a.plenumResult)
      .map((a) => {
        if (a.isPreFab && !a.isEditedByAdmin) {
          return {
            id: a.id,
            type: a.type,
            title: a.title,
            author: a.author,
            parentAntragId: a.parentAntragId,
            isPreFab: true,
            status: a.status,
            claimedBy: a.claimedBy || null,
            claimedAt: a.claimedAt || null,
            isActive: a.isActive ?? false,
            createdAt: a.createdAt,
            plenumResult: a.plenumResult || null,
            plenumResultAt: a.plenumResultAt || null,
            content: '',
          } as SipAntrag;
        }
        return a;
      });

    return {
      ...session,
      strategyNotes: '',
      antraege: compactAntraege,
      activityLog: (session.activityLog || []).slice(0, 30),
    };
  }

  private mergeWithFreshPreFabs(session: Partial<SipSession>): SipSession {
    let activeId = session.activeAntragId !== undefined ? session.activeAntragId : null;
    if (activeId && activeId.includes('antrag_top_')) {
      activeId = activeId.replace('antrag_top_', 'antrag_');
    }

    // Wenn es sich um eine archivierte, neu gestartete oder mit importierten Anträgen befüllte Sitzung handelt:
    // Keine alten Vorlage-Anträge oder alten Memes hineinmischen, sondern exakt die Session-Daten verwenden!
    const hasImportedMotions =
      Array.isArray(session.antraege) &&
      session.antraege.length > 0 &&
      (session.antraege.some((a) => !a.isPreFab) ||
        session.antraege.length !== DEFAULT_SIP_SESSION.antraege.length ||
        session.antraege[0]?.title !== DEFAULT_SIP_SESSION.antraege[0]?.title);
    const isOriginalTemplate = session.id === 'sip_current_session' && !hasImportedMotions;
    if ((!isOriginalTemplate && session.id) || hasImportedMotions) {
      return {
        id: session.id || `session_${Date.now()}`,
        title: session.title || 'Schüler:innenparlament (SiP)',
        strategyNotes: session.strategyNotes ?? '',
        driveFolderUrl: session.driveFolderUrl ?? '',
        activeAntragId: activeId,
        voteRecommendation: session.voteRecommendation || {
          type: 'KEINE',
          note: '',
          updatedAt: new Date().toISOString(),
          updatedBy: 'Strategieführung',
          isPublished: false,
        },
        antraege: session.antraege || [],
        memes: session.memes || [],
        activityLog: session.activityLog || [],
        updatedAt: session.updatedAt || new Date().toISOString(),
      };
    }

    const customAntraege = (session.antraege || [])
      .filter((a) => !a.isPreFab)
      .map((a) => (a.id.includes('antrag_top_') ? { ...a, id: a.id.replace('antrag_top_', 'antrag_') } : a));

    const existingClaims = new Map<
      string,
      {
        claimedBy: string | null;
        claimedAt: string | null;
        isActive?: boolean;
        plenumResult?: 'ANGENOMMEN' | 'ABGELEHNT' | null;
        plenumResultAt?: string | null;
      }
    >();
    (session.antraege || []).forEach((a) => {
      const cleanId = a.id.replace('antrag_top_', 'antrag_');
      if (a.claimedBy || a.isActive || a.plenumResult) {
        existingClaims.set(cleanId, {
          claimedBy: a.claimedBy || null,
          claimedAt: a.claimedAt || null,
          isActive: a.isActive,
          plenumResult: a.plenumResult || null,
          plenumResultAt: a.plenumResultAt || null,
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
        plenumResult: claim?.plenumResult ?? fresh.plenumResult ?? null,
        plenumResultAt: claim?.plenumResultAt ?? fresh.plenumResultAt ?? null,
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
      antraege: [...customAntraege, ...refreshedPreFabs],
      memes: Array.isArray(session.memes) ? session.memes.filter((m) => m.id !== 'meme_1') : [],
    };
  }

  private applyCloudSession(cloudSession: SipSession, forceOverwrite = false) {
    if (!cloudSession) return;
    // Strikte Blockade veralteter oder identischer Payloads
    if (
      !forceOverwrite &&
      cloudSession.updatedAt &&
      this.currentSession.updatedAt &&
      cloudSession.updatedAt <= this.currentSession.updatedAt
    ) {
      return;
    }
    const merged = this.mergeWithFreshPreFabs(cloudSession);

    const prevActiveId = this.currentSession.activeAntragId;
    const newActiveId = merged.activeAntragId;
    const isNewActive = Boolean(newActiveId && newActiveId !== prevActiveId);

    // 1. Claims diffen: Wenn jemand claimt, überall Benachrichtigung triggern
    if (this.hasLoadedCloudSession && this.currentSession.antraege) {
      merged.antraege.forEach((newA) => {
        if (newA.claimedBy) {
          const oldA = this.currentSession.antraege?.find((a) => a.id === newA.id);
          if (!oldA || oldA.claimedBy !== newA.claimedBy) {
            this.triggerNotification({
              id: `claim_${newA.id}_${newA.claimedBy}`,
              title: '📢 Antrag geclaimed!',
              message: `${newA.claimedBy} hat "${newA.title}" geclaimed.`,
              type: 'claim',
              timestamp: new Date().toISOString(),
              antragId: newA.id,
            });
          }
        }
      });
    }

    // 2. Abstimmungsempfehlung diffen: Wenn veröffentlicht oder geändert, überall Benachrichtigung triggern
    if (this.hasLoadedCloudSession) {
      const oldRec = this.currentSession.voteRecommendation;
      const newRec = merged.voteRecommendation;
      if (
        newRec &&
        newRec.isPublished &&
        newRec.type !== 'KEINE' &&
        (!oldRec ||
          !oldRec.isPublished ||
          oldRec.type !== newRec.type ||
          oldRec.updatedAt !== newRec.updatedAt ||
          oldRec.note !== newRec.note)
      ) {
        this.triggerNotification({
          id: `vote_${newRec.updatedAt || Date.now()}_${newRec.type}`,
          title: `🗳️ Abstimmungsempfehlung: ${newRec.type}`,
          message: newRec.note
            ? `Empfehlung: ${newRec.type} – ${newRec.note}`
            : `Empfehlung: ${newRec.type}`,
          type: 'vote',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 3. Neu eingereichte Nebenanträge von Mitgliedern
    if (this.hasLoadedCloudSession && this.currentSession.antraege) {
      const oldCustomIds = new Set(
        (this.currentSession.antraege || [])
          .filter((a) => !a.isPreFab && a.id.startsWith('antrag_custom_'))
          .map((a) => a.id)
      );
      merged.antraege
        .filter((a) => !a.isPreFab && a.id.startsWith('antrag_custom_'))
        .forEach((newCustom) => {
          if (!oldCustomIds.has(newCustom.id)) {
            this.triggerNotification({
              id: `submit_${newCustom.id}`,
              title: '📝 Neuer Nebenantrag eingereicht',
              message: `${newCustom.author} hat einen neuen Antrag eingereicht: "${newCustom.title}"`,
              type: 'motion',
              timestamp: new Date().toISOString(),
              antragId: newCustom.id,
            });
          }
        });
    }

    // 4. Plenum Decision diffen: Wurde ein Antrag als ANGENOMMEN oder ABGELEHNT gekennzeichnet?
    if (this.hasLoadedCloudSession && this.currentSession.antraege) {
      merged.antraege.forEach((newA) => {
        if (newA.plenumResult) {
          const oldA = this.currentSession.antraege?.find((a) => a.id === newA.id);
          if (!oldA || oldA.plenumResult !== newA.plenumResult) {
            this.triggerNotification({
              id: `decision_${newA.id}_${newA.plenumResult}`,
              title: newA.plenumResult === 'ANGENOMMEN' ? '🎉 Antrag angenommen!' : '❌ Antrag abgelehnt',
              message: `Antrag "${newA.title}" wurde vom Plenum ${newA.plenumResult === 'ANGENOMMEN' ? 'angenommen' : 'abgelehnt'}.`,
              type: newA.plenumResult === 'ANGENOMMEN' ? 'vote' : 'system',
              timestamp: new Date().toISOString(),
              antragId: newA.id,
            });
          }
        }
      });
    }

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

  public setAppState(payload: any, forceOverwrite = false) {
    if (!payload) return;
    this.applyCloudSession(payload as SipSession, forceOverwrite);
  }

  public init(settings: AppSettings) {
    this.cachedSettings = settings;

    const hasActiveSession =
      this.isInitialized ||
      this.hasLoadedCloudSession ||
      (this.currentSession &&
        (this.currentSession.id !== DEFAULT_SIP_SESSION.id ||
          this.currentSession.updatedAt !== DEFAULT_SIP_SESSION.updatedAt));

    // 1. Blinden Reset auf DEFAULT_SIP_SESSION unterbinden, sofern bereits eine Sitzung aktiv ist
    if (!hasActiveSession) {
      this.currentSession = DEFAULT_SIP_SESSION;
    }

    if (!this.isInitialized) {
      this.isInitialized = true;

      // 2. Verbinde mit Supabase Realtime
      this.setupSupabase(settings);

      // 3. Sofortiger Abruf aus Supabase (forceOverwrite = false)
      this.fetchFromSupabase(settings, false).catch(() => {});

      // 4. Schneller Sync-Takt alle 2 Sekunden zur garantierten Ausfallsicherheit (forceOverwrite = false)
      if (!this.syncInterval) {
        this.syncInterval = setInterval(() => {
          this.fetchFromSupabase(this.cachedSettings || settings, false).catch(() => {});
        }, 2000);
      }
    }
  }

  public setupSupabase(settings: AppSettings) {
    const client = getSupabaseClient(settings);
    if (!client) return;

    if (this.supabaseChannel) {
      client.removeChannel(this.supabaseChannel);
    }

    try {
      this.supabaseChannel = client
        .channel('sip-live-updates')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sip_state' },
          (payload) => {
            const newRow = payload.new as any;
            if (newRow && (!newRow.id || newRow.id === 'current_session') && newRow.payload) {
              this.setAppState(newRow.payload, false);
            }
          }
        )
        .on('broadcast', { event: 'sip_event' }, (payload) => {
          if (payload && payload.payload) {
            this.handleIncomingMessage(payload.payload as SipRealtimeMessage);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[SiP Realtime] Connected to live channel on table: sip_state');
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
    const sig = notif.id || `${notif.type}_${notif.title}_${notif.message}`;
    const now = Date.now();
    const lastTriggered = this.recentNotificationSignatures.get(sig);
    if (lastTriggered && now - lastTriggered < 8000) {
      // Duplikat innerhalb von 8 Sekunden ignorieren
      return;
    }
    this.recentNotificationSignatures.set(sig, now);

    if (this.recentNotificationSignatures.size > 100) {
      this.recentNotificationSignatures.forEach((time, k) => {
        if (now - time > 30000) this.recentNotificationSignatures.delete(k);
      });
    }

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

  private broadcastMessage(msg: SipRealtimeMessage, _settings?: AppSettings) {
    // 1. Lokaler Broadcast
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(msg);
      } catch {}
    }

    // 2. Supabase Realtime Broadcast (mit kompaktem Payload falls STATE_SYNC um 64KB Limit einzuhalten)
    // KEIN un-awaiteter syncSessionToSupabase-Aufruf hier drin!
    if (this.supabaseChannel) {
      try {
        let payloadToSend = msg;
        if (msg.type === 'STATE_SYNC' && msg.session) {
          payloadToSend = {
            type: 'STATE_SYNC',
            session: this.toCompactSession(msg.session),
          };
        }
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'sip_event',
          payload: payloadToSend,
        });
      } catch {}
    }
  }

  private handleIncomingMessage(msg: SipRealtimeMessage) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'STATE_SYNC':
        if (msg.session && (!this.currentSession || msg.session.updatedAt > this.currentSession.updatedAt)) {
          this.applyCloudSession(msg.session, false);
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
            updatedAt: this.nextTimestamp(),
            updatedBy: 'Strategieführung',
            isPublished: false,
          },
          antraege: this.currentSession.antraege.map((a) => ({
            ...a,
            isActive: a.id === msg.antragId,
          })),
          updatedAt: this.nextTimestamp(),
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
          updatedAt: this.nextTimestamp(),
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
          updatedAt: this.nextTimestamp(),
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
          updatedAt: this.nextTimestamp(),
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
            updatedAt: this.nextTimestamp(),
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
          updatedAt: this.nextTimestamp(),
        };
        this.notify();
        break;
      }

      case 'ANTRAG_DECIDED': {
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antragId
              ? { ...a, plenumResult: msg.decision, plenumResultAt: msg.decidedAt }
              : a
          ),
          updatedAt:
            msg.decidedAt && msg.decidedAt > this.currentSession.updatedAt
              ? msg.decidedAt
              : this.nextTimestamp(),
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
            updatedAt: this.nextTimestamp(),
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
    this.lastLocalMutationAt = Date.now();
    const antrag = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!antrag) return;

    this.logActivity({
      action: 'ANTRAG_ACTIVATED',
      antragId,
      antragTitle: antrag.title,
      performedBy: 'Strategieführung',
      details: `Antrag "${antrag.title}" im Plenum aufgerufen`,
    });

    const ts = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      activeAntragId: antragId,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: this.currentSession.antraege.map((a) => {
        if (a.type === 'ENDE_DEBATTE' || a.type === 'ENDE_REDNER') {
          return {
            ...a,
            isActive: false,
            claimedBy: null,
            claimedAt: null,
          };
        }
        return {
          ...a,
          isActive: a.id === antragId,
        };
      }),
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'NEW_ACTIVE_ANTRAG',
      antragId,
      antrag,
    };
    this.broadcastMessage(msg, settings);

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Strategieführung beendet den aktuellen Aufruf (Pause / Zwischenabstimmung)
   */
  public async clearActiveAntrag(settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.logActivity({
      action: 'ANTRAG_CLEARED',
      performedBy: 'Strategieführung',
      details: 'Aufruf im Plenum beendet (Pause)',
    });

    const ts = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      activeAntragId: null,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: this.currentSession.antraege.map((a) => ({
        ...a,
        isActive: false,
      })),
      updatedAt: ts,
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
   * Antrag als ANGENOMMEN oder ABGELEHNT kennzeichnen
   */
  public async decideAntrag(
    antragId: string,
    decision: 'ANGENOMMEN' | 'ABGELEHNT',
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const decidedAt = this.nextTimestamp();
    const antrag = this.currentSession.antraege.find((a) => a.id === antragId);

    this.logActivity({
      action: 'ANTRAG_DECIDED',
      antragId,
      antragTitle: antrag?.title || antragId,
      performedBy: 'Strategieführung',
      details: `Antrag "${antrag?.title || antragId}" wurde als ${decision} markiert.`,
    });

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId
          ? { ...a, plenumResult: decision, plenumResultAt: decidedAt }
          : a
      ),
      updatedAt: decidedAt,
    };
    this.saveToStorage();
    this.notify();

    this.triggerNotification({
      id: `decision_${antragId}_${decision}`,
      title: decision === 'ANGENOMMEN' ? '🎉 Antrag angenommen!' : '❌ Antrag abgelehnt',
      message: `Antrag "${antrag?.title || antragId}" wurde vom Plenum ${decision === 'ANGENOMMEN' ? 'angenommen' : 'abgelehnt'}.`,
      type: decision === 'ANGENOMMEN' ? 'vote' : 'system',
      timestamp: decidedAt,
      antragId,
    });

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_DECIDED',
      antragId,
      decision,
      decidedAt,
    };
    this.broadcastMessage(msg, settings);

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Abstimmungsempfehlung zentral pushen
   */
  public async setVoteRecommendation(
    rec: Omit<VoteRecommendation, 'updatedAt'>,
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    const fullRec: VoteRecommendation = {
      ...rec,
      isPublished: rec.isPublished ?? true,
      updatedAt: ts,
    };

    this.logActivity({
      action: 'VOTE_REC_SET',
      performedBy: fullRec.updatedBy || 'Strategieführung',
      details: `Offizielle Abstimmungsempfehlung geändert: ${fullRec.type}${fullRec.note ? ` (${fullRec.note})` : ''}`,
    });

    this.currentSession = {
      ...this.currentSession,
      voteRecommendation: fullRec,
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    if (fullRec.isPublished && fullRec.type !== 'KEINE') {
      this.triggerNotification({
        id: `notif_${Date.now()}`,
        title: '📢 Offizielle Abstimmungsempfehlung!',
        message: `Empfehlung: ${fullRec.type}${fullRec.note ? ` – ${fullRec.note}` : ''}`,
        type: 'vote',
        timestamp: ts,
      });
    }

    const msg: SipRealtimeMessage = {
      type: 'VOTE_REC_CHANGED',
      recommendation: fullRec,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Ein Mitglied oder die Strategieführung claimt einen Antrag
   */
  public async claimAntrag(antragId: string, memberName: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!target) return;

    this.logActivity({
      action: 'ANTRAG_CLAIMED',
      antragId,
      antragTitle: target.title,
      performedBy: memberName,
      details: `${memberName} hat Rede geclaimed: "${target.title}"`,
    });

    const claimedAt = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: memberName, claimedAt } : a
      ),
      updatedAt: claimedAt,
    };
    this.saveToStorage();
    this.notify();

    // Lokaler Toast sofort für den Nutzer
    this.triggerNotification({
      id: `notif_${Date.now()}`,
      title: '📢 Antrag geclaimed!',
      message: `${memberName} hat "${target.title}" geclaimed.`,
      type: 'claim',
      timestamp: claimedAt,
      antragId,
    });

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_CLAIMED',
      antragId,
      antragTitle: target.title,
      claimedBy: memberName,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Claim zurückziehen
   */
  public async unclaimAntrag(antragId: string, memberName: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
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
      updatedAt: this.nextTimestamp(),
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
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Neues Mitglied reicht eigenen Antrag ein (wartet auf Strategieführung)
   */
  public submitCustomAntrag(
    antragData: Omit<SipAntrag, 'id' | 'isPreFab' | 'status' | 'createdAt'>,
    settings?: AppSettings
  ): SipAntrag {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    const newAntrag: SipAntrag = {
      ...antragData,
      id: `antrag_custom_${Date.now()}`,
      isPreFab: false,
      status: 'pending_approval',
      createdAt: ts,
      claimedBy: antragData.author, // automatisch geclaimed vom Verfasser
      claimedAt: ts,
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
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_SUBMITTED',
      antrag: newAntrag,
    };
    this.broadcastMessage(msg, settings);
    void this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);

    return newAntrag;
  }

  /**
   * Strategieführung genehmigt oder überarbeitet einen Antrag
   */
  public async updateOrApproveAntrag(
    antragId: string,
    updates: Partial<SipAntrag>,
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    let updatedObj: SipAntrag | null = null;
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) => {
        if (a.id === antragId) {
          updatedObj = { ...a, ...updates, updatedAt: ts } as SipAntrag;
          return updatedObj;
        }
        return a;
      }),
      updatedAt: ts,
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
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Löscht einen Antrag
   */
  public async deleteAntrag(antragId: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
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
      updatedAt: this.nextTimestamp(),
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
   * Archiviert die aktuelle Sitzung und leert alle Kategorien (Anträge, Notizen, Memes, Drive)
   */
  public async archiveAndClearCurrentSession(settings?: AppSettings): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    const oldSession = { ...this.currentSession };
    await archiveCurrentSession(oldSession, 'Strategieführung', settings || this.cachedSettings || undefined);

    const ts = this.nextTimestamp();
    this.currentSession = {
      id: `session_${Date.now()}`,
      title: `${oldSession.title} (Archiviert)`,
      driveFolderUrl: '',
      strategyNotes: '',
      activeAntragId: null,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: [],
      memes: [],
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: ts,
          performedBy: 'Strategieführung',
          action: 'SESSION_ARCHIVED',
          details: `Sitzung "${oldSession.title}" wurde archiviert. Alle Kategorien wurden für das Plenum geleert.`,
        },
      ],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    this.broadcastMessage({ type: 'STATE_SYNC', session: this.currentSession }, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Startet ein neues SiP mit gewähltem Namen und Google Drive Ordner.
   * Archiviert das vorherige SiP automatisch, falls es noch nicht archiviert wurde.
   * Unterstützt die direkte Übernahme automatisch importierter Haupt- und Nebenanträge.
   */
  public async startNewSession(
    options: {
      title: string;
      driveFolderUrl?: string;
      skipArchive?: boolean;
      antraege?: SipAntrag[];
      strategyNotes?: string;
    },
    settings?: AppSettings
  ): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    const oldSession = { ...this.currentSession };

    // Wenn das vorherige SiP noch nicht archiviert wurde und Inhalte hatte: Jetzt archivieren
    if (!options.skipArchive && (oldSession.antraege.length > 0 || (oldSession.activityLog || []).length > 1)) {
      await archiveCurrentSession(oldSession, 'Strategieführung', settings || this.cachedSettings || undefined);
    }

    const initialAntraege = (options.antraege || []).map((a) => ({
      ...a,
      isPreFab: false,
    }));
    const hauptCount = initialAntraege.filter((a) => a.type === 'HAUPTANTRAG').length;
    const subCount = initialAntraege.filter((a) => a.type !== 'HAUPTANTRAG').length;
    const ts = this.nextTimestamp();

    this.currentSession = {
      id: `session_${Date.now()}`,
      title: options.title.trim() || 'Neues Schüler:innenparlament (SiP)',
      driveFolderUrl: (options.driveFolderUrl || '').trim(),
      strategyNotes: options.strategyNotes || '',
      activeAntragId: null,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: initialAntraege,
      memes: [],
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: ts,
          performedBy: 'Strategieführung',
          action: 'SESSION_ARCHIVED',
          details: `Neues SiP "${options.title.trim()}" gestartet.${
            initialAntraege.length > 0
              ? ` Automatischer Import: ${hauptCount} Hauptanträge und ${subCount} Nebenanträge synchronisiert.`
              : ' Kategorien geleert.'
          } Drive-Ordner: ${options.driveFolderUrl?.trim() || 'noch keiner hinterlegt'}.`,
        },
      ],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    this.broadcastMessage({ type: 'STATE_SYNC', session: this.currentSession }, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Importiert automatisch kombinierte Anträge und Strategie in die bestehende Sitzung
   */
  public async importCombinedAntraegeAndStrategy(
    antraege: SipAntrag[],
    strategyNotes?: string,
    settings?: AppSettings
  ): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    const normalizedInput = antraege.map((a) => ({ ...a, isPreFab: false }));
    const hauptantraege = normalizedInput.filter((a) => a.type === 'HAUPTANTRAG');
    const nebenantraege = normalizedInput.filter((a) => a.type !== 'HAUPTANTRAG');
    const hauptCount = hauptantraege.length;
    const subCount = nebenantraege.length;

    // Wenn ein kompletter Satz (mit Hauptanträgen) importiert wird, ersetze vorherige PreFab-Anträge sauber durch finalMotions
    const finalMotions =
      hauptCount > 0
        ? [...hauptantraege, ...nebenantraege]
        : [...this.currentSession.antraege, ...normalizedInput];

    if (hauptCount > 0) {
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );
    }

    const ts = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      id:
        this.currentSession.id === 'sip_current_session'
          ? `session_${Date.now()}`
          : this.currentSession.id,
      antraege: finalMotions,
      strategyNotes: strategyNotes
        ? this.currentSession.strategyNotes && hauptCount === 0
          ? `${this.currentSession.strategyNotes}\n\n${strategyNotes}`
          : strategyNotes
        : this.currentSession.strategyNotes,
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: ts,
          performedBy: 'Strategieführung',
          action: 'ANTRAG_IMPORTED',
          details: `Automatischer SiP-Import: ${hauptCount} Hauptanträge und ${subCount} Nebenanträge erfolgreich synchronisiert.`,
        },
        ...(this.currentSession.activityLog || []),
      ],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    this.broadcastMessage({ type: 'STATE_SYNC', session: this.currentSession }, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Löscht ein Meme aus dem Meme-Feed (durch Strategieführung)
   */
  public async deleteMeme(memeId: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      memes: this.currentSession.memes.filter((m) => m.id !== memeId),
      updatedAt: this.nextTimestamp(),
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
   * Batch-Import von vorgefertigten Anträgen aus Dokument
   */
  public async importAntraege(newAntraege: SipAntrag[], settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    const normalizedInput = newAntraege.map((a) => ({ ...a, isPreFab: false }));
    const hauptantraege = normalizedInput.filter((a) => a.type === 'HAUPTANTRAG');
    const nebenantraege = normalizedInput.filter((a) => a.type !== 'HAUPTANTRAG');

    const finalMotions =
      hauptantraege.length > 0
        ? [...hauptantraege, ...nebenantraege]
        : [...normalizedInput, ...this.currentSession.antraege];

    if (hauptantraege.length > 0) {
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );
    }

    this.currentSession = {
      ...this.currentSession,
      id:
        this.currentSession.id === 'sip_current_session'
          ? `session_${Date.now()}`
          : this.currentSession.id,
      antraege: finalMotions,
      updatedAt: this.nextTimestamp(),
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
   * Aktualisiert Strategie-Notizen
   */
  public async updateStrategyNotes(notes: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      strategyNotes: notes,
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Aktualisiert Google Drive Ordner Link oder SiP Titel
   */
  public async updateSessionMetadata(
    metadata: { title?: string; driveFolderUrl?: string },
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      ...metadata,
      updatedAt: this.nextTimestamp(),
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
   * Fügt ein Meme hinzu
   */
  public async addMeme(
    memeData: { author: string; imageUrl: string; caption: string },
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    const newMeme: SipMeme = {
      id: `meme_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      author: memeData.author,
      imageUrl: memeData.imageUrl,
      caption: memeData.caption,
      createdAt: ts,
      reactions: {},
    };

    this.currentSession = {
      ...this.currentSession,
      memes: [newMeme, ...this.currentSession.memes],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'MEME_ADDED',
      meme: newMeme,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  /**
   * Reagiert auf ein Meme mit einem Emoji
   */
  public async toggleMemeReaction(
    memeId: string,
    emoji: string,
    userName: string,
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
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
      updatedAt: this.nextTimestamp(),
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

  // --- SUPABASE PERSISTENCE ---

  public async fetchFromSupabase(settings?: AppSettings, forceOverwrite = false): Promise<SipSession | null> {
    // Guard: Wenn aktuell ein Sync läuft oder vor weniger als 2 Sekunden eine lokale Aktion durchgeführt wurde,
    // überspringe den Polling-Fetch
    if (this.isSyncingToSupabase || (!forceOverwrite && Date.now() - this.lastLocalMutationAt < 2000)) {
      return null;
    }

    const client = getSupabaseClient(settings || this.cachedSettings || undefined);
    if (!client) return null;

    try {
      // Direkter SELECT auf die Tabelle sip_state: supabase.from('sip_state').select('payload').eq('id', 'current_session').single()
      const { data, error } = await client
        .from('sip_state')
        .select('payload')
        .eq('id', 'current_session')
        .single();

      if (!error && data && data.payload) {
        this.setAppState(data.payload, false);
        return data.payload as SipSession;
      }
    } catch (err) {
      console.warn('Could not fetch SiP session from Supabase:', err);
    }
    return null;
  }

  /**
   * Zentraler, koordinierter Supabase-Upsert:
   * Verhindert parallele Out-of-Order-Requests durch eine Single-Flight-Queue.
   */
  public async syncSessionToSupabase(settings?: AppSettings, session?: SipSession): Promise<void> {
    const targetSession = session || this.currentSession;
    const targetSettings = settings || this.cachedSettings || undefined;
    this.lastLocalMutationAt = Date.now();

    if (this.isSyncingToSupabase) {
      this.pendingSyncSession = { settings: targetSettings, session: targetSession };
      return;
    }

    this.isSyncingToSupabase = true;
    let currentToSync: { settings?: AppSettings; session: SipSession } | null = {
      settings: targetSettings,
      session: targetSession,
    };

    try {
      while (currentToSync) {
        const { settings: s, session: newState } = currentToSync;
        this.pendingSyncSession = null;
        this.lastLocalMutationAt = Date.now();

        const client = getSupabaseClient(s || this.cachedSettings || undefined);
        if (client) {
          try {
            const { error } = await client.from('sip_state').upsert({
              id: 'current_session',
              payload: newState,
              updated_at: newState.updatedAt || new Date().toISOString(),
            });

            if (error) {
              console.error('[SiP Realtime] Error persisting session to Supabase:', error);
            }
          } catch (err) {
            console.warn('Could not persist SiP session to Supabase:', err);
          }
        }

        currentToSync = this.pendingSyncSession;
      }
    } finally {
      this.isSyncingToSupabase = false;
    }
  }
}

export const sipRealtime = new SipRealtimeService();
