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
  motionNumber?: number;
  motionTitle: string;
  author?: string;
  forderungspunkte?: string[];
  content?: string;
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
    strategyFilesCount: number;
    goExcluded: boolean;
  };
}

/**
 * Entfernt Personennamen (z.B. "(Simon)", "- Simon") und Platzhalter (z.B. "(XX)", "(XXX)")
 * aus dem Titel einer Wortmeldung oder eines Nebenantrags, sodass der Name nur dort steht,
 * wo "geclaimed von" bzw. "noch nicht vergeben" angezeigt wird.
 */
export function cleanSubMotionTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let clean = rawTitle;
  // Entferne nachgestellte Autoren wie " – Simon", " - Katharina Nigg", etc.
  clean = clean.replace(/\s*[\-–]\s*[A-ZÄÖÜa-zäöüß\s.\-]+$/, '');
  // Entferne (XX), (XXX), (?), (offen), etc.
  clean = clean.replace(/\s*\([xX\?\s\-]+\)/gi, '');
  // Entferne Klammern, die einen Personennamen enthalten (nicht aber FP oder Zeilenbezug)
  clean = clean.replace(/\s*\((?!(?:zu\s+|zur\s+)?(?:fp|forderungspunkt|zeile|z\.|§)\b)[^)]+\)/gi, '');
  // Vereinheitliche "zu/zur FP X" zu "(FP X)" falls noch nicht in Klammern
  clean = clean.replace(/\b(?:zu|zur)\s+(fp|forderungspunkt|zeile|z\.|§)\s*(\d+)\b/gi, '($1 $2)');
  // Doppelpunkt, Bindestrich oder Leerzeichen am Ende entfernen
  clean = clean.replace(/[:\-–\s]+$/, '');
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Normalisiert Antragstitel für den intelligenten Abgleich zwischen
 * SiP-Antragsmappe und Strategie-Dokument.
 */
export function normalizeTitleForMatching(title: string): string {
  if (!title) return '';
  return title
    .normalize('NFC')
    .toLowerCase()
    // Entferne Datei-Präfixe wie "--- strategie: "
    .replace(/^---\s*(?:strategie|antrag)\s*:\s*/gi, '')
    .replace(/\s*---$/gi, '')
    // Entferne Antragsnummern ("Antrag 1:", "Top 2.", "1. ", "1_", etc.)
    .replace(/^(?:(?:strategie\s+(?:für|zu)\s+)?(?:haupt)?antrag|top)\s*\d*[\.:\-\s]*/gi, '')
    .replace(/^\d{1,2}[\._:\-\s]+/g, '')
    // Entferne Präfix-Tags wie "[BS]" oder "[Gymnasium]"
    .replace(/^\[[a-zäöü\s-]+\][:\s-]*/gi, '')
    // Entferne Dateierweiterungen
    .replace(/\.(?:pdf|docx|doc|txt|md)$/i, '')
    // Entferne Autor-Suffixe aus Dateinamen wie "_Anna Huwe" oder "_Kathrin Eichhorner_Elena Ettinger"
    .replace(/(?:_[a-zäöüß\s.-]+)+$/gi, '')
    .replace(/\([^)]+\)$/g, '')
    // Vereinheitliche Anführungszeichen, Bindestriche, Unterstriche & Satzzeichen
    .replace(/[\u2013\u2014_]/g, ' ')
    .replace(/[.,:;!?'"„“”«»()\[\]{}\/\\-]/g, ' ')
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
  if (normA.length >= 5 && normB.length >= 5 && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

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
 * Extrahiert Nummer, Titel und Autor aus einem typischen Vorarlberger SiP-Dateinamen
 * z.B. "1_Bildung muss bewegen - Schulen ins 21. Jahrhundert bringen_Anna Huwe.docx"
 */
export function parseSiPFileNameMeta(fileName: string): {
  motionNumber?: number;
  title: string;
  author?: string;
} {
  const clean = fileName
    .normalize('NFC')
    .replace(/^---\s*(?:Strategie|Antrag)\s*:\s*/i, '')
    .replace(/\s*---$/i, '')
    .replace(/\.(?:pdf|docx|doc|txt|md)$/i, '')
    .trim();

  let rest = clean;
  let motionNumber: number | undefined;

  const numMatch = rest.match(/^(\d{1,2})[\._\-\s]+(.*)$/);
  if (numMatch) {
    motionNumber = parseInt(numMatch[1], 10);
    rest = numMatch[2].trim();
  }

  // Prüfe, ob am Ende durch "_" abgetrennt Autor:innennamen stehen
  const parts = rest.split('_').map((p) => p.trim()).filter(Boolean);
  let author: string | undefined;
  let title = rest;

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const secondLastPart = parts.length >= 3 ? parts[parts.length - 2] : undefined;
    const looksLikePersonName = (s: string) =>
      /^[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+){1,2}$/.test(s);

    if (secondLastPart && looksLikePersonName(lastPart) && looksLikePersonName(secondLastPart)) {
      author = `${secondLastPart}, ${lastPart}`;
      title = parts.slice(0, -2).join(': ').trim();
    } else if (looksLikePersonName(lastPart)) {
      author = lastPart;
      title = parts.slice(0, -1).join(': ').trim();
    } else {
      title = parts.join(': ').trim();
    }
  }

  return { motionNumber, title: title || clean, author };
}

/**
 * Prüft, ob eine Zeile eine typische Kopf- oder Fußzeile der SiP-Antragsmappe ist
 * (z.B. Seitenzahlen, Kopfzeile "Vorarlberger Schüler:innenparlament", "Antragsmappe").
 */
export function isHeaderOrFooterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^---\s*seite\s*\d+\s*---\s*$/i.test(trimmed)) return true;
  if (/^(?:vorarlberger\s+)?schüler(?:_|:|\*|\/)?innenparlament\s*$/i.test(trimmed)) return true;
  if (/^(?:sip\s+)?antragsmappe(?:\s+\d+[\.\/]\s*sip)?\s*$/i.test(trimmed)) return true;
  if (/^\d{1,3}\s*$/.test(trimmed)) return true; // Standalone Seitenzahlen
  if (/^seite\s+\d+(?:\s*(?:von|\/)\s*\d+)?\s*$/i.test(trimmed)) return true;
  return false;
}

/**
 * Extrahiert alle Hauptanträge aus dem Text der SiP-Antragsmappe.
 * Filtert Kopf-/Fußzeilen vorab, trennt submitter und title strikt,
 * extrahiert Forderungen separat und schneidet Begründungen nach den Forderungen NICHT ab.
 */
