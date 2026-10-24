import { REAL_SIP_ANTRAEGE, REAL_SIP_STRATEGY_NOTES } from './realSipData';

export type AntragType =
  | 'HAUPTANTRAG' // Hauptantrag (Beschlussantrag im Plenum)
  | 'WM' // Wortmeldung
  | 'AAA' // Abänderungsantrag (ÄA)
  | 'EA' // Erweiterungsantrag
  | 'SA' // Streichungsantrag
  | 'ENDE_DEBATTE' // Antrag auf Ende der Debatte
  | 'ENDE_REDNER' // Antrag auf Ende der Redner:innenliste
  | 'SONSTIGES'; // Sonstiger Antrag / Geschäftsordnungsantrag

export type VoteType = 'JA' | 'NEIN' | 'ENTHALTUNG' | 'FREI' | 'KEINE';

export interface VoteRecommendation {
  type: VoteType;
  note: string;
  updatedAt: string;
  updatedBy: string;
  isPublished?: boolean; // Ob die Strategieführung diese Empfehlung im Plenum an alle freigegeben hat
}

export interface SipAntrag {
  id: string;
  type: AntragType;
  title: string;
  content: string;
  rede?: string; // Vorbereitete Rede aus den SiP-Unterlagen
  forderungspunkte?: string[]; // Konkrete Forderungspunkte des Antrags
  lineOrParagraph?: string; // z.B. "Antrag 1" oder "Zeile 45-48"
  author: string;
  isPreFab: boolean; // Vorgefertigt aus Dokument vs. selbst eingereicht
  status: 'pending_approval' | 'approved' | 'rejected' | 'completed';
  isEditedByAdmin?: boolean; // Von der Strategieführung angepasst / korrigiert
  claimedBy?: string | null;
  claimedAt?: string | null;
  isActive?: boolean; // Aktuell im Plenum aufgerufen
  parentAntragId?: string; // Verknüpfung zu übergeordnetem Antrag
  createdAt: string;
  approvedAt?: string;
  adminNotes?: string;
}

export interface SipMemeReaction {
  emoji: string;
  users: string[];
}

export interface SipMeme {
  id: string;
  author: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
  reactions: Record<string, string[]>; // emoji -> array of usernames
}

export interface SipSession {
  id: string;
  title: string;
  driveFolderUrl: string;
  strategyNotes: string;
  activeAntragId: string | null;
  voteRecommendation: VoteRecommendation;
  antraege: SipAntrag[];
  memes: SipMeme[];
  updatedAt: string;
}

export interface SipNotification {
  id: string;
  title: string;
  message: string;
  type: 'claim' | 'motion' | 'vote' | 'system';
  timestamp: string;
  antragId?: string;
}

export const ANTRAG_TYPE_CONFIG: Record<
  AntragType,
  { label: string; shortLabel: string; badgeColor: string; description: string }
> = {
  HAUPTANTRAG: {
    label: 'Hauptantrag',
    shortLabel: 'Hauptantrag',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    description: 'Offizieller Hauptantrag / Beschlussantrag im Plenum',
  },
  WM: {
    label: 'Wortmeldung',
    shortLabel: 'WM',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    description: 'Allgemeine Wortmeldung zur laufenden Debatte',
  },
  AAA: {
    label: 'Abänderungsantrag',
    shortLabel: 'ÄA',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Änderung an einer bestimmten Textpassage / Zeile',
  },
  EA: {
    label: 'Erweiterungsantrag',
    shortLabel: 'EA',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Ergänzung eines neuen Punktes oder Absatzes',
  },
  SA: {
    label: 'Streichungsantrag',
    shortLabel: 'SA',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    description: 'Vollständige Streichung eines Absatzes oder Satzes',
  },
  ENDE_DEBATTE: {
    label: 'Antrag auf Ende der Debatte',
    shortLabel: 'Ende Debatte',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Sofortige Beendigung der Debatte zur Abstimmung',
  },
  ENDE_REDNER: {
    label: 'Antrag auf Ende der Redner:innenliste',
    shortLabel: 'Schluss Redner:innen',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Schließung der Redeliste, nur noch eingetragene Redner:innen',
  },
  SONSTIGES: {
    label: 'Sonstiger Antrag / GO-Antrag',
    shortLabel: 'GO / Sonst.',
    badgeColor: 'bg-slate-700 text-slate-300 border-slate-600',
    description: 'Geschäftsordnungsantrag oder sonstiger Antrag',
  },
};

export const DEFAULT_SIP_SESSION: SipSession = {
  id: 'sip_current_session',
  title: '2. Schüler:innenparlament (SiP) 2024/25',
  driveFolderUrl: 'https://drive.google.com/drive/folders/1srawS_1c9GZCqDCDuUUPhU_02FPttxi-?usp=share_link',
  strategyNotes: REAL_SIP_STRATEGY_NOTES,
  activeAntragId: 'antrag_1',
  voteRecommendation: {
    type: 'KEINE',
    note: '',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Strategieführung',
    isPublished: false,
  },
  antraege: REAL_SIP_ANTRAEGE,
  memes: [
    {
      id: 'meme_1',
      author: 'Strategieführung',
      imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
      caption: 'Wenn der Antrag auf Ende der Debatte endlich durchgeht nach 3 Stunden Diskussion ☕️',
      createdAt: new Date(Date.now() - 2400000).toISOString(),
      reactions: {
        '😂': ['Simon Märker', 'Celil-Kaan Beler'],
        '🔥': ['Strategieführung'],
      },
    },
  ],
  updatedAt: new Date().toISOString(),
};
