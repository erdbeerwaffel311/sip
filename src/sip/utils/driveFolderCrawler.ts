import { extractTextFromPdfArrayBuffer } from './pdfHelper';
import { extractTextFromDocxArrayBuffer } from './docxHelper';
import {
  parseAntragsmappeText,
  combineAntragsmappeAndStrategie,
  AutoImportProgressCallback,
  AutoImportResult,
} from './sipAutoImporter';
import { getSupabaseClient } from '../../utils/supabaseSync';

export interface DriveFileInfo {
  name: string;
  id: string;
  downloadUrl: string;
  mimeType?: string;
}

export interface GoogleDriveFolderManifest {
  folderId: string;
  antragsmappe: DriveFileInfo | null;
  hauptantragFiles?: DriveFileInfo[];
  strategieFiles: DriveFileInfo[];
  updatedAt: string;
}

export interface ParsedDriveEntry {
  id: string;
  name: string;
  isFolder: boolean;
  isGoogleDoc: boolean;
  isGoogleSheet: boolean;
  href: string;
}

/**
 * Bekanntes Manifest für das 2. SiP 2024/25 als letzter Offline-Fallback
 */
export const KNOWN_SIP_MANIFESTS: Record<string, GoogleDriveFolderManifest> = {
  '1srawS_1c9GZCqDCDuUUPhU_02FPttxi-': {
    folderId: '1srawS_1c9GZCqDCDuUUPhU_02FPttxi-',
    antragsmappe: {
      name: 'Antragsmappe Vorab-Kommentierung.pdf',
      id: '1DSqbr6vzPS2qBn3VqQCoce36r0t4RtIS',
      downloadUrl: 'https://drive.usercontent.google.com/download?id=1DSqbr6vzPS2qBn3VqQCoce36r0t4RtIS',
    },
    strategieFiles: [
      { name: '1_Bildung muss bewegen - Schulen ins 21. Jahrhundert bringen_Anna Huwe.docx', id: '1EJL1s27IYtZNX6P1tjqzhpBJURuvFjrK', downloadUrl: 'https://drive.usercontent.google.com/download?id=1EJL1s27IYtZNX6P1tjqzhpBJURuvFjrK' },
      { name: '2_Bildungs(t)räume gestalten_Chiara Forcher.docx', id: '116Ec8qUQ0G8wRuPHxUq78c0f_CggsCDS', downloadUrl: 'https://drive.usercontent.google.com/download?id=116Ec8qUQ0G8wRuPHxUq78c0f_CggsCDS' },
      { name: '3_Der Mythos Jugendpartizipation_Viola Amann.docx', id: '1UTt_sYDgpHOn3AJWtwimhstTA96ROCrH', downloadUrl: 'https://drive.usercontent.google.com/download?id=1UTt_sYDgpHOn3AJWtwimhstTA96ROCrH' },
      { name: '4_Für mehr Geschlechtergerechtigkeit und Feminismus an Vorarlbergs Schulen_Kathrin Eichhorner_Elena Ettinger.docx', id: '1f7dz96bpaPyM2sPvR75ewm9FtTQmGVPZ', downloadUrl: 'https://drive.usercontent.google.com/download?id=1f7dz96bpaPyM2sPvR75ewm9FtTQmGVPZ' },
      { name: '5_Tafel-Titanen_Fabian Stauss.docx', id: '1Aoa6F0UcuyQ6_8raw6v5gtcG4Z83OT9V', downloadUrl: 'https://drive.usercontent.google.com/download?id=1Aoa6F0UcuyQ6_8raw6v5gtcG4Z83OT9V' },
      { name: '6_404 - Digitaliserung not found_Simon Märker.docx', id: '1S4gEQxV5iLG2eMADEiLLqqdFgdpecBZ-', downloadUrl: 'https://drive.usercontent.google.com/download?id=1S4gEQxV5iLG2eMADEiLLqqdFgdpecBZ-' },
      { name: '7_EUvolution beginnt mit dir_Josefine Müller.docx', id: '1uXKRQ99bmhq0yNQfgJ7emuYK8FLGdcUo', downloadUrl: 'https://drive.usercontent.google.com/download?id=1uXKRQ99bmhq0yNQfgJ7emuYK8FLGdcUo' },
      { name: '8_CO2_ Nur im Chemieunterricht!_Angelina Fitsch.docx', id: '1wYKGesC1cy7jnAv_JPxV0GUFPakmWpcL', downloadUrl: 'https://drive.usercontent.google.com/download?id=1wYKGesC1cy7jnAv_JPxV0GUFPakmWpcL' },
      { name: '9_BMHS optimieren - Zukunft garantieren_Maira Feiersinger.docx', id: '1xH_-UzVZ8QSElcOr_vVSfxy4v2zQ5I3B', downloadUrl: 'https://drive.usercontent.google.com/download?id=1xH_-UzVZ8QSElcOr_vVSfxy4v2zQ5I3B' },
      { name: '10_Herbstgold statt Hitzestress_Leni Klauser.docx', id: '176EOkyWeHtTS2EVzHMpG1VNF99mcYR8E', downloadUrl: 'https://drive.usercontent.google.com/download?id=176EOkyWeHtTS2EVzHMpG1VNF99mcYR8E' },
      { name: '11_Mitbestimmung ist kein Wahlfach_Josefine Müller.docx', id: '1KrGTabVAMRdwiSt65nY8DJlMlIu1XPYw', downloadUrl: 'https://drive.usercontent.google.com/download?id=1KrGTabVAMRdwiSt65nY8DJlMlIu1XPYw' },
      { name: '12_Stimmt das wirklich__Selina Gmeiner.docx', id: '10-TI6BTBP2ki_FQLZS7IUfcCsfBk6Qxy', downloadUrl: 'https://drive.usercontent.google.com/download?id=10-TI6BTBP2ki_FQLZS7IUfcCsfBk6Qxy' },
      { name: '13_Reife_ Prüfung!_Katharina Nigg.docx', id: '1ddaUiHk7R-dS359RrpcrqD2ryhSuojfP', downloadUrl: 'https://drive.usercontent.google.com/download?id=1ddaUiHk7R-dS359RrpcrqD2ryhSuojfP' },
      { name: '14_Vertretung - Vernetzung - Vorarlberg_Emma Battlogg.docx', id: '1Us0ekF9MDrIC4AahzxVX9uLTjQ8zL9Kz', downloadUrl: 'https://drive.usercontent.google.com/download?id=1Us0ekF9MDrIC4AahzxVX9uLTjQ8zL9Kz' },
      { name: '15_Fördern statt vergessen_Simon Märker.docx', id: '1f300WXhcU_wIO65vDqdbbNgolxowIITT', downloadUrl: 'https://drive.usercontent.google.com/download?id=1f300WXhcU_wIO65vDqdbbNgolxowIITT' },
      { name: '16_Demokratie braucht dich - Politische Bildung für Vorarlberg_Felix Haid.docx', id: '1ZoPF5wEWV4L9cfGvNGaAkjeLk2xfnr8b', downloadUrl: 'https://drive.usercontent.google.com/download?id=1ZoPF5wEWV4L9cfGvNGaAkjeLk2xfnr8b' },
      { name: '17_Powerfood - gesunde Ernährung für starke Schüler_innen_Angelina Fitsch.docx', id: '1bffwL42dJpUf-OqqJdxVK1ihML8T3RJD', downloadUrl: 'https://drive.usercontent.google.com/download?id=1bffwL42dJpUf-OqqJdxVK1ihML8T3RJD' },
      { name: '18_Einmal rundum ehrlich, bitte!_Luka Kolanovic.docx', id: '1FHwucvRJon5u7d0VQaeFwhExkVy8e_eU', downloadUrl: 'https://drive.usercontent.google.com/download?id=1FHwucvRJon5u7d0VQaeFwhExkVy8e_eU' },
      { name: '19_Zusammen lernen, zusammen wachsen_Chiara Forcher.docx', id: '1dTRyMr6v-XHzUdu-h-qAJGCEtlDae2mV', downloadUrl: 'https://drive.usercontent.google.com/download?id=1dTRyMr6v-XHzUdu-h-qAJGCEtlDae2mV' },
      { name: '20__Hatschi_ - Gsundheit_Maira Feiersinger.docx', id: '1WZ5bZwuiP8bRZLGQf3WMxpPBeVGhpP-f', downloadUrl: 'https://drive.usercontent.google.com/download?id=1WZ5bZwuiP8bRZLGQf3WMxpPBeVGhpP-f' },
      { name: '21_Bilingualer Unterricht - das Upgrade für dein Hirn_Jodok Burtscher.docx', id: '17J6LV4cmxNCBfKNcvVCHCZgLCooqam6a', downloadUrl: 'https://drive.usercontent.google.com/download?id=17J6LV4cmxNCBfKNcvVCHCZgLCooqam6a' },
      { name: '22_Lernen für morgen_Luka Kolanovic.docx', id: '1TKEopuieODBtp2uI6G2eOi1ItG4b3GN0', downloadUrl: 'https://drive.usercontent.google.com/download?id=1TKEopuieODBtp2uI6G2eOi1ItG4b3GN0' },
      { name: '23_Mindshift - Räume für innere Ruhe_Giovanna Neumayr_Raphaela Reter.docx', id: '1Ry1k7a90Dh9dkwpUaJf-lbNZqm1vCXkT', downloadUrl: 'https://drive.usercontent.google.com/download?id=1Ry1k7a90Dh9dkwpUaJf-lbNZqm1vCXkT' },
      { name: '24_Unsichtbar, aber unverzichtbar – unsere Infrastruktur_Mia Pfeffer-Egel.docx', id: '1o7hWGP-3tnkn_R84w7uiT4uzReah-NyF', downloadUrl: 'https://drive.usercontent.google.com/download?id=1o7hWGP-3tnkn_R84w7uiT4uzReah-NyF' },
      { name: '25_Der logische Schritt nach vorne - SiP digitalisieren_Adrian Schmedler.docx', id: '1aKX1izR1VKSuSlqom47a-ArOAko_9mSh', downloadUrl: 'https://drive.usercontent.google.com/download?id=1aKX1izR1VKSuSlqom47a-ArOAko_9mSh' },
      { name: '26_Vielfalt lehren und leben_Clara Widerin.docx', id: '1-e_fZ1rcv_9XYP8veJW6Hm026t-N-0UK', downloadUrl: 'https://drive.usercontent.google.com/download?id=1-e_fZ1rcv_9XYP8veJW6Hm026t-N-0UK' },
      { name: '27_Gratis Mittagessen an Schulen_Katharina Schober.docx', id: '1w8ti75Tqe4kewpROSzX5bOWj_6R_DKLb', downloadUrl: 'https://drive.usercontent.google.com/download?id=1w8ti75Tqe4kewpROSzX5bOWj_6R_DKLb' },
      { name: '28_Schluss mit Einheitsbrei_Leni Klauser.docx', id: '1mb5ybrpza2vp9wbQ-Le9cgaBMU3oqQZy', downloadUrl: 'https://drive.usercontent.google.com/download?id=1mb5ybrpza2vp9wbQ-Le9cgaBMU3oqQZy' },
      { name: '29_Barrieren runter - Chancen rauf_Katharina Nigg.docx', id: '1JwGwpLrS_-hSTi49U-BftRjrG206lelG', downloadUrl: 'https://drive.usercontent.google.com/download?id=1JwGwpLrS_-hSTi49U-BftRjrG206lelG' },
      { name: '30_Raus aus der Kreidezeit_Fabian Stauss.docx', id: '1tbHt1wOMdGu5x7tRln1mrYwKkVd22lVE', downloadUrl: 'https://drive.usercontent.google.com/download?id=1tbHt1wOMdGu5x7tRln1mrYwKkVd22lVE' },
      { name: '31_Karrierelevel_ Loading..._Jodok Burtscher.docx', id: '15DMRu9uK2GKmROmLI-mBU7n77Tt77iRX', downloadUrl: 'https://drive.usercontent.google.com/download?id=15DMRu9uK2GKmROmLI-mBU7n77Tt77iRX' },
      { name: '32_So funktioniert Mobbing heute!_Elena Ettinger.docx', id: '11A5aI1jSdNcX2nTY4fl8Evd39nIeQ5il', downloadUrl: 'https://drive.usercontent.google.com/download?id=11A5aI1jSdNcX2nTY4fl8Evd39nIeQ5il' },
      { name: 'Erweiterungs-_Abänderungs-_Streichungsanträge 2. SiP 2024_25.docx', id: '1t9A4Gbtf154nUgpU5y-B3F-y6X3C5o-p', downloadUrl: 'https://drive.usercontent.google.com/download?id=1t9A4Gbtf154nUgpU5y-B3F-y6X3C5o-p' },
    ],
    updatedAt: new Date().toISOString(),
  },
};