export function parseAntragsmappeText(rawText: string): {
  hauptAntraege: ParsedHauptAntrag[];
  goExcluded: boolean;
} {
  if (!rawText || !rawText.trim()) {
    return { hauptAntraege: [], goExcluded: false };
  }

  const normalizedRaw = rawText.normalize('NFC');

  // 1. Geschäftsordnung am Schluss der Antragsmappe erkennen und abschneiden
  const goRegex =
    /(?:(?:\r?\n){1,3}\s*(?:---\s*seite\s*\d+\s*---\s*)?(?:anhang\s*:?\s*)?geschäftsordnung(?:\s+des\s+vorarlberger\s+schüler(?:_|:|\*|\/)?innenparlaments)?|\bgeschäftsordnung\s*\(go\)\s*(?:\r?\n))/i;
  const goMatch = normalizedRaw.match(goRegex);
  let cleanText = normalizedRaw;
  let goExcluded = false;

  if (goMatch && typeof goMatch.index === 'number' && goMatch.index > 300) {
    cleanText = normalizedRaw.slice(0, goMatch.index);
    goExcluded = true;
  }

  // 2. Zerlege in Antragsblöcke
  let rawBlocks: string[] = [];

  // Variante A: Explizite Datei-Trenner "--- Antrag: ... ---"
  if (/---\s*Antrag\s*:/i.test(cleanText)) {
    rawBlocks = cleanText
      .split(/(?=---\s*Antrag\s*:)/gi)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
  }

  // Variante B: Klassische "Antrag 1:", "Hauptantrag 2:", "TOP 1" Überschriften
  if (rawBlocks.length <= 1) {
    const primaryRegex =
      /(?=(?:^|\r?\n)(?:---\s*seite\s*\d+\s*---\s*\r?\n)?(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?)\s*)/gi;
    const primarySplit = cleanText
      .split(primaryRegex)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
    if (primarySplit.length > 1) {
      rawBlocks = primarySplit;
    }
  }

  // Variante C: Titelzeile direkt vor "Antragsteller_in:" / "Antragssteller:in:"
  if (rawBlocks.length <= 1) {
    const authorHeaderRegex =
      /(?=(?:^|\r?\n)(?:---\s*seite\s*\d+\s*---\s*\r?\n)?[^\r\n]{3,140}\r?\n\s*(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von)\s*[:\-])/gi;
    const authorSplit = cleanText
      .split(authorHeaderRegex)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
    if (authorSplit.length > 1 || /antrags?steller(?:_?innen|_?in|:?innen|:?in)?\s*[:\-]/i.test(cleanText)) {
      rawBlocks = authorSplit;
    }
  }

  // Variante D: Fallback nummerierte Titel "1. Titel"
  if (rawBlocks.length <= 1) {
    const fallbackRegex =
      /(?=(?:^|\r?\n)(?:---\s*seite\s*\d+\s*---\s*\r?\n)?\d{1,2}\.\s+[A-ZÄÖÜ][^\r\n]{3,100}(?:\r?\n)+[^\r\n]*(?:antrags?steller|schule|antragstext|daher fordert))/gi;
    const fallbackSplit = cleanText
      .split(fallbackRegex)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
    rawBlocks = fallbackSplit.length > 1 ? fallbackSplit : rawBlocks.length > 0 ? rawBlocks : [cleanText];
  }

  const hauptAntraege: ParsedHauptAntrag[] = [];
  let counter = 1;

  for (const block of rawBlocks) {
    let fileMetaTitle = '';
    let fileMetaAuthor = '';
    let fileMetaNum: number | undefined;

    const fileBannerMatch = block.match(/^---\s*Antrag\s*:\s*([^\r\n]+?)\s*---/i);
    if (fileBannerMatch) {
      const parsedMeta = parseSiPFileNameMeta(fileBannerMatch[1]);
      fileMetaTitle = parsedMeta.title;
      fileMetaAuthor = parsedMeta.author || '';
      fileMetaNum = parsedMeta.motionNumber;
    }

    const strippedBlock = block
      .replace(/^---\s*Antrag\s*:\s*[^\r\n]+?\s*---/gi, '')
      .replace(/---\s*seite\s*\d+\s*---\s*/gi, '')
      .trim();

    // Zeilen filtern und wiederkehrende Header/Footer vorab löschen
    const lines = strippedBlock
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isHeaderOrFooterLine(l));

    if (lines.length === 0) continue;

    // Finde Zeile des Antragstellers (submitter)
    const authorLineIndex = lines.findIndex((l) =>
      /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]/i.test(l)
    );

    // Finde expliziten Antragskopf (z.B. "Antrag 1: ...", "TOP 2")
    const explicitHeaderIndex = lines.findIndex((l) => /(?:(?:haupt)?antrag|top)\s*\d+/i.test(l));

    let headerIndex = 0;
    if (explicitHeaderIndex >= 0 && (authorLineIndex === -1 || explicitHeaderIndex < authorLineIndex)) {
      headerIndex = explicitHeaderIndex;
    } else if (authorLineIndex > 0) {
      headerIndex = authorLineIndex - 1;
    }

    const headerLine = lines[headerIndex] || fileMetaTitle || lines[0];

    // Ignoriere Deckblatt, Inhaltsverzeichnis oder reine Vorab-Kommentare
    const hasMotionIndicators =
      /(?:(?:haupt)?antrag|top)\s*\d+/i.test(headerLine) ||
      authorLineIndex !== -1 ||
      /antragstext|daher\s+fordert|forderungspunkt\s*\d+/i.test(strippedBlock) ||
      Boolean(fileBannerMatch);

    if (
      /inhaltsverzeichnis|geschäftsordnung|vorab-kommentierung|liebe\s+schüler/i.test(headerLine) ||
      !hasMotionIndicators
    ) {
      continue;
    }

    // 1. Antragsnummer isolieren
    const numMatch = headerLine.match(/\b(?:(?:haupt)?antrag|top)\s*(\d{1,2})\b/i);
    const motionNum = fileMetaNum || (numMatch ? parseInt(numMatch[1], 10) : counter);
    const lineOrParagraph = `Antrag ${motionNum}`;

    // 2. Submitter (Antragsteller:in) isolieren – strikt getrennt vom Titel
    let author = fileMetaAuthor || 'Schüler:innenparlament';
    if (authorLineIndex >= 0) {
      const match = lines[authorLineIndex].match(
        /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]\s*(.+)$/i
      );
      if (match && match[1]) {
        author = match[1].replace(/^[^\wÄÖÜäöüß]+/, '').trim();
      }
    } else {
      const authorMatch = strippedBlock.match(
        /(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]\s*([^\r\n]+)/i
      );
      if (authorMatch && authorMatch[1]) {
        author = authorMatch[1].replace(/^[^\wÄÖÜäöüß]+/, '').trim();
      }
    }

    // 3. Titel isolieren – niemals Antragsteller-Namen einbinden!
    let cleanTitle = headerLine
      .replace(/^(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?|\d{1,2}\.\s*)/i, '')
      .trim();

    // Falls in der Headerzeile nur "Antrag 1:" stand: Titel aus Zeile davor/danach holen, NIEMALS Submitter-Zeile
    if (!cleanTitle && headerIndex + 1 < lines.length && headerIndex + 1 !== authorLineIndex) {
      cleanTitle = lines[headerIndex + 1];
    }
    if (!cleanTitle && fileMetaTitle) {
      cleanTitle = fileMetaTitle;
    }
    if (!cleanTitle && lines.length > 0 && authorLineIndex !== 0) {
      cleanTitle = lines[0];
    }

    // Sicherheitsprüfung: Entferne versehentlich eingedrungene Submitter-Präfixe aus dem Titel
    cleanTitle = cleanTitle
      .replace(/^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von)\s*[:\-].*$/i, '')
      .replace(/^(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?|\d{1,2}\.\s*)/i, '')
      .trim();

    if (!cleanTitle) {
      cleanTitle = `Antrag ${motionNum}`;
    }

    // 4. Forderungen & Begründungstext trennen:
    // Wichtig: Begründung nach den Forderungen NICHT abschneiden!
    const forderungspunkte: string[] = [];
    const forderungMatch = strippedBlock.match(
      /(?:daher\s+fordert\s+(?:das\s+)?(?:vorarlberger\s+)?schüler(?:_|:|\*|\/)?innenparlament(?:\s*[:\-])?|schüler(?:_|:|\*|\/)?innenparlament\s+fordert(?:\s*[:\-])?|fordert\s*[:\-])/i
    );

    let contentText = '';

    if (forderungMatch && typeof forderungMatch.index === 'number') {
      const forderungIndex = forderungMatch.index;
      const beforeForderung = strippedBlock.slice(0, forderungIndex).trim();
      const afterForderung = strippedBlock.slice(forderungIndex + forderungMatch[0].length);

      // A. Text vor den Forderungen (Einleitung / Problemaufriss)
      const leadLines = beforeForderung
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !isHeaderOrFooterLine(l));

      const filteredLeadLines = leadLines.filter((l) => {
        if (l === headerLine || l === cleanTitle) return false;
        if (/^(?:(?:haupt)?antrag\s*\d+|top\s*\d+)/i.test(l)) return false;
        if (/^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von)\s*[:\-]/i.test(l)) return false;
        return true;
      });
      const leadInText = filteredLeadLines.join('\n\n').trim();

      // B. Forderungspunkte & Begründung nach den Forderungen parsen
      const rawAfterLines = afterForderung
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !isHeaderOrFooterLine(l));

      const bulletRegex =
        /^(?:[0-9]+[\.\)]|[\u2022\u2023\u25CF\u25CB\u25AA\u25AB\u25E6\u2043\u2219\uF0B7\uF0A7\*\-–]|\([0-9]+\))\s*/;

      let inDemands = true;
      const reasoningAfterLines: string[] = [];

      for (let i = 0; i < rawAfterLines.length; i++) {
        const line = rawAfterLines[i];

        // Überspringe isolierte Doppelpunkte oder Satzzeichen direkt nach der Einleitungsformel
        if (/^[:\-–\s]+$/.test(line)) continue;

        // Explizite Kennzeichnung des Beginns der Begründung nach den Forderungen
        if (/^(?:begründung|sachverhalt|erläuterung|anmerkung)\s*[:\-]?\s*$/i.test(line)) {
          inDemands = false;
          reasoningAfterLines.push(line);
          continue;
        }

        const isBullet = bulletRegex.test(line);

        if (inDemands) {
          if (isBullet) {
            const cleanFp = line.replace(bulletRegex, '').trim();
            if (cleanFp.length > 0) {
              forderungspunkte.push(cleanFp);
            }
          } else if (forderungspunkte.length > 0) {
            // Prüfe, ob dies eine Fortsetzung des vorherigen Forderungspunkts oder bereits Fließtext ist
            if (line.length > 0 && !/^(?:begründung|sachverhalt)\b/i.test(line) && line.length < 80) {
              forderungspunkte[forderungspunkte.length - 1] += ' ' + line;
            } else {
              inDemands = false;
              reasoningAfterLines.push(line);
            }
          } else if (line.length > 3 && !/^(?:begründung|sachverhalt)\b/i.test(line)) {
            // Unnummerierter erster Forderungspunkt
            forderungspunkte.push(line);
          } else {
            inDemands = false;
            reasoningAfterLines.push(line);
          }
        } else {
          // Begründungstext nach den Forderungen
          reasoningAfterLines.push(line);
        }
      }

      const afterDemandsText = reasoningAfterLines.join('\n\n').trim();

      // Text aus Einleitung vor Forderungen UND ausführlicher Begründung nach den Forderungen zusammenfügen
      const textParts = [leadInText, afterDemandsText].filter(Boolean);
      contentText = textParts.join('\n\n').trim();
    } else {
      // Kein "Daher fordert..." gefunden -> Gesamter Text ohne Header/Submitter ist Begründung
      const allLines = strippedBlock
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !isHeaderOrFooterLine(l));

      const filtered = allLines.filter((l) => {
        if (l === headerLine || l === cleanTitle) return false;
        if (/^(?:(?:haupt)?antrag\s*\d+|top\s*\d+)/i.test(l)) return false;
        if (/^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von)\s*[:\-]/i.test(l)) return false;
        return true;
      });
      contentText = filtered.join('\n\n').trim();
    }

    if (!contentText) contentText = strippedBlock;

    const finalIndex = counter++;
    const displayNum = fileMetaNum || finalIndex;
    const finalCleanTitle = /^antrag\s*\d+/i.test(cleanTitle)
      ? cleanTitle
      : `Antrag ${displayNum}: ${cleanTitle}`;

    const parsedMotion: ParsedHauptAntrag = {
      index: displayNum,
      rawTitle: headerLine,
      cleanTitle: finalCleanTitle,
      author,
      lineOrParagraph,
      content: contentText,
      forderungspunkte,
    };

    hauptAntraege.push(parsedMotion);

    // Debug-Logging gemäß Vorgabe:
    console.log(
      `[PARSED] Typ: HAUPTANTRAG | Titel: ${parsedMotion.cleanTitle} | Submitter: ${parsedMotion.author} | Textlänge: ${parsedMotion.content.length} | Forderungen: ${parsedMotion.forderungspunkte.length}`
    );
  }

  return { hauptAntraege, goExcluded };
}

