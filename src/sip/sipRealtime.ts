import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  DEFAULT_SIP_SESSION,
  SipAntrag,
  SipMeme,
  SipNotification,
  SipSession,
  VoteRecommendation,
} from './types';
import { AppSettings } from '../types';
import { getSupabaseClient } from '../utils/supabaseSync';

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

  public init(settings: AppSettings) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Lade gespeicherte Session aus LocalStorage
    try {
      const saved = localStorage.getItem(SIP_STORAGE_KEY);
      if (saved) {
        this.currentSession = { ...DEFAULT_SIP_SESSION, ...JSON.parse(saved) };
      }
    } catch {
      this.currentSession = DEFAULT_SIP_SESSION;
    }

    // Verbinde mit Supabase Realtime
    this.setupSupabase(settings);

    // Versuche neuesten Stand aus Supabase abzurufen
    this.fetchFromSupabase(settings).catch(() => {});
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
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Nach erfolgreichem Join Zustand teilen
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

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.currentSession);
      } catch (err) {
        console.error('Error in session listener:', err);
      }
    });
    try {
      localStorage.setItem(SIP_STORAGE_KEY, JSON.stringify(this.currentSession));
    } catch {}
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
    if (settings) {
      this.syncSessionToSupabase(settings, this.currentSession).catch(() => {});
    }
  }

  private handleIncomingMessage(msg: SipRealtimeMessage) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'STATE_SYNC':
        if (msg.session && msg.session.updatedAt > this.currentSession.updatedAt) {
          this.currentSession = msg.session;
          this.notify();
        }
        break;

      case 'NEW_ACTIVE_ANTRAG': {
        this.currentSession = {
          ...this.currentSession,
          activeAntragId: msg.antragId,
          antraege: this.currentSession.antraege.map((a) => ({
            ...a,
            isActive: a.id === msg.antragId,
          })),
          updatedAt: new Date().toISOString(),
        };
        this.notify();
        this.triggerBlurPopup(msg.antrag);
        this.triggerNotification({
          id: `notif_${Date.now()}`,
          title: '🚨 Neuer Antrag aufgerufen!',
          message: `${msg.antrag.title} wird jetzt im Parlament verhandelt.`,
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

  // --- ACTIONS ---

  /**
   * Strategieführung ruft einen neuen Antrag auf (ploppt auf allen Geräten auf!)
   */
  public activateAntrag(antragId: string, settings?: AppSettings) {
    const antrag = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!antrag) return;

    this.currentSession = {
      ...this.currentSession,
      activeAntragId: antragId,
      antraege: this.currentSession.antraege.map((a) => ({
        ...a,
        isActive: a.id === antragId,
      })),
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'NEW_ACTIVE_ANTRAG',
      antragId,
      antrag,
    };
    this.broadcastMessage(msg, settings);
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
      updatedAt: new Date().toISOString(),
    };
    this.currentSession = {
      ...this.currentSession,
      voteRecommendation: fullRec,
      updatedAt: new Date().toISOString(),
    };
    this.notify();

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

    const claimedAt = new Date().toISOString();
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: memberName, claimedAt } : a
      ),
      updatedAt: new Date().toISOString(),
    };
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

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: null, claimedAt: null } : a
      ),
      updatedAt: new Date().toISOString(),
    };
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

    this.currentSession = {
      ...this.currentSession,
      antraege: [newAntrag, ...this.currentSession.antraege],
      updatedAt: new Date().toISOString(),
    };
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
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.filter((a) => a.id !== antragId),
      activeAntragId:
        this.currentSession.activeAntragId === antragId
          ? null
          : this.currentSession.activeAntragId,
      updatedAt: new Date().toISOString(),
    };
    this.notify();

    if (settings) {
      this.syncSessionToSupabase(settings, this.currentSession).catch(() => {});
    }
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

  private async fetchFromSupabase(settings: AppSettings) {
    const client = getSupabaseClient(settings);
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
        if (cloudSession && (!this.currentSession || cloudSession.updatedAt >= this.currentSession.updatedAt)) {
          this.currentSession = cloudSession;
          this.notify();
        }
      }
    } catch (err) {
      console.warn('Could not fetch SiP session from Supabase:', err);
    }
  }

  public async syncSessionToSupabase(settings: AppSettings, session: SipSession) {
    const client = getSupabaseClient(settings);
    if (!client) return;

    try {
      await client.from('keller_items').upsert({
        id: SIP_DB_ROW_ID,
        name: `SiP Session: ${session.title}`,
        category: '__sip_system__',
        quantity: 1,
        updated_at: new Date().toISOString(),
        payload: session,
      });
    } catch (err) {
      console.warn('Could not persist SiP session to Supabase:', err);
    }
  }
}

export const sipRealtime = new SipRealtimeService();