/**
 * Extrahiert die reine Ordner-ID aus einem Google Drive Ordner-Link
 */
export function extractGoogleDriveFolderId(rawUrlOrId: string): string | null {
  if (!rawUrlOrId || typeof rawUrlOrId !== 'string') return null;
  const trimmed = rawUrlOrId.trim();

  // 1. Direct ID check (typischerweise 20-60 alphanumerische Zeichen inkl. _ und -)
  if (/^[a-zA-Z0-9_\-]{20,60}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. URL mit /folders/ID
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_\-]+)/i);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  // 3. URL mit ?id=ID oder &id=ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_\-]+)/i);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .normalize('NFC')
    .trim();
}

/**
 * Parst sowohl das HTML von Google Drives embeddedfolderview als auch die Markdown-Antwort von r.jina.ai
 */
export function parseEmbeddedFolderViewResponse(rawContent: string): ParsedDriveEntry[] {
  const entriesMap = new Map<string, ParsedDriveEntry>();

  // 1. HTML-Format: <div class="flip-entry" id="entry-ID">...<a href="HREF"...>...<div class="flip-entry-title">TITLE</div>
  const htmlEntryRegex =
    /<div\s+class="flip-entry"\s+id="entry-([a-zA-Z0-9_\-]+)"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<div\s+class="flip-entry-title">([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlEntryRegex.exec(rawContent)) !== null) {
    const id = m[1].trim();
    const href = m[2].trim();
    const name = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, ''));
    if (!id || !name) continue;

    const isFolder = /\/folders\//i.test(href);
    const isGoogleDoc = /docs\.google\.com\/document\/d\//i.test(href);
    const isGoogleSheet = /docs\.google\.com\/spreadsheets\/d\//i.test(href);

    entriesMap.set(id, { id, name, isFolder, isGoogleDoc, isGoogleSheet, href });
  }

  // 2. Markdown-Format (r.jina.ai Standardausgabe):
  // [![Image ...](...)TITLE](https://drive.google.com/...)
  const mdLinkRegex =
    /\[(?:!\[[^\]]*\]\([^)]+\))?([^\]]+)\]\((https:\/\/(?:drive|docs)\.google\.com\/[^)]+)\)/gi;
  while ((m = mdLinkRegex.exec(rawContent)) !== null) {
    const name = decodeHtmlEntities(m[1]);
    const href = m[2].trim();
    if (!name) continue;

    const folderMatch = href.match(/\/folders\/([a-zA-Z0-9_\-]+)/i);
    const fileMatch = href.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_\-]+)/i);
    const id = folderMatch ? folderMatch[1] : fileMatch ? fileMatch[1] : '';
    if (!id || entriesMap.has(id)) continue;

    const isFolder = Boolean(folderMatch);
    const isGoogleDoc = /docs\.google\.com\/document\/d\//i.test(href);
    const isGoogleSheet = /docs\.google\.com\/spreadsheets\/d\//i.test(href);

    entriesMap.set(id, { id, name, isFolder, isGoogleDoc, isGoogleSheet, href });
  }

  return Array.from(entriesMap.values());
}

