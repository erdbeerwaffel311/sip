export type AntragType =
  | 'WM' // Wortmeldung
  | 'AAA' // Abänderungsantrag (AÄA / ÄA)
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
}

export interface SipAntrag {
  id: string;
  type: AntragType;
  title: string;
  content: string;
  lineOrParagraph?: string; // z.B. "Zeile 45-48" oder "§ 3 Abs. 2"
  author: string;
  isPreFab: boolean; // Vorgefertigt aus Dokument vs. selbst eingereicht
  status: 'pending_approval' | 'approved' | 'rejected' | 'completed';
  claimedBy?: string | null;
  claimedAt?: string | null;
  isActive?: boolean; // Aktuell im Plenum aufgerufen
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
  WM: {
    label: 'Wortmeldung',
    shortLabel: 'WM',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    description: 'Allgemeine Wortmeldung zur laufenden Debatte',
  },
  AAA: {
    label: 'Abänderungsantrag',
    shortLabel: 'AÄA / ÄA',
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
  title: 'Schüler:innenparlament (SiP) 2026',
  driveFolderUrl: 'https://drive.google.com/drive/folders/demo-sip-2026',
  strategyNotes: `### 🎯 Strategie-Leitfaden für das Schüler:innenparlament
- **Fokus 1:** Bildungsinnovation & digitale Infrastruktur an Schulen
- **Fokus 2:** Schüler:innenvertretungs-Rechte stärken
- **Taktik bei Gegenanträgen:** Zuerst Wortmeldung (WM) zur sachlichen Richtigstellung, danach bei Bedarf Streichungsantrag (SA) auf die kritischen Passagen.
- **Redner:innen-Pool:** Anträge rechtzeitig claimen, damit keine Doppelbelegung entsteht!`,
  activeAntragId: 'antrag_demo_1',
  voteRecommendation: {
    type: 'JA',
    note: 'Wichtiger Initiativantrag für die Stärkung der Schüler:innenrechte – geschlossen mit JA stimmen!',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Strategieführung',
  },
  antraege: [
    {
      id: 'antrag_demo_1',
      type: 'AAA',
      title: 'AÄA zu TOP 3: Digitale Lernmittel & Gerätefreiheit',
      content: 'In Zeile 45-50 soll "nur schulische Endgeräte" ersetzt werden durch "eine freie Wahl zwischen schulischen und geprüften privaten Endgeräten (BYOD)".',
      lineOrParagraph: 'Zeile 45-50',
      author: 'Vorgefertigt (aus SiP-Unterlagen)',
      isPreFab: true,
      status: 'approved',
      claimedBy: null,
      claimedAt: null,
      isActive: true,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'antrag_demo_2',
      type: 'EA',
      title: 'EA zu TOP 4: Mental Health Tage für Schüler:innen',
      content: 'Ergänzung um § 4b: Schulen sollen pro Semester bis zu zwei flexible Entlastungstage zur psychosozialen Prävention ermöglichen.',
      lineOrParagraph: 'Neu: § 4b',
      author: 'Vorgefertigt (aus SiP-Unterlagen)',
      isPreFab: true,
      status: 'approved',
      claimedBy: 'Simon Märker',
      claimedAt: new Date(Date.now() - 1800000).toISOString(),
      isActive: false,
      createdAt: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      id: 'antrag_demo_3',
      type: 'ENDE_DEBATTE',
      title: 'Antrag auf Ende der Debatte zu TOP 2',
      content: 'Die Debatte dreht sich im Kreis. Antrag auf sofortigen Übergang zur Abstimmung.',
      author: 'Vorgefertigt',
      isPreFab: true,
      status: 'approved',
      claimedBy: null,
      claimedAt: null,
      isActive: false,
      createdAt: new Date(Date.now() - 2500000).toISOString(),
    },
    {
      id: 'antrag_demo_4',
      type: 'WM',
      title: 'WM zu Budgetantrag: Klarstellung Fördertöpfe',
      content: 'Wortmeldung zur Verdeutlichung, dass die Budgets direkt an die Schulgemeinschaftsausschüsse fließen müssen.',
      author: 'Vorgefertigt',
      isPreFab: true,
      status: 'approved',
      claimedBy: null,
      claimedAt: null,
      isActive: false,
      createdAt: new Date(Date.now() - 2000000).toISOString(),
    },
  ],
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
