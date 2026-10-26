import { AntragType, SipAntrag } from '../types';
import { extractTextFromPdfArrayBuffer } from './pdfHelper';
import { extractTextFromDocxArrayBuffer } from './docxHelper';

export interface ParsedHauptAntrag {
  index: number;
  rawTitle: string;
  cleanTitle: string;
  author: string;
  lineOrParagraph?: string;
  content: string;
  forderungspunkte: string[];
}

export interface ParsedSubAntrag {
  type: AntragType;
  title: string;
  content: string;
  lineOrParagraph?: string;
  claimedBy?: string;
  author?: string;
}

export interface ParsedStrategieSection {
  motionTitle: string;
  subAntraege: ParsedSubAntrag[];
  notes?: string;
}

export interface AutoImportResult {
  success: boolean;
  message: string;
  antraege: SipAntrag[];
  strategyNotes: string;
  summary: {
    hauptAntraegeCount: number;
    subAntraegeCount: number;
    matchedSectionsCount: number;
    goExcluded: boolean;
  };
}

/**
 * Normalisiert Antragstitel für den intelligenten Abgleich zwischen
 * SiP-Antragsmappe und Strategie-Dokument.
 */
export function normalizeTitleForMatching(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    // Entferne Antragsnummern ("Antrag 1:", "Top 2.", "1. ", etc.)
    .replace(/^(?:antrag|top)?\s*\d+[\.:\-]\s*/gi, '')
    // Entferne Präfix-Tags wie "[BS]" oder "[Gymnasium]"
    .replace(/^\[[a-zäöü\s-]+\][:\s-]*/gi, '')
    // Entferne Dateierweiterungen oder Suffixe wie "_Jodok Burtscher"
    .replace(/\.pdf$|\.docx$/i, '')
    .replace(/[_–-]\s*[a-zäöüß\s.]+$/gi, '')
    .replace(/\([^)]+\)$/g, '')
    // Vereinheitliche Anführungszeichen, Bindestriche & Satzzeichen
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[.,:;!?'"„“()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prüft, ob zwei Titel (Antragsmappe vs. Strategie) zum selben Hauptantrag gehören.
 */
export function isTitleMatching(titleA: string, titleB: string): boolean {
  const normA = normalizeTitleForMatching(titleA);
  const normB = normalizeTitleForMatching(titleB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Wort-Überlappung (Jaccard-Ähnlichkeit bei signifikanten Wörtern >= 3 Zeichen)
  const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }

  const similarity = common / Math.min(wordsA.size, wordsB.size);
  return similarity >= 0.5;
}

/**
 * Extrahiert alle Hauptanträge aus dem Text der SiP-Antragsmappe.
 * Am Schluss befindliche Abschnitte zur Geschäftsordnung (GO) werden
 * automatisch erkannt und ignoriert.
 */
export function parseAntragsmappeText(rawText: string): {
  hauptAntraege: ParsedHauptAntrag[];
  goExcluded: boolean;
} {
  if (!rawText || !rawText.trim()) {
    return { hauptAntraege: [], goExcluded: false };
  }

  // 1. Geschäftsordnung am Schluss der Antragsmappe erkennen und abschneiden
  // Regel: Am Schluss der SiP Antragsmappe findest du die Geschäftsordnung. Diese kommt NICHT in das Programm.
  const goRegex = /(?:(?:\r?\n){1,3}\s*(?:anhang\s*:?\s*)?geschäftsordnung(?:\s+des\s+vorarlberger\s+schüler:?innenparlaments)?|\bgeschäftsordnung\s*\(go\)\s*(?:\r?\n))/i;
  const goMatch = rawText.match(goRegex);
  let cleanText = rawText;
  let goExcluded = false;

  if (goMatch && typeof goMatch.index === 'number' && goMatch.index > 500) {
    cleanText = rawText.slice(0, goMatch.index);
    goExcluded = true;
  }

  // 2. Zerlege in Antragsblöcke (z.B. "Antrag 1:", "Antrag 2:", "TOP 1", etc.)
  let rawBlocks: string[] = [];
  const primaryRegex = /(?=(?:^|\r?\n)(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?)\s*)/gi;
  const primarySplit = cleanText.split(primaryRegex).map((b) => b.trim()).filter((b) => b.length > 15);

  if (primarySplit.length > 1) {
    rawBlocks = primarySplit;
  } else {
    // Fallback falls Anträge als "1. Titel" formatiert sind
    const fallbackRegex = /(?=(?:^|\r?\n)\d{1,2}\.\s+[A-ZÄÖÜ][^\r\n]{3,80}(?:\r?\n)+[^\r\n]*(?:antragsteller|schule|antragstext|daher fordert))/gi;
    const fallbackSplit = cleanText.split(fallbackRegex).map((b) => b.trim()).filter((b) => b.length > 15);
    rawBlocks = fallbackSplit.length > 1 ? fallbackSplit : primarySplit;
  }

  const hauptAntraege: ParsedHauptAntrag[] = [];
  let counter = 1;

  for (const block of rawBlocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];

    // Ignoriere Deckblatt, Inhaltsverzeichnisse oder GO-Titel
    if (
      /inhaltsverzeichnis|geschäftsordnung|antragsmappe/i.test(firstLine) ||
      (!/^(?:haupt)?antrag\s*\d+|top\s*\d+/i.test(firstLine) && !/antragstext|daher fordert/i.test(block))
    ) {
      continue;
    }

    // Antragsnummer ermitteln
    const numMatch = firstLine.match(/\b(?:(?:haupt)?antrag|top)\s*(\d{1,2})\b/i);
    const motionNum = numMatch ? parseInt(numMatch[1], 10) : counter;
    const lineOrParagraph = `Antrag ${motionNum}`;

    // Titel ermitteln
    const rawTitle = firstLine;
    let cleanTitle = firstLine.replace(/^(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?|\d{1,2}\.\s*)/i, '').trim();
    if (!cleanTitle && lines.length > 1) {
      cleanTitle = lines[1];
    }
    if (!cleanTitle) {
      cleanTitle = `Antrag ${motionNum}`;
    }

    // Wenn der Titel sehr kurz ist und die zweite Zeile mehr Details hat
    if (cleanTitle.length < 5 && lines.length > 1 && !/antragsteller|schule/i.test(lines[1])) {
      cleanTitle = lines[1];
    }

    // Antragsteller:in ermitteln
    let author = 'Schüler:innenparlament';
    const authorMatch = block.match(/(?:antragsteller(?::?innen|:?in)?|eingereicht\s*von|autor(?::?in)?)\s*[:\-]\s*([^\r\n,]+)/i);
    if (authorMatch) {
      author = authorMatch[1].replace(/^[^\wÄÖÜäöüß]+/, '').trim();
    } else {
      // Suche nach typischen Namen im Kopf
      const authorLine = lines.find((l) => /^[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+(?:\s*\([^)]+\))?$/.test(l));
      if (authorLine && authorLine !== cleanTitle) {
        author = authorLine;
      }
    }

    // Forderungspunkte extrahieren ("Daher fordert das Vorarlberger Schüler:innenparlament")
    const forderungspunkte: string[] = [];
    const forderungIndex = block.search(/(?:daher\s+fordert\s+(?:das\s+)?(?:vorarlberger\s+)?schüler:?innenparlament|schüler:?innenparlament\s+fordert|fordert\s*:)/i);

    let content = block;
    if (forderungIndex !== -1) {
      content = block.slice(0, forderungIndex).trim();
      const afterForderung = block.slice(forderungIndex);
      const fpLines = afterForderung.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      for (let i = 1; i < fpLines.length; i++) {
        const fpLine = fpLines[i];
        // Erkennung von Aufzählungspunkten (1., •, -, a))
        const cleanFp = fpLine.replace(/^(?:[0-9]+[\.\)]|[\u2022\u2023\u25E6\u2043\u2219\*\-–])\s*/, '').trim();
        if (cleanFp.length > 5) {
          forderungspunkte.push(cleanFp);
        }
      }
    }

    // Bereinige Redetext / Antragstext
    content = content
      .replace(/^(?:antrag\s*\d+[:.]?|antragsteller:?.*|\d{1,2}\..*)\r?\n/gmi, '')
      .trim();
    if (!content) content = block;

    hauptAntraege.push({
      index: counter++,
      rawTitle,
      cleanTitle: cleanTitle.startsWith('Antrag') ? cleanTitle : `Antrag ${counter - 1}: ${cleanTitle}`,
      author,
      lineOrParagraph,
      content,
      forderungspunkte,
    });
  }

  return { hauptAntraege, goExcluded };
}

