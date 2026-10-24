import { AntragType, SipAntrag } from './types';

export interface ParsedRawAntrag {
  id: string;
  type: AntragType;
  title: string;
  content: string;
  lineOrParagraph?: string;
  confidence: 'high' | 'medium';
  selected: boolean;
}

/**
 * Analysiert Fließtext aus Google Docs / SiP-Antragsunterlagen
 * und erkennt automatisch Wortmeldungen (WM), Abänderungsanträge (AÄA / ÄA),
 * Erweiterungsanträge (EA), Streichungsanträge (SA) sowie GO-Anträge.
 */
export function parseAntraegeFromText(rawText: string): ParsedRawAntrag[] {
  if (!rawText || !rawText.trim()) return [];

  const results: ParsedRawAntrag[] = [];
  // Splitte nach doppelten Zeilenumbrüchen oder nummerierten Abschnitten
  const blocks = rawText.split(/(?:\r?\n){2,}|(?=^(?:\[?(?:WM|AÄA|ÄA|EA|SA|Antrag)\]?|\d+[\.\)]\s*(?:WM|AÄA|ÄA|EA|SA)))/gmi);

  let counter = 1;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.length < 5) continue;

    const lower = trimmed.toLowerCase();
    let detectedType: AntragType | null = null;
    let confidence: 'high' | 'medium' = 'medium';

    if (
      lower.includes('ende der debatte') ||
      lower.includes('schluss der debatte') ||
      lower.includes('debatte beenden')
    ) {
      detectedType = 'ENDE_DEBATTE';
      confidence = 'high';
    } else if (
      lower.includes('ende der redner') ||
      lower.includes('schluss der redner') ||
      lower.includes('rednerliste schließen') ||
      lower.includes('redner:innenliste')
    ) {
      detectedType = 'ENDE_REDNER';
      confidence = 'high';
    } else if (
      /\b(aäa|äa|abänderungsantrag|abänderung)\b/i.test(trimmed) ||
      /^\[?(?:aäa|äa)\]?/i.test(trimmed)
    ) {
      detectedType = 'AAA';
      confidence = 'high';
    } else if (
      /\b(ea|erweiterungsantrag|erweiterung)\b/i.test(trimmed) ||
      /^\[?ea\]?/i.test(trimmed)
    ) {
      detectedType = 'EA';
      confidence = 'high';
    } else if (
      /\b(sa|streichungsantrag|streichung)\b/i.test(trimmed) ||
      /^\[?sa\]?/i.test(trimmed)
    ) {
      detectedType = 'SA';
      confidence = 'high';
    } else if (
      /\b(wm|wortmeldung)\b/i.test(trimmed) ||
      /^\[?wm\]?/i.test(trimmed)
    ) {
      detectedType = 'WM';
      confidence = 'high';
    } else if (
      lower.includes('geschäftsordnungsantrag') ||
      lower.includes('go-antrag')
    ) {
      detectedType = 'SONSTIGES';
      confidence = 'medium';
    }

    if (!detectedType) {
      // Wenn der Block keinen eindeutigen Antragskopf hat, aber signifikant ist
      continue;
    }

    // Extrahiere Zeilen- / Paragrafen-Bezug (z.B. "Zeile 30-35", "Z. 12", "§ 4 Abs. 1")
    let lineOrParagraph: string | undefined;
    const lineMatch = trimmed.match(
      /(?:(?:zeile|z\.|zeilen)\s*\d+(?:\s*-\s*\d+)?|§\s*\d+[a-z]?(?:\s*(?:abs\.|absatz)\s*\d+)?)/i
    );
    if (lineMatch) {
      lineOrParagraph = lineMatch[0];
    }

    // Extrahiere Titel & Hauptinhalt
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    let title = firstLine.slice(0, 80);
    if (firstLine.length > 80) title += '...';

    // Säubere den Titel von Präfixen wie "[AÄA] "
    title = title.replace(/^\[?(?:WM|AÄA|ÄA|EA|SA|Antrag)\]?[:\s-]*/i, '').trim();
    if (!title) {
      title = `${detectedType} (Dokumentenauszug #${counter})`;
    }

    results.push({
      id: `parsed_${Date.now()}_${counter++}`,
      type: detectedType,
      title,
      content: trimmed,
      lineOrParagraph,
      confidence,
      selected: true,
    });
  }

  return results;
}

/**
 * Konvertiert geparste Roh-Anträge in persistente SipAntrag-Objekte
 */
export function convertParsedToSipAntraege(
  parsed: ParsedRawAntrag[],
  sourceLabel: string = 'Import aus Google Docs'
): SipAntrag[] {
  return parsed.map((item) => ({
    id: `antrag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: item.type,
    title: item.title,
    content: item.content,
    lineOrParagraph: item.lineOrParagraph,
    author: sourceLabel,
    isPreFab: true,
    status: 'approved',
    claimedBy: null,
    claimedAt: null,
    isActive: false,
    createdAt: new Date().toISOString(),
  }));
}