/**
 * Hilfsfunktion: Prüft, ob eine Zeile ein Nebenantrag / eine Wortmeldung ist
 * Unterstützt Formate wie:
 * - "WM1 (Simon): ..."
 * - "WM3(XX): ..."
 * - "SA1(XX): ..."
 * - "(XXX)AÄ1: ..."
 * - "AÄ zur FP 1 (Emma Battlogg): ..."
 * - "ÄA FP 3 (Katharina Nigg): ..."
 * - "EA (Giovanna): ..."
 * - "WM (Leni-): ..."
 */
const SUB_MOTION_LINE_REGEX =
  /^(?:\([xX\?\s\-]*\)\s*)?(\[?(?:AÄA|ÄA|AÄ|EA|SA|WM)\s*\d*\]?)(?=\s|\(|:|\/|\-|$)(.*?)(?:[:\-]\s*(.*)|$)/i;

function isPlaceholderClaim(candidate: string): boolean {
  const cleaned = candidate.replace(/[\s\-_.?!]/g, '').toLowerCase();
  if (!cleaned || cleaned.length <= 1) return true;
  if (/^\d+$/.test(cleaned)) return true;
  if (/^x+$/i.test(cleaned)) return true; // XX, XXX, x
  if (/^(?:tbd|offen|frei|niemand|none|null|n\/a|folgt|tba|alle)$/i.test(cleaned)) return true;
  if (/^(?:fp|forderungspunkt|z|zeile)\d*$/i.test(cleaned)) return true;
  return false;
}

/**
 * Extrahiert Strategien, Forderungspunkte, Autor:innen & Nebenanträge (ÄA, EA, SA, WM)
 * aus einer oder mehreren Strategiedateien.
 */
export function parseStrategieText(rawText: string): {
  sections: ParsedStrategieSection[];
  generalStrategyNotes: string;
} {
  if (!rawText || !rawText.trim()) {
    return { sections: [], generalStrategyNotes: '' };
  }

  const normalizedRaw = rawText.normalize('NFC');
  const lines = normalizedRaw.split(/\r?\n/).map((l) => l.trim());
  const sections: ParsedStrategieSection[] = [];
  let currentSection: ParsedStrategieSection | null = null;
  const generalNotesLines: string[] = [];
  let hasFoundFirstMotion = false;
  let activeForderungspunkt: string | undefined;
  let expectingForderungspunktText = false;
  let justOpenedFromFileBanner = false;
  let isSingleMotionFile = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // 1. Prüfe auf Datei-Trenner "--- Strategie: <Dateiname> ---" oder "---"
    if (/^---\s*$/i.test(line)) {
      activeForderungspunkt = undefined;
      expectingForderungspunktText = false;
      justOpenedFromFileBanner = false;
      isSingleMotionFile = false;
      continue;
    }

    const fileBannerMatch = line.match(/^---\s*Strategie\s*:\s*(.+?)\s*---$/i);
    if (fileBannerMatch) {
      const rawFileName = fileBannerMatch[1].trim();
      activeForderungspunkt = undefined;
      expectingForderungspunktText = false;

      // Falls es die Sammeldatei "Erweiterungs-_Abänderungs-_Streichungsanträge..." ist,
      // öffnen wir noch keine einzelne Antrag-Sektion, sondern lassen die Überschriften darin Sektionen öffnen.
      if (/erweiterungs.*abänderungs|sammel|legende|formatierung/i.test(rawFileName)) {
        currentSection = null;
        justOpenedFromFileBanner = false;
        isSingleMotionFile = false;
        continue;
      }

      const meta = parseSiPFileNameMeta(rawFileName);
      hasFoundFirstMotion = true;
      isSingleMotionFile = true;
      currentSection = {
        motionNumber: meta.motionNumber,
        motionTitle: meta.title,
        author: meta.author,
        forderungspunkte: [],
        subAntraege: [],
        notes: '',
      };
      sections.push(currentSection);
      justOpenedFromFileBanner = true;
      continue;
    }

    // 2. Prüfe auf "Antragsteller_in: ..."
    const authorMatch = line.match(
      /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]\s*(.+)$/i
    );
    if (authorMatch && currentSection) {
      justOpenedFromFileBanner = false;
      expectingForderungspunktText = false;
      const extractedAuthor = authorMatch[1].trim();
      if (extractedAuthor) {
        currentSection.author = extractedAuthor;
      }
      continue;
    }

    // 3. Prüfe auf "Forderungspunkt X:" (in Vorarlberger SiP Strategiedateien)
    const fpHeaderMatch = line.match(/^forderungspunkt\s*(\d+)\s*[:.]?\s*(.*)$/i);
    if (fpHeaderMatch && currentSection) {
      justOpenedFromFileBanner = false;
      const fpNum = fpHeaderMatch[1];
      const inlineFpText = (fpHeaderMatch[2] || '').trim();
      activeForderungspunkt = `FP ${fpNum}`;
      if (!currentSection.forderungspunkte) {
        currentSection.forderungspunkte = [];
      }
      if (inlineFpText) {
        currentSection.forderungspunkte.push(inlineFpText);
        expectingForderungspunktText = false;
      } else {
        expectingForderungspunktText = true;
      }
      continue;
    }

    // 4. Prüfe, ob die Zeile ein Nebenantrag oder eine Wortmeldung ist (WM1, SA1, ÄA, AÄ1, EA, (XXX)AÄ1, etc.)
    const subMatch = line.match(SUB_MOTION_LINE_REGEX);
    if (subMatch && subMatch[1]) {
      justOpenedFromFileBanner = false;
      expectingForderungspunktText = false;
      hasFoundFirstMotion = true;

      if (!currentSection) {
        currentSection = {
          motionTitle: 'Allgemeine Strategieanträge',
          forderungspunkte: [],
          subAntraege: [],
        };
        sections.push(currentSection);
      }

      const rawType = subMatch[1].toUpperCase().replace(/[\[\]\s\d]/g, '');
      let detectedType: AntragType = 'AAA';
      if (rawType.includes('EA')) detectedType = 'EA';
      else if (rawType.includes('SA')) detectedType = 'SA';
      else if (rawType.includes('WM')) detectedType = 'WM';
      else if (rawType.includes('ÄA') || rawType.includes('AÄ')) detectedType = 'AAA';

      const meta = (subMatch[2] || '').trim();
      let text = (subMatch[3] || '').trim();

      // Zeilen- oder Forderungspunktbezug (entweder explizit in der Zeile oder aus dem aktuellen Forderungspunkt-Block)
      let lineOrParagraph: string | undefined;
      const fpMatch = (meta + ' ' + text).match(
        /(?:(?:zu\s+|zur\s+)?(?:fp|forderungspunkt|zeile|z\.)\s*\d+|§\s*\d+)/i
      );
      if (fpMatch) {
        lineOrParagraph = fpMatch[0].replace(/^(?:zu|zur)\s+/i, '').trim();
      } else if (activeForderungspunkt) {
        lineOrParagraph = activeForderungspunkt;
      }

      // Redner:in / Claim ermitteln (z.B. "(Simon)", "(Emma Battlogg)", "(Leni-)")
      // Platzhalter wie "(XX)" oder "(XXX)" werden NICHT als Claim gewertet!
      let claimedBy: string | undefined;
      const parenMatches = Array.from((meta + ' ' + text.slice(0, 50)).matchAll(/\(([^)]+)\)/g));
      for (const m of parenMatches) {
        const rawCandidate = m[1]
          .replace(/\b(?:zu|zur)?\s*(?:fp|forderungspunkt)\s*\d+\b/gi, '')
          .replace(/[\-\s]+$/g, '')
          .replace(/^[\-\s]+/g, '')
          .trim();
        if (!isPlaceholderClaim(rawCandidate)) {
          claimedBy = rawCandidate;
          break;
        }
      }

      // Sammle den gesamten Text der Wortmeldung / des Nebenantrags:
      // Auch mehrzeiliger Fließtext wird vollständig bis zum nächsten Eintrag erfasst!
      const contentLines: string[] = [];
      if (text) contentLines.push(text);

      while (
        i + 1 < lines.length &&
        lines[i + 1] &&
        !SUB_MOTION_LINE_REGEX.test(lines[i + 1]) &&
        !/^forderungspunkt\s*\d+/i.test(lines[i + 1]) &&
        !/^---\s*Strategie/i.test(lines[i + 1]) &&
        !/^(?:antrags?steller|strategie|abstimmungsempfehlung)\b/i.test(lines[i + 1])
      ) {
        contentLines.push(lines[i + 1]);
        i++;
      }

      let fullContent = contentLines.join('\n').trim();

      // Bereinige den Text von vorangestellten Klammern mit Name/Platzhalter
      if (fullContent) {
        fullContent = fullContent.replace(/^\([xX\?\s\-]+\)[:\s-]*/, '').trim();
        if (claimedBy) {
          const escapedClaim = claimedBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          fullContent = fullContent.replace(new RegExp(`^\\(${escapedClaim}\\-?\\)[:\\s-]*`, 'i'), '').trim();
        }
      }

      // Spezifische Behandlung für kurze Anträge wie "SA (Luka): FP5" oder "SA (FP6)"
      const fpOnlyMatch = (fullContent || line).match(/(?:(?:zu\s+|zur\s+)?(?:fp|forderungspunkt)\s*(\d+))/i);
      if (fpOnlyMatch && (!lineOrParagraph || lineOrParagraph.length === 0)) {
        lineOrParagraph = `FP ${fpOnlyMatch[1]}`;
      }

      if (!fullContent || fullContent.length < 4 || /^(?:fp|forderungspunkt)\s*\d+$/i.test(fullContent)) {
        const typeDesc =
          detectedType === 'SA'
            ? 'Streichungsantrag'
            : detectedType === 'EA'
            ? 'Erweiterungsantrag'
            : detectedType === 'AAA'
            ? 'Abänderungsantrag'
            : 'Wortmeldung';
        fullContent = lineOrParagraph
          ? `${typeDesc} zu ${lineOrParagraph}`
          : `${typeDesc} zum vorliegenden Hauptantrag`;
      }

      const shortType = detectedType === 'AAA' ? 'ÄA' : detectedType;
      const numSuffixMatch = subMatch[1].match(/\d+/);
      const typeLabel = numSuffixMatch ? `${shortType} ${numSuffixMatch[0]}` : shortType;
      const cleanFp = lineOrParagraph ? lineOrParagraph.replace(/^(?:zu|zur)\s+/i, '').trim() : undefined;
      // Titel enthält NUR den Typ & den Forderungspunktbezug – NIEMALS Personennamen oder "(XX)"
      const title = cleanSubMotionTitle(cleanFp ? `${typeLabel} (${cleanFp})` : typeLabel);

      const parsedSub: ParsedSubAntrag = {
        type: detectedType,
        title,
        content: fullContent,
        lineOrParagraph,
        claimedBy: claimedBy || undefined,
        author: claimedBy || 'Delegierte:r',
      };

      currentSection.subAntraege.push(parsedSub);

      // Debug-Logging gemäß Vorgabe:
      console.log(
        `[PARSED] Typ: ${parsedSub.type} | Titel: ${parsedSub.title} | Submitter: ${parsedSub.claimedBy || parsedSub.author || 'Delegierte:r'} | Textlänge: ${parsedSub.content.length} | Forderungen: 0`
      );
      continue;
    }

    // 5. Wenn direkt zuvor "Forderungspunkt X:" stand, ist diese Zeile der Text des Forderungspunkts
    if (expectingForderungspunktText && currentSection) {
      if (!currentSection.forderungspunkte) {
        currentSection.forderungspunkte = [];
      }
      currentSection.forderungspunkte.push(line);
      expectingForderungspunktText = false;
      continue;
    }

    // 6. Prüfe auf Strategie-Notizen / Metazeilen ("Strategie: ...", "Abstimmungsempfehlung: ...", etc.)
    const isMetaLine =
      /^(?:strategie|abstimmungsempfehlung|empfehlung|begründung|nebenantr[äa]ge|wortmeldung|redner|notizen?|anmerkung|taktik|hinweis|info|tipp|genereller ablauf|während dem sip|dresscode)\b/i.test(
        line
      );

    if (isMetaLine && currentSection) {
      justOpenedFromFileBanner = false;
      const cleanedNote = line.replace(/^strategie\s*[:\-]\s*/i, '').trim();
      if (cleanedNote) {
        currentSection.notes = (currentSection.notes ? `${currentSection.notes}\n` : '') + cleanedNote;
      }
      continue;
    }

    // 7. Wenn gerade eine Datei über "--- Strategie: Dateiname ---" geöffnet wurde, ist die erste Zeile der echte Antragstitel im Dokument
    if (justOpenedFromFileBanner && currentSection) {
      justOpenedFromFileBanner = false;
      if (line.length >= 3 && line.length <= 160 && !/^antragsteller/i.test(line)) {
        currentSection.motionTitle = line.replace(/^#{1,4}\s+/, '').trim();
      }
      continue;
    }

    // 8. Prüfe, ob eine neue Antrags-Überschrift vorliegt (nur in Sammeldateien oder wenn keine Einzeldatei aktiv ist)
    const nextNonEmptyLine = lines.slice(i + 1).find((l) => l.length > 0) || '';
    const nextLineIsSubMotionOrAuthor =
      !isSingleMotionFile &&
      !/^(?:eventuelle|mögliche|allgemeine|weitere|zusätzliche|fragen|antworten|df\b|bidi\b)/i.test(line) &&
      !line.includes('?') &&
      !line.endsWith(':') &&
      (SUB_MOTION_LINE_REGEX.test(nextNonEmptyLine) ||
        /^(?:antragsteller|strategie\s*:|forderungspunkt\s*\d+)/i.test(nextNonEmptyLine));

    const isHeaderCandidate =
      !isSingleMotionFile &&
      !isMetaLine &&
      line.length >= 3 &&
      line.length <= 140 &&
      !line.startsWith('•') &&
      !line.startsWith('-') &&
      !line.startsWith('') &&
      !line.startsWith('●') &&
      (/^#{1,4}\s+/i.test(line) ||
        /(?:strategie\s+(?:für|zu)\s+)?(?:haupt)?antrag\s*\d+/i.test(line) ||
        /^top\s*\d+/i.test(line) ||
        /^\d{1,2}[\.:]\s+[A-ZÄÖÜ]/i.test(line) ||
        nextLineIsSubMotionOrAuthor);

    if (isHeaderCandidate) {
      hasFoundFirstMotion = true;
      activeForderungspunkt = undefined;
      expectingForderungspunktText = false;
      const cleanHeader = line.replace(/^#{1,4}\s+/, '').trim();
      const meta = parseSiPFileNameMeta(cleanHeader);
      currentSection = {
        motionNumber: meta.motionNumber,
        motionTitle: meta.title || cleanHeader,
        author: meta.author,
        forderungspunkte: [],
        subAntraege: [],
        notes: '',
      };
      sections.push(currentSection);
    } else if (!hasFoundFirstMotion) {
      generalNotesLines.push(line);
    } else if (currentSection && currentSection.subAntraege.length === 0 && !activeForderungspunkt) {
      // Zusätzliche Strategie-Erläuterung im Kopfbereich der Strategiedatei
      currentSection.notes = (currentSection.notes ? `${currentSection.notes}\n` : '') + line;
    }
  }

  return {
    sections,
    generalStrategyNotes: generalNotesLines.join('\n').trim(),
  };
}