/**
 * Extrahiert Strategien & Nebenanträge (ÄA, EA, SA, WM) aus der Strategiedatei.
 */
export function parseStrategieText(rawText: string): {
  sections: ParsedStrategieSection[];
  generalStrategyNotes: string;
} {
  if (!rawText || !rawText.trim()) {
    return { sections: [], generalStrategyNotes: '' };
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const sections: ParsedStrategieSection[] = [];
  let currentSection: ParsedStrategieSection | null = null;
  const generalNotesLines: string[] = [];
  let hasFoundFirstMotion = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Prüfe, ob die Zeile ein Nebenantrag ist (ÄA, EA, SA, WM, AÄA)
    // Erkennt z.B.:
    // - "ÄA (Pius): nur für..."
    // - "SA (Ellie Ettinger): Streichung FP 6"
    // - "ÄA FP 3 (Katharina Nigg): Verfügbarmachung..."
    // - "SA zu FP 2 (Anna Klara Lutz): Bafep nicht integrieren"
    // - "EA (Giovanna): gratis Premium..."
    // - "SA (FP5)"
    const subMatch = line.match(/^(\[?(?:ÄA|AÄA|EA|SA|WM)\]?)(.*?)(?:[:\-](.*)|$)/i);

    if (subMatch && subMatch[1]) {
      hasFoundFirstMotion = true;
      if (!currentSection) {
        currentSection = { motionTitle: 'Allgemeine Strategieanträge', subAntraege: [] };
        sections.push(currentSection);
      }

      const rawType = subMatch[1].toUpperCase().replace(/[\[\]]/g, '');
      let detectedType: AntragType = 'AAA';
      if (rawType.includes('EA')) detectedType = 'EA';
      else if (rawType.includes('SA')) detectedType = 'SA';
      else if (rawType.includes('WM')) detectedType = 'WM';
      else if (rawType.includes('ÄA') || rawType.includes('AÄA')) detectedType = 'AAA';

      const meta = (subMatch[2] || '').trim();
      let text = (subMatch[3] || '').trim();

      // Zeilen- oder Forderungspunktbezug (z.B. "FP 3", "FP2", "Zeile 15", "zu FP 2")
      let lineOrParagraph: string | undefined;
      const fpMatch = (meta + ' ' + text).match(/(?:(?:zu\s+)?(?:fp|forderungspunkt|zeile|z\.)\s*\d+|§\s*\d+)/i);
      if (fpMatch) {
        lineOrParagraph = fpMatch[0].trim();
      }

      // Redner:in / Claim ermitteln (z.B. "Pius", "Kathi", "Adrian Schmiedler", "Ellie Ettinger")
      // Wenn im Strategiedokument ein Name steht, ist die Wortmeldung/Nebenantrag bereits vorbestimmt
      let claimedBy: string | undefined;
      const nameMatch = (meta + ' ' + text.slice(0, 40)).match(/\(([^)]+)\)/);
      if (nameMatch) {
        const candidate = nameMatch[1].replace(/\b(?:fp|forderungspunkt)\s*\d+\b/gi, '').trim();
        if (candidate.length > 1 && !/^\d+$/.test(candidate)) {
          claimedBy = candidate;
        }
      }

      // Wenn kein Text nach dem Doppelpunkt steht, nächsten Text heranziehen
      if (!text && i + 1 < lines.length && !lines[i + 1].match(/^\[?(?:ÄA|AÄA|EA|SA|WM)\]?/i)) {
        text = lines[i + 1];
        i++;
      }

      // Bereinige den Text von vorangestellten Klammern mit Name/FP falls nötig
      if (text && claimedBy) {
        text = text.replace(new RegExp(`^\\(${claimedBy}\\)[:\\s-]*`, 'i'), '').trim();
      }

      const shortType = detectedType === 'AAA' ? 'ÄA' : detectedType;
      const title = `${shortType}${lineOrParagraph ? ` zu ${lineOrParagraph}` : ''}${claimedBy ? ` (${claimedBy})` : ''}`;

      currentSection.subAntraege.push({
        type: detectedType,
        title,
        content: text || line,
        lineOrParagraph,
        claimedBy: claimedBy || undefined,
        author: claimedBy || 'Delegierte:r',
      });
    } else {
      // Prüfe, ob es sich um eine Metazeile (Abstimmungsempfehlung, Begründung, etc.) handelt
      const isMetaLine = /^(?:abstimmungsempfehlung|empfehlung|begründung|nebenantr[äa]ge|wortmeldung|redner|notizen?|anmerkung|taktik|hinweis|info|tipp|genereller ablauf|während dem sip|dresscode)\b/i.test(line);

      // Überschrift eines Hauptantrags erkennen (z.B. "Antrag 1: ...", "### Antrag 2", "Strategie für Antrag 3", etc.)
      const isHeaderCandidate =
        !isMetaLine &&
        line.length >= 3 &&
        line.length <= 140 &&
        !line.startsWith('•') &&
        !line.startsWith('-') &&
        !line.startsWith('') &&
        (
          /^#{1,4}\s+/i.test(line) ||
          /(?:strategie\s+(?:für|zu)\s+)?(?:haupt)?antrag\s*\d+/i.test(line) ||
          /^top\s*\d+/i.test(line) ||
          /^\d{1,2}[\.:]\s+[A-ZÄÖÜ]/i.test(line)
        );

      if (isHeaderCandidate && !line.includes('?')) {
        hasFoundFirstMotion = true;
        const cleanHeader = line.replace(/^#{1,4}\s+/, '').trim();
        currentSection = {
          motionTitle: cleanHeader,
          subAntraege: [],
          notes: '',
        };
        sections.push(currentSection);
      } else if (currentSection && isMetaLine) {
        // Hänge Notizen an die aktuelle Sektion an
        currentSection.notes = (currentSection.notes ? `${currentSection.notes}\n` : '') + line;
      } else if (!hasFoundFirstMotion) {
        generalNotesLines.push(line);
      }
    }
  }

  return {
    sections,
    generalStrategyNotes: generalNotesLines.join('\n').trim(),
  };
}

