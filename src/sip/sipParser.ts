import { AntragType, SipAntrag } from './types';

export interface ParsedRawAntrag {
  id: string;
  type: AntragType;
  title: string;
  content: string;
  text: string;
  lineOrParagraph?: string;
  confidence: 'high' | 'medium';
  selected: boolean;
}

/**
 * Analysiert Fließtext aus Google Docs / SiP-Antragsunterlagen nach dem Buffer-Pattern
 * und erkennt automatisch Wortmeldungen (WM), Abänderungsanträge (ÄA),
 * Erweiterungsanträge (EA), Streichungsanträge (SA) sowie GO-Anträge.
 * Jede darauffolgende Zeile, die kein neuer Antrag ist, wird mit `\n` an `text` angehängt.
 */
export function parseAntraegeFromText(rawText: string): ParsedRawAntrag[] {
  if (!rawText || !rawText.trim()) return [];

  const results: ParsedRawAntrag[] = [];
  const lines = rawText.normalize('NFC').split(/\r?\n/);

  let counter = 1;
  let activeBuffer: ParsedRawAntrag | null = null;

  const detectHeaderType = (line: string): { type: AntragType; confidence: 'high' | 'medium' } | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();

    if (
      /^(?:ende\s+der\s+debatte|schluss\s+der\s+debatte|debatte\s+beenden)\b/i.test(trimmed)
    ) {
      return { type: 'ENDE_DEBATTE', confidence: 'high' };
    }
    if (
      /^(?:ende\s+der\s+redner|schluss\s+der\s+redner|rednerliste\s+schließen|redner:innenliste)\b/i.test(trimmed)
    ) {
      return { type: 'ENDE_REDNER', confidence: 'high' };
    }
    if (
      /^(?:\d+[\.\)]\s*)?(?:(?:mögliche[rs]?|eventuell(?:er)?|antwort)\s+)?\[?(?:aäa|äa|aä|abänderungsantrag)\s*\d*\]?(?=\s|\(|:|\/|\-|$)/i.test(
        trimmed
      )
    ) {
      return { type: 'AAA', confidence: 'high' };
    }
    if (
      /^(?:\d+[\.\)]\s*)?(?:(?:mögliche[rs]?|eventuell(?:er)?)\s+)?\[?(?:ea|erweiterungsantrag)\s*\d*\]?(?=\s|\(|:|\/|\-|$)/i.test(
        trimmed
      )
    ) {
      return { type: 'EA', confidence: 'high' };
    }
    if (
      /^(?:\d+[\.\)]\s*)?(?:(?:mögliche[rs]?|eventuell(?:er)?)\s+)?\[?(?:sa|streichungsantrag)\s*\d*\]?(?=\s|\(|:|\/|\-|$)/i.test(
        trimmed
      )
    ) {
      return { type: 'SA', confidence: 'high' };
    }
    if (
      /^(?:\d+[\.\)]\s*)?(?:(?:mögliche[rs]?)\s+)?\[?(?:wm|wortmeldung)\s*\d*\]?(?=\s|\(|:|\/|\-|$)/i.test(
        trimmed
      )
    ) {
      return { type: 'WM', confidence: 'high' };
    }
    if (lower.startsWith('geschäftsordnungsantrag') || lower.startsWith('go-antrag')) {
      return { type: 'SONSTIGES', confidence: 'medium' };
    }
    return null;
  };

  const flushBuffer = () => {
    if (!activeBuffer) return;
    const finalText = activeBuffer.text.trim();
    if (finalText.length >= 2) {
      const lineMatch = finalText.match(
        /(?:(?:zeile|z\.|zeilen|fp|forderungspunkt)\s*\d+(?:\s*-\s*\d+)?|§\s*\d+[a-z]?(?:\s*(?:abs\.|absatz)\s*\d+)?)/i
      );
      if (lineMatch && !activeBuffer.lineOrParagraph) {
        activeBuffer.lineOrParagraph = lineMatch[0];
      }
      activeBuffer.text = finalText;
      activeBuffer.content = finalText;
      results.push(activeBuffer);
    }
    activeBuffer = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const header = detectHeaderType(trimmed);
    if (header) {
      flushBuffer();
      let title = trimmed.slice(0, 80);
      if (trimmed.length > 80) title += '...';
      title = title.replace(/^\[?(?:WM|AÄA|ÄA|AÄ|EA|SA|Antrag)\s*\d*\]?[:\s-]*/i, '').trim();
      if (!title) {
        title = `${header.type} (Dokumentenauszug #${counter})`;
      }

      const colonIdx = trimmed.indexOf(':');
      const initialBody = colonIdx !== -1 ? trimmed.slice(colonIdx + 1).trim() : trimmed;

      activeBuffer = {
        id: `parsed_${Date.now()}_${counter++}`,
        type: header.type,
        title,
        text: initialBody,
        content: initialBody,
        confidence: header.confidence,
        selected: true,
      };
    } else if (activeBuffer) {
      activeBuffer.text = activeBuffer.text ? `${activeBuffer.text}\n${trimmed}` : trimmed;
      activeBuffer.content = activeBuffer.text;
    }
  }

  flushBuffer();
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
    content: item.text || item.content,
    text: item.text || item.content,
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