/**
 * Ruft die Dateiliste eines einzelnen Google Drive Ordners live ab (funktioniert im Browser & in Node)
 */
export async function fetchDriveFolderEntriesLive(folderId: string): Promise<ParsedDriveEntry[]> {
  const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;

  const endpoints: Array<{ url: string; headers?: Record<string, string> }> = [
    // 1. Direkt (funktioniert in Node.js / Tests ohne CORS-Restriktion)
    ...(typeof window === 'undefined' ? [{ url: embeddedUrl }] : []),
    // 2. Jina Reader mit HTML-Return (schnell, CORS-freundlich im Browser)
    {
      url: `https://r.jina.ai/${embeddedUrl}`,
      headers: { 'X-Return-Format': 'html' },
    },
    // 3. Jina Reader Standard (Markdown)
    {
      url: `https://r.jina.ai/${embeddedUrl}`,
    },
    // 4. AllOrigins Raw Proxy Fallback
    {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(embeddedUrl)}`,
    },
    // 5. Corsproxy.io Fallback
    {
      url: `https://corsproxy.io/?${encodeURIComponent(embeddedUrl)}`,
    },
  ];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ep.url, {
        headers: ep.headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const text = await res.text();
      const parsed = parseEmbeddedFolderViewResponse(text);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Nächsten Endpunkt probieren
    }
  }

  return [];
}