/**
 * Kombiniert Hauptanträge aus der SiP-Antragsmappe und Nebenanträge aus der Strategie.
 * Antragstexte & Forderungspunkte werden mit den entsprechenden Strategien zusammengeführt.
 */
export function combineAntragsmappeAndStrategie(
  antragsmappeText: string,
  strategieText: string,
  baseTimestamp: number = Date.now()
): {
  antraege: SipAntrag[];
  strategyNotes: string;
  summary: {
    hauptAntraegeCount: number;
    subAntraegeCount: number;
    matchedSectionsCount: number;
    goExcluded: boolean;
  };
} {
  const { hauptAntraege, goExcluded } = parseAntragsmappeText(antragsmappeText);
  const { sections, generalStrategyNotes } = parseStrategieText(strategieText);

  const resultAntraege: SipAntrag[] = [];
  const matchedSectionTitles = new Set<string>();

  // 1. Verarbeite Hauptanträge und verknüpfe passende Strategie-Nebenanträge
  hauptAntraege.forEach((h, hIdx) => {
    const hauptAntragId = `antrag_${hIdx + 1}`;

    const mainMotion: SipAntrag = {
      id: hauptAntragId,
      type: 'HAUPTANTRAG',
      title: h.cleanTitle,
      author: h.author,
      rede: h.content,
      content: h.content,
      forderungspunkte: h.forderungspunkte,
      lineOrParagraph: h.lineOrParagraph || `Antrag ${hIdx + 1}`,
      isPreFab: true,
      status: 'approved',
      claimedBy: null,
      claimedAt: null,
      isActive: false,
      createdAt: new Date(baseTimestamp + hIdx * 1000).toISOString(),
    };
    resultAntraege.push(mainMotion);

    // Suche nach passender Strategie-Sektion
    const matchingSection = sections.find((s) => isTitleMatching(s.motionTitle, h.cleanTitle));

    if (matchingSection) {
      matchedSectionTitles.add(matchingSection.motionTitle);

      matchingSection.subAntraege.forEach((sub, sIdx) => {
        const subMotion: SipAntrag = {
          id: `antrag_sub_${hIdx + 1}_${sIdx + 1}`,
          parentAntragId: hauptAntragId,
          type: sub.type,
          title: sub.title,
          content: sub.content,
          lineOrParagraph: sub.lineOrParagraph || h.lineOrParagraph,
          author: sub.author || 'Delegierte:r',
          claimedBy: sub.claimedBy || null,
          claimedAt: sub.claimedBy ? new Date().toISOString() : null,
          isPreFab: true,
          status: 'approved',
          isActive: false,
          createdAt: new Date(baseTimestamp + (hIdx * 1000) + (sIdx + 1) * 100).toISOString(),
        };
        resultAntraege.push(subMotion);
      });
    }
  });

  // 2. Falls in der Strategie Anträge waren, die in der Antragsmappe nicht gefunden wurden
  sections.forEach((sec, sIdx) => {
    if (!matchedSectionTitles.has(sec.motionTitle) && sec.subAntraege.length > 0) {
      const extraHauptId = `antrag_extra_${sIdx + 1}`;
      const extraMain: SipAntrag = {
        id: extraHauptId,
        type: 'HAUPTANTRAG',
        title: sec.motionTitle.startsWith('Antrag') ? sec.motionTitle : `Antrag: ${sec.motionTitle}`,
        author: 'Schüler:innenparlament',
        content: `Hauptantrag zu ${sec.motionTitle} aus Strategieunterlagen`,
        forderungspunkte: [],
        lineOrParagraph: `Antrag ${hauptAntraege.length + sIdx + 1}`,
        isPreFab: true,
        status: 'approved',
        claimedBy: null,
        claimedAt: null,
        isActive: false,
        createdAt: new Date(baseTimestamp + (hauptAntraege.length + sIdx) * 1000).toISOString(),
      };
      resultAntraege.push(extraMain);

      sec.subAntraege.forEach((sub, subIdx) => {
        resultAntraege.push({
          id: `antrag_sub_extra_${sIdx + 1}_${subIdx + 1}`,
          parentAntragId: extraHauptId,
          type: sub.type,
          title: sub.title,
          content: sub.content,
          lineOrParagraph: sub.lineOrParagraph,
          author: sub.author || 'Delegierte:r',
          claimedBy: sub.claimedBy || null,
          claimedAt: sub.claimedBy ? new Date().toISOString() : null,
          isPreFab: true,
          status: 'approved',
          isActive: false,
          createdAt: new Date(baseTimestamp + (hauptAntraege.length + sIdx) * 1000 + (subIdx + 1) * 100).toISOString(),
        });
      });
    }
  });

  const subCount = resultAntraege.filter((a) => a.type !== 'HAUPTANTRAG').length;
  const hauptCount = resultAntraege.filter((a) => a.type === 'HAUPTANTRAG').length;

  return {
    antraege: resultAntraege,
    strategyNotes: generalStrategyNotes,
    summary: {
      hauptAntraegeCount: hauptCount,
      subAntraegeCount: subCount,
      matchedSectionsCount: matchedSectionTitles.size,
      goExcluded,
    },
  };
}

