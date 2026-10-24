import { SipSession } from '../types';

/**
 * Generiert einen formatierten Textbericht für das Protokoll eines Schüler:innenparlaments (SiP)
 */
export function generateSipProtocolText(session: SipSession): string {
  const dateStr = new Date().toLocaleString('de-AT', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push(`OFFIZIELLES SITZUNGSPROTOKOLL`);
  lines.push(`${session.title}`);
  lines.push(`Erstellt am: ${dateStr}`);
  lines.push('================================================================================\n');

  // 1. ZUSAMMENFASSUNG
  const totalAntraege = session.antraege.length;
  const hauptantraege = session.antraege.filter((a) => a.type === 'HAUPTANTRAG');
  const aenderungsantraege = session.antraege.filter((a) => a.type === 'AAA');
  const erweiterungsantraege = session.antraege.filter((a) => a.type === 'EA');
  const streichungsantraege = session.antraege.filter((a) => a.type === 'SA');
  const wortmeldungen = session.antraege.filter((a) => a.type === 'WM');
  const goAntraege = session.antraege.filter((a) => a.type === 'ENDE_DEBATTE' || a.type === 'ENDE_REDNER' || a.type === 'SONSTIGES');
  const claimedCount = session.antraege.filter((a) => Boolean(a.claimedBy)).length;

  lines.push('--- 1. STATISTISCHE ÜBERSICHT ---');
  lines.push(`• Gesamtanzahl verhandelter Punkte: ${totalAntraege}`);
  lines.push(`  - Hauptanträge (Plenum): ${hauptantraege.length}`);
  lines.push(`  - Abänderungsanträge (ÄA): ${aenderungsantraege.length}`);
  lines.push(`  - Erweiterungsanträge (EA): ${erweiterungsantraege.length}`);
  lines.push(`  - Streichungsanträge (SA): ${streichungsantraege.length}`);
  lines.push(`  - Wortmeldungen (WM): ${wortmeldungen.length}`);
  lines.push(`  - Geschäftsordnungsanträge (GO): ${goAntraege.length}`);
  lines.push(`• Geclaimte Reden im Team: ${claimedCount}`);
  lines.push(`• Aktuelle Abstimmungsempfehlung: ${session.voteRecommendation?.type || 'KEINE'} ${session.voteRecommendation?.note ? `(${session.voteRecommendation.note})` : ''}\n`);

  // 2. CHRONOLOGISCHES ABLAUFPROTOKOLL (Wer hat wann was gemacht)
  lines.push('--- 2. CHRONOLOGISCHES ABLAUFPROTOKOLL (AUDIT TRAIL) ---');
  const log = session.activityLog || [];
  if (log.length === 0) {
    lines.push('Keine Protokolleinträge während dieser Sitzung aufgezeichnet.');
  } else {
    log.forEach((entry, idx) => {
      const time = new Date(entry.timestamp).toLocaleTimeString('de-AT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      lines.push(`[${time}] ${entry.performedBy}: ${entry.details}`);
    });
  }
  lines.push('\n');

  // 3. ANTRAGSVERZEICHNIS MIT DETAILS
  lines.push('--- 3. ANTRAGSVERZEICHNIS & BEHANDLUNG IM DETAIL ---');
  hauptantraege.forEach((ha, idx) => {
    lines.push(`\n--------------------------------------------------------------------------------`);
    lines.push(`HAUPTANTRAG ${idx + 1}: ${ha.title}`);
    lines.push(`Antragsteller:in: ${ha.author}`);
    if (ha.lineOrParagraph) lines.push(`Fundstelle: ${ha.lineOrParagraph}`);
    lines.push(`Status: ${ha.status === 'approved' ? 'Freigegeben / Behandelt' : ha.status}`);
    lines.push(`Redner:in (Claim): ${ha.claimedBy || 'Nicht geclaimed'}${ha.claimedAt ? ` (am ${new Date(ha.claimedAt).toLocaleTimeString('de-AT')})` : ''}`);

    if (ha.forderungspunkte && ha.forderungspunkte.length > 0) {
      lines.push(`\nForderungspunkte (${ha.forderungspunkte.length}):`);
      ha.forderungspunkte.forEach((fp, fpIdx) => {
        lines.push(`  ${fpIdx + 1}. ${fp}`);
      });
    }

    if (ha.rede) {
      lines.push(`\nVorbereitete Rede:\n${ha.rede.trim()}`);
    } else if (ha.content) {
      lines.push(`\nInhalt:\n${ha.content.trim()}`);
    }

    if (ha.adminNotes) {
      lines.push(`\nAnmerkungen / BD-Stellungnahme:\n${ha.adminNotes.trim()}`);
    }

    // Unteranträge zu diesem Antrag
    const subs = session.antraege.filter((a) => a.parentAntragId === ha.id);
    if (subs.length > 0) {
      lines.push(`\n>> Zugehörige Zusatzanträge & Wortmeldungen (${subs.length}):`);
      subs.forEach((sub, subIdx) => {
        lines.push(`   (${subIdx + 1}) [${sub.type}] ${sub.title}`);
        lines.push(`       Verfasser:in: ${sub.author} | Status: ${sub.status}`);
        if (sub.lineOrParagraph) lines.push(`       Zeile/Absatz: ${sub.lineOrParagraph}`);
        lines.push(`       Text: ${sub.content.trim()}`);
      });
    }
  });

  // Weitere eingereichte Anträge ohne Eltern-Antrag
  const standaloneCustom = session.antraege.filter((a) => !a.isPreFab && !a.parentAntragId && a.type !== 'HAUPTANTRAG');
  if (standaloneCustom.length > 0) {
    lines.push(`\n\n--------------------------------------------------------------------------------`);
    lines.push(`WEITERE AUS DEM PLENUM EINGEREICHTE ANTRÄGE (${standaloneCustom.length}):`);
    standaloneCustom.forEach((ca, idx) => {
      lines.push(`\n(${idx + 1}) [${ca.type}] ${ca.title}`);
      lines.push(`    Verfasser:in: ${ca.author} | Status: ${ca.status}`);
      lines.push(`    Text: ${ca.content.trim()}`);
    });
  }

  lines.push('\n================================================================================');
  lines.push('ENDE DES PROTOKOLLS');
  lines.push('================================================================================\n');

  return lines.join('\n');
}

/**
 * Triggert den Browser-Download der Protokolldatei
 */
export function downloadSipProtocol(session: SipSession): void {
  const text = generateSipProtocolText(session);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const cleanTitle = session.title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `SiP_Protokoll_${cleanTitle}_${dateStr}.txt`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