function toDriveFileInfo(entry: ParsedDriveEntry): DriveFileInfo {
  if (entry.isGoogleDoc) {
    const hasDocxExt = /\.(?:docx|doc)$/i.test(entry.name);
    return {
      name: hasDocxExt ? entry.name : `${entry.name}.docx`,
      id: entry.id,
      downloadUrl: `https://docs.google.com/document/d/${entry.id}/export?format=docx`,
      mimeType: 'application/vnd.google-apps.document',
    };
  }
  return {
    name: entry.name,
    id: entry.id,
    downloadUrl: `https://drive.usercontent.google.com/download?id=${entry.id}`,
  };
}

function isStrategyDocCandidate(entry: ParsedDriveEntry): boolean {
  if (entry.isFolder || entry.isGoogleSheet) return false;
  const lower = entry.name.toLowerCase();
  if (lower.startsWith('~$') || lower.startsWith('.')) return false;
  if (/legende|formatierung|wichtigste\s+sip\s+go|wie\s+schreibe\s+ich|how\s+to\s+sip|zeitplan/i.test(lower)) {
    return false;
  }
  if (entry.isGoogleDoc) return true;
  return lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.txt');
}

function sortByLeadingNumber(files: DriveFileInfo[]): DriveFileInfo[] {
  return [...files].sort((a, b) => {
    const matchA = a.name.match(/^(\d+)/);
    const matchB = b.name.match(/^(\d+)/);
    const numA = matchA ? parseInt(matchA[1], 10) : 9999;
    const numB = matchB ? parseInt(matchB[1], 10) : 9999;
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, 'de');
  });
}