/**
 * Automatischer Komplett-Import von SiP-Dateien (PDF Antragsmappe & DOCX/Text Strategie).
 */
export async function executeAutoSiPImport(options: {
  antragsmappeFile?: File | ArrayBuffer;
  antragsmappeText?: string;
  strategieFile?: File | ArrayBuffer;
  strategieText?: string;
}): Promise<AutoImportResult> {
  let finalAntragsmappeText = options.antragsmappeText || '';
  let finalStrategieText = options.strategieText || '';

  // 1. Text aus PDF-Datei extrahieren falls vorhanden
  if (options.antragsmappeFile) {
    try {
      const buffer =
        options.antragsmappeFile instanceof ArrayBuffer
          ? options.antragsmappeFile
          : await options.antragsmappeFile.arrayBuffer();
      finalAntragsmappeText = await extractTextFromPdfArrayBuffer(buffer);
    } catch (err) {
      console.warn('Konnte PDF nicht extrahieren:', err);
    }
  }

  // 2. Text aus DOCX-Datei extrahieren falls vorhanden
  if (options.strategieFile) {
    try {
      const buffer =
        options.strategieFile instanceof ArrayBuffer
          ? options.strategieFile
          : await options.strategieFile.arrayBuffer();
      finalStrategieText = await extractTextFromDocxArrayBuffer(buffer);
    } catch (err) {
      console.warn('Konnte DOCX nicht extrahieren:', err);
    }
  }

  // 3. Zusammenführen
  const { antraege, strategyNotes, summary } = combineAntragsmappeAndStrategie(
    finalAntragsmappeText,
    finalStrategieText
  );

  const goNote = summary.goExcluded
    ? ' Die Geschäftsordnung am Ende der Antragsmappe wurde wie gewünscht ignoriert.'
    : '';

  const message =
    antraege.length > 0
      ? `✅ Automatisch importiert: ${summary.hauptAntraegeCount} Hauptanträge und ${summary.subAntraegeCount} dazugehörige Nebenanträge wurden erfolgreich verknüpft.${goNote} Alles bereit fürs Plenum!`
      : 'Es konnten keine Anträge aus den bereitgestellten Dateien oder Texten extrahiert werden.';

  return {
    success: antraege.length > 0,
    message,
    antraege,
    strategyNotes,
    summary,
  };
}