/**
 * Gruppiert zusammengehörige Strategie-Sektionen (z.B. aus Einzel-Strategiedatei + Sammel-Änderungsantragsdatei)
 */
function mergeMatchingStrategieSections(sections: ParsedStrategieSection[]): ParsedStrategieSection[] {
  const merged: ParsedStrategieSection[] = [];

  for (const sec of sections) {
    if (sec.motionTitle === 'Allgemeine Strategieanträge') {
      merged.push(sec);
      continue;
    }

    const existing = merged.find((m) => isTitleMatching(m.motionTitle, sec.motionTitle));
    if (existing) {
      if (!existing.motionNumber && sec.motionNumber) existing.motionNumber = sec.motionNumber;
      if (!existing.author && sec.author) existing.author = sec.author;
      if (
        (!existing.forderungspunkte || existing.forderungspunkte.length === 0) &&
        sec.forderungspunkte &&
        sec.forderungspunkte.length > 0
      ) {
        existing.forderungspunkte = [...sec.forderungspunkte];
      }
      if (sec.notes) {
        existing.notes = existing.notes ? `${existing.notes}\n${sec.notes}` : sec.notes;
      }
      // Füge neue Nebenanträge hinzu (vermeide exakte Duplikate)
      for (const sub of sec.subAntraege) {
        const isDup = existing.subAntraege.some(
          (s) => s.type === sub.type && s.content === sub.content && s.claimedBy === sub.claimedBy
        );
        if (!isDup) {
          existing.subAntraege.push(sub);
        }
      }
    } else {
      merged.push({
        ...sec,
        forderungspunkte: sec.forderungspunkte ? [...sec.forderungspunkte] : [],
        subAntraege: [...sec.subAntraege],
      });
    }
  }

  return merged;
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
  const { sections: rawSections, generalStrategyNotes } = parseStrategieText(strategieText);
  const sections = mergeMatchingStrategieSections(rawSections);

  const resultAntraege: SipAntrag[] = [];
  const matchedSectionIndices = new Set<number>();

  // 1. Verarbeite Hauptanträge aus der Antragsmappe und verknüpfe passende Strategie-Sektionen
  hauptAntraege.forEach((h, hIdx) => {
    const hauptAntragId = `antrag_${hIdx + 1}`;

    // Suche alle passenden Strategie-Sektionen (Titel-Match oder identische Antragsnummer)
    const matchingIndices: number[] = [];
    sections.forEach((s, sIdx) => {
      if (isTitleMatching(s.motionTitle, h.cleanTitle)) {
        matchingIndices.push(sIdx);
      }
    });

    // Fallback: Wenn keine Sektion über den Titel gematcht wurde, prüfe über explizite motionNumber
    if (matchingIndices.length === 0) {
      sections.forEach((s, sIdx) => {
        if (!matchedSectionIndices.has(sIdx) && s.motionNumber && s.motionNumber === h.index) {
          matchingIndices.push(sIdx);
        }
      });
    }

    const matchedSections = matchingIndices.map((idx) => {
      matchedSectionIndices.add(idx);
      return sections[idx];
    });

    const strategyFps = matchedSections.find(
      (s) => s.forderungspunkte && s.forderungspunkte.length > 0
    )?.forderungspunkte;
    const strategyAuthor = matchedSections.find((s) => s.author)?.author;
    const strategyNotesForMotion = matchedSections
      .map((s) => s.notes)
      .filter(Boolean)
      .join('\n');

    const finalFps =
      h.forderungspunkte && h.forderungspunkte.length > 0
        ? h.forderungspunkte
        : strategyFps || [];
    const finalAuthor =
      h.author && h.author !== 'Schüler:innenparlament'
        ? h.author
        : strategyAuthor || h.author;
    // Antragstext wird strikt aus der SiP-Antragsmappe übernommen (Text vor und Begründung nach Forderungen).
    // Er wird NIEMALS durch die Forderungspunkte oder interne Strategie-Notizen ersetzt!
    const finalContent = h.content?.trim() || 'Antragstext siehe SiP-Antragsmappe';

    const mainMotion: SipAntrag = {
      id: hauptAntragId,
      type: 'HAUPTANTRAG',
      title: h.cleanTitle,
      author: finalAuthor,
      rede: finalContent,       // Echter Antragstext / Begründung aus der SiP-Antragsmappe
      content: finalContent,    // Echter Antragstext / Begründung aus der SiP-Antragsmappe
      forderungspunkte: finalFps,
      lineOrParagraph: h.lineOrParagraph || `Antrag ${hIdx + 1}`,
      isPreFab: true,
      status: 'approved',
      claimedBy: null,
      claimedAt: null,
      isActive: false,
      createdAt: new Date(baseTimestamp + hIdx * 1000).toISOString(),
    };
    resultAntraege.push(mainMotion);

    let subCounter = 1;
    for (const matchingSection of matchedSections) {
      for (const sub of matchingSection.subAntraege) {
        const subMotion: SipAntrag = {
          id: `antrag_sub_${hIdx + 1}_${subCounter++}`,
          parentAntragId: hauptAntragId,
          type: sub.type,
          // Titel bereinigen: keine Namen oder "(XX)" im Titel
          title: cleanSubMotionTitle(sub.title),
          content: sub.content,
          lineOrParagraph: sub.lineOrParagraph || h.lineOrParagraph,
          author: sub.author || 'Delegierte:r',
          claimedBy: sub.claimedBy || null,
          claimedAt: sub.claimedBy ? new Date().toISOString() : null,
          isPreFab: true,
          status: 'approved',
          isActive: false,
          createdAt: new Date(baseTimestamp + hIdx * 1000 + subCounter * 100).toISOString(),
        };
        resultAntraege.push(subMotion);
      }
    }
  });

  // 2. Falls in den Strategiedateien Anträge vorhanden sind, die nicht in der Antragsmappe standen
  sections.forEach((sec, sIdx) => {
    if (
      sec.motionTitle === 'Allgemeine Strategieanträge' &&
      (hauptAntraege.length > 0 || sections.length > 1)
    ) {
      return;
    }

    const hasContent =
      sec.subAntraege.length > 0 ||
      (sec.forderungspunkte && sec.forderungspunkte.length > 0) ||
      Boolean(sec.notes);

    if (!matchedSectionIndices.has(sIdx) && hasContent) {
      const motionNum = sec.motionNumber || hauptAntraege.length + sIdx + 1;
      const extraHauptId = `antrag_extra_${sIdx + 1}`;
      const cleanSecTitle = sec.motionTitle.replace(/^Antrag\s*\d+\s*[:.\-]\s*/i, '').trim();
      const formattedTitle = /^antrag\s*\d+/i.test(sec.motionTitle)
        ? sec.motionTitle
        : `Antrag ${motionNum}: ${cleanSecTitle}`;

      // Antragstext darf NIEMALS aus den internen Strategie-Notizen oder reinen Forderungspunkten bestehen
      const extraContent = 'Antragstext siehe SiP-Antragsmappe';

      const extraMain: SipAntrag = {
        id: extraHauptId,
        type: 'HAUPTANTRAG',
        title: formattedTitle,
        author: sec.author || 'Schüler:innenparlament',
        rede: extraContent,
        content: extraContent,
        forderungspunkte: sec.forderungspunkte || [],
        lineOrParagraph: `Antrag ${motionNum}`,
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
          // Titel bereinigen: keine Namen oder "(XX)" im Titel
          title: cleanSubMotionTitle(sub.title),
          content: sub.content,
          lineOrParagraph: sub.lineOrParagraph || `Antrag ${motionNum}`,
          author: sub.author || 'Delegierte:r',
          claimedBy: sub.claimedBy || null,
          claimedAt: sub.claimedBy ? new Date().toISOString() : null,
          isPreFab: true,
          status: 'approved',
          isActive: false,
          createdAt: new Date(
            baseTimestamp + (hauptAntraege.length + sIdx) * 1000 + (subIdx + 1) * 100
          ).toISOString(),
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
      matchedSectionsCount: matchedSectionIndices.size,
      goExcluded,
    },
  };
}

/**
 * Erkennt automatisch in einem übergebenen Ordner (z.B. Google Drive SiP-Ordner)
 * oder einer Dateiliste:
 * 1. Die Antragsmappe (PDF mit "Antragsmappe" im Namen)
 * 2. Alle Strategiedateien (im Unterordner "Strategie" oder mit "Strategie" / .docx / .txt)
 */
export function classifySiPFolderFiles(files: File[] | FileList): {
  antragsmappeFile?: File;
  strategieFiles: File[];
  unrecognizedFiles: File[];
} {
  const fileArray = Array.from(files);
  let antragsmappeFile: File | undefined;
  const strategieFiles: File[] = [];
  const unrecognizedFiles: File[] = [];

  // 1. Suche nach der Antragsmappe: Name enthält "antragsmappe" und endet mit ".pdf"
  antragsmappeFile = fileArray.find((f) => {
    const name = f.name.normalize('NFC').toLowerCase();
    return name.includes('antragsmappe') && name.endsWith('.pdf') && !name.includes('kommentierung');
  });

  if (!antragsmappeFile) {
    antragsmappeFile = fileArray.find((f) => {
      const name = f.name.normalize('NFC').toLowerCase();
      return name.includes('antragsmappe') && name.endsWith('.pdf');
    });
  }

  // Falls nicht direkt über "Antragsmappe" im Namen gefunden: Erste PDF-Datei außerhalb von "Strategie"
  if (!antragsmappeFile) {
    antragsmappeFile = fileArray.find((f) => {
      const relPath = (f.webkitRelativePath || f.name).normalize('NFC').toLowerCase();
      return f.name.toLowerCase().endsWith('.pdf') && !relPath.includes('/strategie/');
    });
  }

  // 2. Suche nach Strategiedateien (Unterordner "Strategie", Name mit "strategie" oder DOCX/TXT)
  for (const f of fileArray) {
    if (f === antragsmappeFile) continue;
    const name = f.name.normalize('NFC').toLowerCase();
    const relPath = (f.webkitRelativePath || f.name).normalize('NFC').toLowerCase();

    // Versteckte oder Word-Lockdateien ignorieren (~$Antrag.docx, .DS_Store)
    if (f.name.startsWith('~$') || f.name.startsWith('.')) continue;

    const isInStrategieFolder =
      relPath.includes('/strategie/') || relPath.includes('\\strategie\\');
    const isDocxOrTxt =
      name.endsWith('.docx') ||
      name.endsWith('.doc') ||
      name.endsWith('.txt') ||
      name.endsWith('.md');
    const isStrategieName = name.includes('strategie');

    if (
      isInStrategieFolder ||
      (isDocxOrTxt && (isStrategieName || isInStrategieFolder || !antragsmappeFile))
    ) {
      strategieFiles.push(f);
    } else if (isDocxOrTxt) {
      strategieFiles.push(f);
    } else {
      unrecognizedFiles.push(f);
    }
  }

  return { antragsmappeFile, strategieFiles, unrecognizedFiles };
}

/**
 * Extrahiert den Text aus einer einzelnen Strategie-Datei (DOCX oder Text).
 */
async function extractTextFromSingleStrategieFile(
  file: File | ArrayBuffer,
  fileName: string = ''
): Promise<string> {
  let text = '';
  const lowerName = fileName.toLowerCase();
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc');

  if (file instanceof ArrayBuffer) {
    if (isDocx) {
      text = await extractTextFromDocxArrayBuffer(file);
    } else {
      text = new TextDecoder('utf-8').decode(file);
    }
  } else {
    if (isDocx) {
      const buffer = await file.arrayBuffer();
      text = await extractTextFromDocxArrayBuffer(buffer);
    } else {
      text = await file.text();
    }
  }

  const cleanName = fileName.normalize('NFC').trim();
  if (cleanName) {
    return `--- Strategie: ${cleanName} ---\n${text}`;
  }
  return text;
}

export interface AutoImportProgress {
  percent: number;
  currentMotionNumber?: number;
  totalMotions?: number;
  motionTitle?: string;
  statusText: string;
}

export type AutoImportProgressCallback = (progress: AutoImportProgress) => void;

export interface AutoImportOptions {
  files?: File[] | FileList;
  antragsmappeFile?: File | ArrayBuffer;
  antragsmappeText?: string;
  strategieFile?: File | ArrayBuffer;
  strategieFiles?: (File | ArrayBuffer)[];
  strategieText?: string;
  onProgress?: AutoImportProgressCallback;
}

/**
 * Automatischer Komplett-Import von SiP-Dateien:
 * 1. Antragsmappe PDF + Unterordner "Strategie" (einzelne oder mehrere DOCX-Dateien)
 * 2. Schritt-für-Schritt-Zusammensetzen (1. Antrag + 1. Strategie, 2. Antrag + 2. Strategie, ...) mit Ladebalken
 * 3. Automatischer Ausschluss der Geschäftsordnung (GO) am Ende der Antragsmappe
 * 4. Vollzugsmeldung ("Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!")
 */
export async function executeAutoSiPImport(options: AutoImportOptions): Promise<AutoImportResult> {
  let finalAntragsmappeText = options.antragsmappeText || '';
  let finalStrategieText = options.strategieText || '';

  let targetAntragsmappe = options.antragsmappeFile;
  const targetStrategieFiles: (File | ArrayBuffer)[] = [];

  options.onProgress?.({
    percent: 5,
    statusText: 'Dateien werden identifiziert und vorbereitet...',
  });

  if (options.files && options.files.length > 0) {
    const classified = classifySiPFolderFiles(options.files);
    if (!targetAntragsmappe && classified.antragsmappeFile) {
      targetAntragsmappe = classified.antragsmappeFile;
    }
    if (classified.strategieFiles.length > 0) {
      targetStrategieFiles.push(...classified.strategieFiles);
    }
  }

  if (options.strategieFile) {
    targetStrategieFiles.push(options.strategieFile);
  }
  if (options.strategieFiles && options.strategieFiles.length > 0) {
    targetStrategieFiles.push(...options.strategieFiles);
  }

  options.onProgress?.({
    percent: 15,
    statusText: 'Extrahiere Antragsmappe (PDF) und Strategiedateien...',
  });

  // 1. Text aus PDF-Antragsmappe extrahieren
  if (targetAntragsmappe) {
    try {
      const buffer =
        targetAntragsmappe instanceof ArrayBuffer
          ? targetAntragsmappe
          : await targetAntragsmappe.arrayBuffer();
      finalAntragsmappeText = await extractTextFromPdfArrayBuffer(buffer);
    } catch (err) {
      console.warn('Konnte Antragsmappen-PDF nicht extrahieren:', err);
    }
  }

  // 2. Text aus allen Strategiedateien extrahieren
  if (targetStrategieFiles.length > 0) {
    const extractedSections: string[] = [];
    for (let i = 0; i < targetStrategieFiles.length; i++) {
      const f = targetStrategieFiles[i];
      const name = f instanceof File ? f.name : `Strategie_${i + 1}.docx`;
      try {
        const text = await extractTextFromSingleStrategieFile(f, name);
        if (text && text.trim()) {
          extractedSections.push(text.trim());
        }
      } catch (err) {
        console.warn(`Konnte Strategiedatei "${name}" nicht extrahieren:`, err);
      }
    }
    if (extractedSections.length > 0) {
      finalStrategieText =
        (finalStrategieText ? `${finalStrategieText}\n\n` : '') +
        extractedSections.join('\n\n');
    }
  }

  // 3. Texte parsen & zusammenführen
  options.onProgress?.({
    percent: 25,
    statusText: 'Hauptanträge und Strategien werden analysiert...',
  });

  const combined = combineAntragsmappeAndStrategie(finalAntragsmappeText, finalStrategieText);
  const hauptAntraege = combined.antraege.filter((a) => a.type === 'HAUPTANTRAG');
  const total = hauptAntraege.length;

  // 4. Schritt-für-Schritt-Fortschritt: 1. Antrag & 1. Strategie, 2. Antrag & 2. Strategie, ...
  for (let hIdx = 0; hIdx < hauptAntraege.length; hIdx++) {
    const h = hauptAntraege[hIdx];
    const motionNum = hIdx + 1;
    const progressPercent = Math.min(95, Math.round(25 + ((hIdx + 1) / Math.max(1, total)) * 70));

    if (options.onProgress) {
      options.onProgress({
        percent: progressPercent,
        currentMotionNumber: motionNum,
        totalMotions: total,
        motionTitle: h.title,
        statusText: `Lade ${motionNum}. Antrag & ${motionNum}. Strategie: "${h.title}"...`,
      });
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  // 5. Abschlussmeldung: "Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!"
  if (options.onProgress) {
    options.onProgress({
      percent: 100,
      currentMotionNumber: total,
      totalMotions: total,
      statusText: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
    });
  }

  const message =
    combined.antraege.length > 0
      ? 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!'
      : 'Es konnten keine Anträge aus den bereitgestellten Dateien oder Texten extrahiert werden. Bitte prüfe, ob die PDF-Antragsmappe ausgewählt wurde.';

  return {
    success: combined.antraege.length > 0,
    message,
    antraege: combined.antraege,
    strategyNotes: combined.strategyNotes,
    summary: {
      ...combined.summary,
      strategyFilesCount: targetStrategieFiles.length,
    },
  };
}