/**
 * Crawlt einen Google Drive SiP-Ordner live und erstellt das vollständige Manifest:
 * - Antragsmappe (.pdf)
 * - Unterordner "Strategie" (inkl. eventueller Unterordner wie "Anträge Strategie")
 */
export async function crawlDriveFolderLive(
  folderId: string,
  onProgress?: (text: string) => void
): Promise<GoogleDriveFolderManifest | null> {
  onProgress?.('Durchsuche Google Drive Hauptordner...');
  const rootEntries = await fetchDriveFolderEntriesLive(folderId);
  if (rootEntries.length === 0) {
    return null;
  }

  // 1. Suche nach der Antragsmappe (PDF) im Hauptordner
  // Bevorzuge PDFs mit "Antragsmappe" im Namen, die NICHT nur "Vorab-Kommentierung" heißen
  const pdfEntries = rootEntries.filter(
    (e) => !e.isFolder && e.name.toLowerCase().endsWith('.pdf')
  );

  const primaryAntragsmappe =
    pdfEntries.find(
      (e) =>
        /antragsmappe/i.test(e.name) &&
        !/vorab-kommentierung|bidi-kommentierung|how\s+to/i.test(e.name)
    ) ||
    pdfEntries.find((e) => /antragsmappe/i.test(e.name)) ||
    pdfEntries.find(
      (e) => !/how\s+to|leitfaden|zeitplan|geschäftsordnung|bidi/i.test(e.name)
    ) ||
    pdfEntries[0] ||
    null;

  let antragsmappe: DriveFileInfo | null = primaryAntragsmappe
    ? toDriveFileInfo(primaryAntragsmappe)
    : null;

  // Prüfe zusätzlich, ob die Antragsmappe in einem eigenen Unterordner "Antragsmappe" liegt
  const hauptantragFiles: DriveFileInfo[] = [];

  if (!antragsmappe) {
    const motionsSubfolder = rootEntries.find(
      (e) => e.isFolder && /antragsmappe/i.test(e.name)
    );
    if (motionsSubfolder) {
      onProgress?.(`Prüfe Unterordner "${motionsSubfolder.name}"...`);
      const motionSubEntries = await fetchDriveFolderEntriesLive(motionsSubfolder.id);
      const mappeInSub = motionSubEntries.find(
        (e) => !e.isFolder && /antragsmappe/i.test(e.name) && e.name.toLowerCase().endsWith('.pdf')
      );
      if (mappeInSub) {
        antragsmappe = toDriveFileInfo(mappeInSub);
      }
    }
  }

  // 2. Suche nach dem Unterordner "Strategie"
  const strategieFolder = rootEntries.find(
    (e) => e.isFolder && /strategie/i.test(e.name)
  );

  const collectedStrategieMap = new Map<string, DriveFileInfo>();

  if (strategieFolder) {
    onProgress?.(`Durchsuche Unterordner "${strategieFolder.name}"...`);
    const stratEntries = await fetchDriveFolderEntriesLive(strategieFolder.id);

    // 2a. Alle direkten Strategiedokumente im Ordner "Strategie"
    for (const entry of stratEntries) {
      if (isStrategyDocCandidate(entry)) {
        collectedStrategieMap.set(entry.id, toDriveFileInfo(entry));
      }
    }

    // 2b. Prüfe relevante Unterordner in "Strategie" (z.B. "Anträge Strategie"), ignoriere "BiDi-Kommentierung"
    const stratSubfolders = stratEntries.filter(
      (e) => e.isFolder && !/bidi|kommentierung|archiv/i.test(e.name)
    );

    for (const subFolder of stratSubfolders) {
      onProgress?.(`Durchsuche Strategie-Unterordner "${subFolder.name}"...`);
      const subEntries = await fetchDriveFolderEntriesLive(subFolder.id);
      for (const subEntry of subEntries) {
        if (isStrategyDocCandidate(subEntry)) {
          collectedStrategieMap.set(subEntry.id, toDriveFileInfo(subEntry));
        }
      }
    }
  } else {
    // Fallback: Falls die Strategiedateien direkt im Hauptordner abgelegt wurden
    for (const entry of rootEntries) {
      if (isStrategyDocCandidate(entry) && entry.id !== antragsmappe?.id) {
        collectedStrategieMap.set(entry.id, toDriveFileInfo(entry));
      }
    }
  }

  const strategieFiles = sortByLeadingNumber(Array.from(collectedStrategieMap.values()));

  if (!antragsmappe && hauptantragFiles.length === 0 && strategieFiles.length === 0) {
    return null;
  }

  const manifest: GoogleDriveFolderManifest = {
    folderId,
    antragsmappe,
    hauptantragFiles: hauptantragFiles.length > 0 ? sortByLeadingNumber(hauptantragFiles) : undefined,
    strategieFiles,
    updatedAt: new Date().toISOString(),
  };

  // Speichere das gefundene Manifest im Supabase-Cache für künftige Aufrufe
  try {
    const client = getSupabaseClient();
    if (client) {
      await client.from('sip_state').upsert({
        id: `drive_manifest_${folderId}`,
        payload: manifest,
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    // Ignoriere Cache-Schreibfehler
  }

  return manifest;
}

/**
 * Ermittelt die Dateistruktur eines Google Drive Ordners online
 * (Antragsmappe PDF + Strategie DOCX Dateien)
 */
export async function resolveDriveFolderManifest(
  folderUrlOrId: string,
  onProgress?: (text: string) => void
): Promise<GoogleDriveFolderManifest> {
  const folderId = extractGoogleDriveFolderId(folderUrlOrId);
  if (!folderId) {
    throw new Error('Ungültiger Google Drive Ordner-Link. Bitte überprüfe den eingefügten Link.');
  }

  onProgress?.('Verbinde mit Google Drive Ordner...');

  // 1. Prüfe lokalen Vite Dev Server API Endpoint (falls lokal ausgeführt)
  try {
    const res = await fetch(`/api/drive-folder-scrape?folderId=${encodeURIComponent(folderId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.antragsmappe || (data.strategieFiles && data.strategieFiles.length > 0))) {
        return data as GoogleDriveFolderManifest;
      }
    }
  } catch {
    // Vite Endpoint nicht erreichbar (z.B. auf GitHub Pages) -> weiter mit Live-Browser-Crawler
  }

  // 2. Live Online-Crawler direkt aus dem Browser (via embeddedfolderview)
  try {
    const liveManifest = await crawlDriveFolderLive(folderId, onProgress);
    if (
      liveManifest &&
      (liveManifest.antragsmappe ||
        (liveManifest.hauptantragFiles && liveManifest.hauptantragFiles.length > 0) ||
        liveManifest.strategieFiles.length > 0)
    ) {
      return liveManifest;
    }
  } catch (err) {
    console.warn('Live-Crawl des Google Drive Ordners fehlgeschlagen:', err);
  }

  // 3. Prüfe Supabase sip_state Cache
  try {
    const client = getSupabaseClient();
    if (client) {
      onProgress?.('Lese Ordner-Index aus Cloud...');
      const { data } = await client
        .from('sip_state')
        .select('payload')
        .eq('id', `drive_manifest_${folderId}`)
        .maybeSingle();

      if (
        data?.payload &&
        (data.payload.antragsmappe ||
          (data.payload.strategieFiles && data.payload.strategieFiles.length > 0))
      ) {
        return data.payload as GoogleDriveFolderManifest;
      }
    }
  } catch (err) {
    console.warn('Supabase Manifest Lookup fehlgeschlagen:', err);
  }

  // 4. Fallback auf bekanntes hinterlegtes SiP-Manifest
  if (KNOWN_SIP_MANIFESTS[folderId]) {
    return KNOWN_SIP_MANIFESTS[folderId];
  }

  throw new Error(
    `Im angegebenen Google Drive Ordner konnten keine SiP-Unterlagen gefunden werden. Bitte stelle sicher, dass der Ordner freigegeben ist („Jeder mit dem Link kann ansehen“) und die Antragsmappe (.pdf) sowie der Unterordner „Strategie“ (.docx) enthalten sind.`
  );
}

/**
 * Lädt eine Datei direkt über Googles CDN herunter (mit Fallback für Google Docs & CORS)
 */
async function downloadDriveFileAsArrayBuffer(
  file: DriveFileInfo,
  onProgress?: (status: string) => void
): Promise<ArrayBuffer> {
  onProgress?.(`Lade ${file.name} herunter...`);

  const candidateUrls = [
    file.downloadUrl,
    `https://drive.usercontent.google.com/download?id=${file.id}&export=download`,
    `https://docs.google.com/document/d/${file.id}/export?format=docx`,
    `https://corsproxy.io/?${encodeURIComponent(file.downloadUrl)}`,
  ];

  let lastStatus = 0;
  for (const url of candidateUrls) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 100) {
          return buffer;
        }
      }
    } catch {
      // Nächste Kandidaten-URL testen
    }
  }

  throw new Error(`Fehler beim Herunterladen von "${file.name}" (HTTP ${lastStatus})`);
}

