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
    strategyFilesCount: number;
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
  const primaryRegex = /(?=(?:^|\r?\n|---\s*seite\s*\d+\s*---\s*)(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?)\s*)/gi;
  const primarySplit = cleanText.split(primaryRegex).map((b) => b.trim()).filter((b) => b.length > 15);

  if (primarySplit.length > 1) {
    rawBlocks = primarySplit;
  } else {
    // Fallback falls Anträge als "1. Titel" formatiert sind
    const fallbackRegex = /(?=(?:^|\r?\n|---\s*seite\s*\d+\s*---\s*)\d{1,2}\.\s+[A-ZÄÖÜ][^\r\n]{3,80}(?:\r?\n)+[^\r\n]*(?:antragsteller|schule|antragstext|daher fordert))/gi;
    const fallbackSplit = cleanText.split(fallbackRegex).map((b) => b.trim()).filter((b) => b.length > 15);
    rawBlocks = fallbackSplit.length > 1 ? fallbackSplit : primarySplit;
  }

  const hauptAntraege: ParsedHauptAntrag[] = [];
  let counter = 1;

  for (const block of rawBlocks) {
    const cleanedBlock = block.replace(/---\s*seite\s*\d+\s*---\s*/gi, '').trim();
    const lines = cleanedBlock.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Finde die Zeile, die die Antragsnummer / den Antragskopf enthält
    const headerIndex = lines.findIndex((l) => /(?:(?:haupt)?antrag|top)\s*\d+/i.test(l));
    const headerLine = headerIndex >= 0 ? lines[headerIndex] : lines[0];

    // Ignoriere Deckblatt, Inhaltsverzeichnisse oder GO-Titel
    if (
      /inhaltsverzeichnis|geschäftsordnung|antragsmappe/i.test(headerLine) ||
      (!/(?:(?:haupt)?antrag|top)\s*\d+/i.test(headerLine) && !/antragstext|daher fordert/i.test(cleanedBlock))
    ) {
      continue;
    }

    // Antragsnummer ermitteln
    const numMatch = headerLine.match(/\b(?:(?:haupt)?antrag|top)\s*(\d{1,2})\b/i);
    const motionNum = numMatch ? parseInt(numMatch[1], 10) : counter;
    const lineOrParagraph = `Antrag ${motionNum}`;

    // Titel ermitteln
    let cleanTitle = headerLine.replace(/^(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?|\d{1,2}\.\s*)/i, '').trim();
    if (!cleanTitle && headerIndex >= 0 && headerIndex + 1 < lines.length && !/antragsteller|schule/i.test(lines[headerIndex + 1])) {
      cleanTitle = lines[headerIndex + 1];
    }
    if (!cleanTitle && lines.length > 1 && !/antragsteller|schule/i.test(lines[1])) {
      cleanTitle = lines[1];
    }
    if (!cleanTitle) {
      cleanTitle = `Antrag ${motionNum}`;
    }

    // Wenn der Titel sehr kurz ist und die nächste Zeile mehr Details hat
    if (cleanTitle.length < 5 && headerIndex >= 0 && headerIndex + 1 < lines.length && !/antragsteller|schule/i.test(lines[headerIndex + 1])) {
      cleanTitle = lines[headerIndex + 1];
    }

    // Antragsteller:in ermitteln
    let author = 'Schüler:innenparlament';
    const authorMatch = cleanedBlock.match(/(?:antragsteller(?::?innen|:?in)?|eingereicht\s*von|autor(?::?in)?)\s*[:\-]\s*([^\r\n,]+)/i);
    if (authorMatch) {
      author = authorMatch[1].replace(/^[^\wÄÖÜäöüß]+/, '').trim();
    } else {
      // Suche nach typischen Namen im Kopf
      const authorLine = lines.find((l) => /^[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+(?:\s*\([^)]+\))?$/.test(l));
      if (authorLine && authorLine !== cleanTitle && !authorLine.includes('Antrag')) {
        author = authorLine;
      }
    }

    // Forderungspunkte extrahieren ("Daher fordert das Vorarlberger Schüler:innenparlament")
    const forderungspunkte: string[] = [];
    const forderungIndex = cleanedBlock.search(/(?:daher\s+fordert\s+(?:das\s+)?(?:vorarlberger\s+)?schüler:?innenparlament|schüler:?innenparlament\s+fordert|fordert\s*:)/i);

    let content = cleanedBlock;
    if (forderungIndex !== -1) {
      content = cleanedBlock.slice(0, forderungIndex).trim();
      const afterForderung = cleanedBlock.slice(forderungIndex);
      const fpLines = afterForderung.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      for (let i = 1; i < fpLines.length; i++) {
        const fpLine = fpLines[i];
        // Überspringe Seitenumbrüche, Kopfzeilen oder Dokumenttitel
        if (/^(?:vorarlberger\s+)?schüler:?innenparlament|seite\s*\d+|antragsmappe|antragstext/i.test(fpLine)) {
          continue;
        }

        // Erkennung von Aufzählungspunkten (1., •, -, a), etc.)
        const isBulletOrNumbered = /^(?:[0-9]+[\.\)]|[\u2022\u2023\u25E6\u2043\u2219\*\-–]|\([0-9]+\))\s*/.test(fpLine);
        if (isBulletOrNumbered) {
          const cleanFp = fpLine.replace(/^(?:[0-9]+[\.\)]|[\u2022\u2023\u25E6\u2043\u2219\*\-–]|\([0-9]+\))\s*/, '').trim();
          if (cleanFp.length > 0) {
            forderungspunkte.push(cleanFp);
          }
        } else if (forderungspunkte.length > 0) {
          // Mehrzeilige Fortsetzung des vorangehenden Forderungspunkts
          forderungspunkte[forderungspunkte.length - 1] += ' ' + fpLine;
        } else if (fpLine.length > 5) {
          // Unnummerierter erster Forderungspunkt
          forderungspunkte.push(fpLine);
        }
      }
    }

    // Bereinige Redetext / Antragstext
    content = content
      .replace(/^(?:antrag\s*\d+[:.]?|antragsteller:?.*|\d{1,2}\..*)\r?\n/gmi, '')
      .trim();
    if (!content) content = cleanedBlock;

    hauptAntraege.push({
      index: counter++,
      rawTitle: headerLine,
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
    const name = f.name.toLowerCase();
    return name.includes('antragsmappe') && name.endsWith('.pdf');
  });

  // Falls nicht direkt über "Antragsmappe" im Namen gefunden: Erste PDF-Datei außerhalb von "Strategie"
  if (!antragsmappeFile) {
    antragsmappeFile = fileArray.find((f) => {
      const relPath = (f.webkitRelativePath || f.name).toLowerCase();
      return f.name.toLowerCase().endsWith('.pdf') && !relPath.includes('/strategie/');
    });
  }

  // 2. Suche nach Strategiedateien (Unterordner "Strategie", Name mit "strategie" oder DOCX/TXT)
  for (const f of fileArray) {
    if (f === antragsmappeFile) continue;
    const name = f.name.toLowerCase();
    const relPath = (f.webkitRelativePath || f.name).toLowerCase();

    // Versteckte oder Word-Lockdateien ignorieren (~$Antrag.docx, .DS_Store)
    if (f.name.startsWith('~$') || f.name.startsWith('.')) continue;

    const isInStrategieFolder = relPath.includes('/strategie/') || relPath.includes('\\strategie\\');
    const isDocxOrTxt =
      name.endsWith('.docx') ||
      name.endsWith('.doc') ||
      name.endsWith('.txt') ||
      name.endsWith('.md');
    const isStrategieName = name.includes('strategie');

    if (isInStrategieFolder || (isDocxOrTxt && (isStrategieName || isInStrategieFolder || !antragsmappeFile))) {
      strategieFiles.push(f);
    } else if (isDocxOrTxt) {
      // Auch allgemeine docx-Dateien als Strategiekandidaten aufnehmen
      strategieFiles.push(f);
    } else {
      unrecognizedFiles.push(f);
    }
  }

  return { antragsmappeFile, strategieFiles, unrecognizedFiles };
}