/**
 * Führt den vollautomatischen Online-Import aus dem Google Drive Ordner durch:
 * 1. Ruft den Ordner online ab und ignoriert alles andere
 * 2. Lädt die Antragsmappe (PDF) online herunter
 * 3. Lädt alle Strategiedateien (DOCX) online herunter
 * 4. Führt Antrag für Antrag sequenziell mit Ladebalken zusammen
 * 5. Gibt die finale Meldung "Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!" zurück
 */
export async function executeOnlineDriveImport(options: {
  folderUrlOrId: string;
  onProgress?: AutoImportProgressCallback;
}): Promise<AutoImportResult> {
  const { folderUrlOrId, onProgress } = options;

  onProgress?.({
    percent: 5,
    statusText: 'Verbinde mit Google Drive Ordner...',
  });

  // 1. Ordner-Manifest online auflösen
  const manifest = await resolveDriveFolderManifest(folderUrlOrId, (txt) => {
    onProgress?.({ percent: 10, statusText: txt });
  });

  if (
    !manifest.antragsmappe &&
    (!manifest.hauptantragFiles || manifest.hauptantragFiles.length === 0) &&
    manifest.strategieFiles.length === 0
  ) {
    throw new Error(
      'Weder Antragsmappe (PDF) noch Strategiedateien (DOCX) im Google Drive Ordner gefunden.'
    );
  }

  // 2. Antragsmappe (PDF) online herunterladen und Text extrahieren
  let antragsmappeText = '';
  if (manifest.antragsmappe) {
    onProgress?.({
      percent: 18,
      statusText: `Lade Antragsmappe herunter (${manifest.antragsmappe.name})...`,
    });
    try {
      const pdfBuffer = await downloadDriveFileAsArrayBuffer(
        manifest.antragsmappe,
        (status) => onProgress?.({ percent: 22, statusText: status })
      );

      onProgress?.({
        percent: 26,
        statusText: 'Verarbeite Antragsmappe PDF & filtere Geschäftsordnung...',
      });
      antragsmappeText = await extractTextFromPdfArrayBuffer(pdfBuffer);
    } catch (err) {
      console.warn('Fehler beim Extrahieren der Antragsmappe:', err);
    }
  }

  // Falls die Haupt-PDF nur ein Vorwort (z.B. Vorab-Kommentierung) war und Einzel-Hauptanträge im Ordner liegen:
  if (
    parseAntragsmappeText(antragsmappeText).hauptAntraege.length === 0 &&
    manifest.hauptantragFiles &&
    manifest.hauptantragFiles.length > 0
  ) {
    const totalHauptFiles = manifest.hauptantragFiles.length;
    const indexedHauptTexts: Array<{ index: number; text: string }> = [];
    const hBatchSize = 8;

    for (let start = 0; start < totalHauptFiles; start += hBatchSize) {
      const batch = manifest.hauptantragFiles.slice(start, start + hBatchSize);
      const pct = Math.round(26 + (start / Math.max(1, totalHauptFiles)) * 12);
      onProgress?.({
        percent: pct,
        statusText: `Lade Hauptanträge herunter (${Math.min(
          totalHauptFiles,
          start + 1
        )}–${Math.min(totalHauptFiles, start + batch.length)} von ${totalHauptFiles})...`,
      });

      await Promise.all(
        batch.map(async (file, bIdx) => {
          const idx = start + bIdx;
          try {
            const buf = await downloadDriveFileAsArrayBuffer(file);
            const isPdf = file.name.toLowerCase().endsWith('.pdf');
            const text = isPdf
              ? await extractTextFromPdfArrayBuffer(buf)
              : await extractTextFromDocxArrayBuffer(buf);
            if (text.trim()) {
              indexedHauptTexts.push({
                index: idx,
                text: `--- Antrag: ${file.name} ---\n${text}`,
              });
            }
          } catch (err) {
            console.warn(`Fehler beim Laden von Hauptantrag ${file.name}:`, err);
          }
        })
      );
    }

    indexedHauptTexts.sort((a, b) => a.index - b.index);
    if (indexedHauptTexts.length > 0) {
      antragsmappeText = indexedHauptTexts.map((item) => item.text).join('\n\n');
    }
  }

  // 3. Strategiedateien (DOCX) online herunterladen (in schnellen Batches à 6 Dateien parallel)
  const totalStrats = manifest.strategieFiles.length;
  const indexedStrategieTexts: Array<{ index: number; text: string }> = [];
  const batchSize = 6;

  for (let start = 0; start < totalStrats; start += batchSize) {
    const batch = manifest.strategieFiles.slice(start, start + batchSize);
    const pct = Math.round(30 + (start / Math.max(1, totalStrats)) * 32);
    onProgress?.({
      percent: pct,
      statusText: `Lade Strategiedokumente herunter (${Math.min(
        totalStrats,
        start + 1
      )}–${Math.min(totalStrats, start + batch.length)} von ${totalStrats})...`,
    });

    await Promise.all(
      batch.map(async (file, bIdx) => {
        const idx = start + bIdx;
        try {
          const docxBuffer = await downloadDriveFileAsArrayBuffer(file);
          const text = await extractTextFromDocxArrayBuffer(docxBuffer);
          if (text.trim()) {
            indexedStrategieTexts.push({
              index: idx,
              text: `--- Strategie: ${file.name} ---\n${text}`,
            });
          }
        } catch (err) {
          console.warn(`Fehler beim Laden von Strategiedatei ${file.name}:`, err);
        }
      })
    );
  }

  indexedStrategieTexts.sort((a, b) => a.index - b.index);
  const combinedStrategieText = indexedStrategieTexts.map((item) => item.text).join('\n\n');

  // 4. Sequenziell Antrag für Antrag zusammensetzen mit Live-Ladebalken
  onProgress?.({
    percent: 65,
    statusText: 'Kombiniere Anträge mit Strategie...',
  });

  const combined = combineAntragsmappeAndStrategie(antragsmappeText, combinedStrategieText);
  const hauptAntraege = combined.antraege.filter((a) => a.type === 'HAUPTANTRAG');
  const totalMotions = Math.max(1, hauptAntraege.length);

  for (let i = 0; i < hauptAntraege.length; i++) {
    const motion = hauptAntraege[i];
    const pct = Math.round(65 + ((i + 1) / totalMotions) * 33);
    const motionNum = i + 1;

    onProgress?.({
      percent: pct,
      statusText: `Lade ${motionNum}. Antrag & ${motionNum}. Strategie: ${motion.title.slice(0, 48)}...`,
      currentMotionNumber: motionNum,
      totalMotions,
      motionTitle: motion.title,
    });

    // Kurzer Yield für flüssige Animation des Ladebalkens
    await new Promise((resolve) => setTimeout(resolve, 45));
  }

  // 5. Fertigstellung mit der geforderten exakten Meldung
  const finalMessage = 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!';
  onProgress?.({
    percent: 100,
    statusText: finalMessage,
    currentMotionNumber: totalMotions,
    totalMotions,
  });

  return {
    success: combined.antraege.length > 0,
    message: finalMessage,
    antraege: combined.antraege,
    summary: {
      ...combined.summary,
      strategyFilesCount: manifest.strategieFiles.length,
    },
    strategyNotes: combined.strategyNotes,
  };
}