/**
 * Extrahiert den Text aus einer einzelnen Strategie-Datei (DOCX oder Text).
 * Falls die Datei für einen einzelnen Antrag steht (z.B. "Antrag 1 - Menstruationsartikel.docx"),
 * wird der Titel aus dem Dateinamen als Überschrift vorangestellt.
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

  // Bereinige den Dateinamen
  const cleanBaseName = fileName.replace(/\.[^/.]+$/, '').trim();

  // Prüfe, ob im Dokument bereits eine Hauptantrags-Überschrift vorhanden ist
  const hasMotionHeader = /(?:^|\r?\n)(?:(?:strategie\s+(?:für|zu)\s+)?(?:haupt)?antrag\s*\d+|top\s*\d+|\d{1,2}[\.:]\s+[A-ZÄÖÜ])/i.test(
    text
  );

  // Falls der Dateiname auf einen Antrag hinweist (z.B. "Antrag 1", "Antrag 2 - Psychologie", "TOP 3")
  // und keine Überschrift im Text steht, Überschrift voranstellen
  if (!hasMotionHeader && cleanBaseName.length > 2) {
    return `### ${cleanBaseName}\n\n${text}`;
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
 * Unterstützt:
 * 1. Freigegebenen Google Drive-Ordner (alle Dateien auf einmal via webkitdirectory oder Drag & Drop)
 * 2. Antragsmappe PDF + Unterordner "Strategie" (einzelne oder mehrere DOCX-Dateien)
 * 3. Schritt-für-Schritt-Zusammensetzen (1. Antrag + 1. Strategie, 2. Antrag + 2. Strategie, ...) mit Ladebalken
 * 4. Automatischer Ausschluss der Geschäftsordnung (GO) am Ende der Antragsmappe
 * 5. Vollzugsmeldung ("Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!")
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

  // Wenn ein Ordner oder eine Liste von Dateien übergeben wurde
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

  // 2. Text aus allen Strategiedateien (Unterordner "Strategie" / DOCX / TXT) extrahieren
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
        extractedSections.join('\n\n---\n\n');
    }
  }

  // 3. Texte parsen (Antragsmappe ohne GO & Strategie)
  options.onProgress?.({
    percent: 25,
    statusText: 'Hauptanträge und Strategien werden analysiert...',
  });

  const { hauptAntraege, goExcluded } = parseAntragsmappeText(finalAntragsmappeText);
  const { sections, generalStrategyNotes } = parseStrategieText(finalStrategieText);

  const total = hauptAntraege.length;
  const resultAntraege: SipAntrag[] = [];
  const matchedSectionTitles = new Set<string>();
  const baseTimestamp = Date.now();

  // 4. Schritt-für-Schritt Zusammensetzen: Antrag für Antrag
  // (1. Antrag + 1. Strategie, 2. Antrag + 2. Strategie, ...)
  for (let hIdx = 0; hIdx < hauptAntraege.length; hIdx++) {
    const h = hauptAntraege[hIdx];
    const motionNum = hIdx + 1;
    const progressPercent = Math.min(95, Math.round(25 + ((hIdx + 1) / Math.max(1, total)) * 70));

    if (options.onProgress) {
      options.onProgress({
        percent: progressPercent,
        currentMotionNumber: motionNum,
        totalMotions: total,
        motionTitle: h.cleanTitle,
        statusText: `Lade ${motionNum}. Antrag & ${motionNum}. Strategie: "${h.cleanTitle}"...`,
      });
      // Visuelles Delay pro Antrag für den Ladebalken
      await new Promise((r) => setTimeout(r, 60));
    }

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

    // Passende Strategie-Sektion zum Hauptantrag finden & verknüpfen
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
          createdAt: new Date(baseTimestamp + hIdx * 1000 + (sIdx + 1) * 100).toISOString(),
        };
        resultAntraege.push(subMotion);
      });
    }
  }

  // 5. Zusätzliche Strategie-Anträge, die keinem Hauptantrag der Mappe zugeordnet waren
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

  // 6. Abschlussmeldung: "Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!"
  if (options.onProgress) {
    options.onProgress({
      percent: 100,
      currentMotionNumber: hauptCount,
      totalMotions: hauptCount,
      statusText: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
    });
  }

  const message =
    resultAntraege.length > 0
      ? 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!'
      : 'Es konnten keine Anträge aus den bereitgestellten Dateien oder Texten extrahiert werden. Bitte prüfe, ob die PDF-Antragsmappe ausgewählt wurde.';

  return {
    success: resultAntraege.length > 0,
    message,
    antraege: resultAntraege,
    strategyNotes: generalStrategyNotes,
    summary: {
      hauptAntraegeCount: hauptCount,
      subAntraegeCount: subCount,
      matchedSectionsCount: matchedSectionTitles.size,
      strategyFilesCount: targetStrategieFiles.length,
      goExcluded,
    },
  };
}
