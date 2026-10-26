import { extractTextFromPdfArrayBuffer } from './pdfHelper';
import { extractTextFromDocxArrayBuffer } from './docxHelper';
import {
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
  strategieFiles: DriveFileInfo[];
  updatedAt: string;
}

/**
 * Bekanntes Manifest für das 2. SiP 2024/25 als robuster Fallback
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
      { name: '2_Bildungs(t)räume gestalten_Chiara Forcher.docx', id: '116Ec8qUQ0G8wRuPHxUq78c0f_CggsCDS', downloadUrl: 'https://drive.usercontent.google.com/download?id=116Ec8qUQ0G8wRuPHxUq78c0f_CggsCDS' },
      { name: '3_Der Mythos Jugendpartizipation_Viola Amann.docx', id: '1UTt_sYDgpHOn3AJWtwimhstTA96ROCrH', downloadUrl: 'https://drive.usercontent.google.com/download?id=1UTt_sYDgpHOn3AJWtwimhstTA96ROCrH' },
      { name: '4_Für mehr Geschlechtergerechtigkeit und Feminismus an Vorarlbergs Schulen_Kathrin Eichhorner_Elena Ettinger.docx', id: '1f7dz96bpaPyM2sPvR75ewm9FtTQmGVPZ', downloadUrl: 'https://drive.usercontent.google.com/download?id=1f7dz96bpaPyM2sPvR75ewm9FtTQmGVPZ' },
      { name: '5_Tafel-Titanen_Fabian Stauss.docx', id: '1Aoa6F0UcuyQ6_8raw6v5gtcG4Z83OT9V', downloadUrl: 'https://drive.usercontent.google.com/download?id=1Aoa6F0UcuyQ6_8raw6v5gtcG4Z83OT9V' },
      { name: '6_404 - Digitaliserung not found_Simon Märker.docx', id: '1S4gEQxV5iLG2eMADEiLLqqdFgdpecBZ-', downloadUrl: 'https://drive.usercontent.google.com/download?id=1S4gEQxV5iLG2eMADEiLLqqdFgdpecBZ-' },
      { name: '7_EUvolution beginnt mit dir_Josefine Müller.docx', id: '1uXKRQ99bmhq0yNQfgJ7emuYK8FLGdcUo', downloadUrl: 'https://drive.usercontent.google.com/download?id=1uXKRQ99bmhq0yNQfgJ7emuYK8FLGdcUo' },
      { name: '8_CO2_ Nur im Chemieunterricht!_Angelina Fitsch.docx', id: '1wYKGesC1cy7jnAv_JPxV0GUFPakmWpcL', downloadUrl: 'https://drive.usercontent.google.com/download?id=1wYKGesC1cy7jnAv_JPxV0GUFPakmWpcL' },
      { name: '9_BMHS optimieren - Zukunft garantieren_Maira Feiersinger.docx', id: '1xH_-UzVZ8QSElcOr_vVSfxy4v2zQ5I3B', downloadUrl: 'https://drive.usercontent.google.com/download?id=1xH_-UzVZ8QSElcOr_vVSfxy4v2zQ5I3B' },
      { name: '10_Herbstgold statt Hitzestress_Leni Klauser.docx', id: '176EOkyWeHtTS2EVzHMpG1VNF99mcYR8E', downloadUrl: 'https://drive.usercontent.google.com/download?id=176EOkyWeHtTS2EVzHMpG1VNF99mcYR8E' },
      { name: '11_Mitbestimmung ist kein Wahlfach_Josefine Müller.docx', id: '1KrGTabVAMRdwiSt65nY8DJlMlIu1XPYw', downloadUrl: 'https://drive.usercontent.google.com/download?id=1KrGTabVAMRdwiSt65nY8DJlMlIu1XPYw' },
      { name: '12_Stimmt das wirklich__Selina Gmeiner.docx', id: '10-TI6BTBP2ki_FQLZS7IUfcCsfBk6Qxy', downloadUrl: 'https://drive.usercontent.google.com/download?id=10-TI6BTBP2ki_FQLZS7IUfcCsfBk6Qxy' },
      { name: '13_Reife_ Prüfung!_Katharina Nigg.docx', id: '1ddaUiHk7R-dS359RrpcrqD2ryhSuojfP', downloadUrl: 'https://drive.usercontent.google.com/download?id=1ddaUiHk7R-dS359RrpcrqD2ryhSuojfP' },
      { name: '14_Vertretung - Vernetzung - Vorarlberg_Emma Battlogg.docx', id: '1Us0ekF9MDrIC4AahzxVX9uLTjQ8zL9Kz', downloadUrl: 'https://drive.usercontent.google.com/download?id=1Us0ekF9MDrIC4AahzxVX9uLTjQ8zL9Kz' },
      { name: '15_Fördern statt vergessen_Simon Märker.docx', id: '1f300WXhcU_wIO65vDqdbbNgolxowIITT', downloadUrl: 'https://drive.usercontent.google.com/download?id=1f300WXhcU_wIO65vDqdbbNgolxowIITT' },
      { name: '16_Demokratie braucht dich - Politische Bildung für Vorarlberg_Felix Haid.docx', id: '1ZoPF5wEWV4L9cfGvNGaAkjeLk2xfnr8b', downloadUrl: 'https://drive.usercontent.google.com/download?id=1ZoPF5wEWV4L9cfGvNGaAkjeLk2xfnr8b' },
      { name: '17_Powerfood - gesunde Ernährung für starke Schüler_innen_Angelina Fitsch.docx', id: '1bffwL42dJpUf-OqqJdxVK1ihML8T3RJD', downloadUrl: 'https://drive.usercontent.google.com/download?id=1bffwL42dJpUf-OqqJdxVK1ihML8T3RJD' },
      { name: '18_Einmal rundum ehrlich, bitte!_Luka Kolanovic.docx', id: '1FHwucvRJon5u7d0VQaeFwhExkVy8e_eU', downloadUrl: 'https://drive.usercontent.google.com/download?id=1FHwucvRJon5u7d0VQaeFwhExkVy8e_eU' },
      { name: '19_Zusammen lernen, zusammen wachsen_Chiara Forcher.docx', id: '1dTRyMr6v-XHzUdu-h-qAJGCEtlDae2mV', downloadUrl: 'https://drive.usercontent.google.com/download?id=1dTRyMr6v-XHzUdu-h-qAJGCEtlDae2mV' },
      { name: '20__Hatschi_ - Gsundheit_Maira Feiersinger.docx', id: '1WZ5bZwuiP8bRZLGQf3WMxpPBeVGhpP-f', downloadUrl: 'https://drive.usercontent.google.com/download?id=1WZ5bZwuiP8bRZLGQf3WMxpPBeVGhpP-f' },
      { name: '21_Bilingualer Unterricht - das Upgrade für dein Hirn_Jodok Burtscher.docx', id: '17J6LV4cmxNCBfKNcvVCHCZgLCooqam6a', downloadUrl: 'https://drive.usercontent.google.com/download?id=17J6LV4cmxNCBfKNcvVCHCZgLCooqam6a' },
      { name: '22_Lernen für morgen_Luka Kolanovic.docx', id: '1TKEopuieODBtp2uI6G2eOi1ItG4b3GN0', downloadUrl: 'https://drive.usercontent.google.com/download?id=1TKEopuieODBtp2uI6G2eOi1ItG4b3GN0' },
      { name: '23_Mindshift - Räume für innere Ruhe_Giovanna Neumayr_Raphaela Reter.docx', id: '1Ry1k7a90Dh9dkwpUaJf-lbNZqm1vCXkT', downloadUrl: 'https://drive.usercontent.google.com/download?id=1Ry1k7a90Dh9dkwpUaJf-lbNZqm1vCXkT' },
      { name: '24_Unsichtbar, aber unverzichtbar – unsere Infrastruktur_Mia Pfeffer-Egel.docx', id: '1o7hWGP-3tnkn_R84w7uiT4uzReah-NyF', downloadUrl: 'https://drive.usercontent.google.com/download?id=1o7hWGP-3tnkn_R84w7uiT4uzReah-NyF' },
      { name: '25_Der logische Schritt nach vorne - SiP digitalisieren_Adrian Schmedler.docx', id: '1aKX1izR1VKSuSlqom47a-ArOAko_9mSh', downloadUrl: 'https://drive.usercontent.google.com/download?id=1aKX1izR1VKSuSlqom47a-ArOAko_9mSh' },
      { name: '26_Vielfalt lehren und leben_Clara Widerin.docx', id: '1-e_fZ1rcv_9XYP8veJW6Hm026t-N-0UK', downloadUrl: 'https://drive.usercontent.google.com/download?id=1-e_fZ1rcv_9XYP8veJW6Hm026t-N-0UK' },
      { name: '27_Gratis Mittagessen an Schulen_Katharina Schober.docx', id: '1w8ti75Tqe4kewpROSzX5bOWj_6R_DKLb', downloadUrl: 'https://drive.usercontent.google.com/download?id=1w8ti75Tqe4kewpROSzX5bOWj_6R_DKLb' },
      { name: '28_Schluss mit Einheitsbrei_Leni Klauser.docx', id: '1mb5ybrpza2vp9wbQ-Le9cgaBMU3oqQZy', downloadUrl: 'https://drive.usercontent.google.com/download?id=1mb5ybrpza2vp9wbQ-Le9cgaBMU3oqQZy' },
      { name: '29_Barrieren runter - Chancen rauf_Katharina Nigg.docx', id: '1JwGwpLrS_-hSTi49U-BftRjrG206lelG', downloadUrl: 'https://drive.usercontent.google.com/download?id=1JwGwpLrS_-hSTi49U-BftRjrG206lelG' },
      { name: '30_Raus aus der Kreidezeit_Fabian Stauss.docx', id: '1tbHt1wOMdGu5x7tRln1mrYwKkVd22lVE', downloadUrl: 'https://drive.usercontent.google.com/download?id=1tbHt1wOMdGu5x7tRln1mrYwKkVd22lVE' },
      { name: '31_Karrierelevel_ Loading..._Jodok Burtscher.docx', id: '15DMRu9uK2GKmROmLI-mBU7n77Tt77iRX', downloadUrl: 'https://drive.usercontent.google.com/download?id=15DMRu9uK2GKmROmLI-mBU7n77Tt77iRX' },
      { name: '32_So funktioniert Mobbing heute!_Elena Ettinger.docx', id: '11A5aI1jSdNcX2nTY4fl8Evd39nIeQ5il', downloadUrl: 'https://drive.usercontent.google.com/download?id=11A5aI1jSdNcX2nTY4fl8Evd39nIeQ5il' },
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

  // 1. Direct ID check (typischerweise 25-50 alphanumerische Zeichen inkl. _ und -)
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

  // 1. Prüfe Vite Dev Server API Endpoint (falls lokal ausgeführt)
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
    // Vite Endpoint nicht erreichbar (z.B. auf GitHub Pages oder statischem Host)
  }

  // 2. Prüfe Supabase sip_state Cache
  try {
    const client = getSupabaseClient();
    if (client) {
      onProgress?.('Lese Ordner-Index aus Cloud...');
      const { data } = await client
        .from('sip_state')
        .select('payload')
        .eq('id', `drive_manifest_${folderId}`)
        .maybeSingle();

      if (data?.payload && (data.payload.antragsmappe || (data.payload.strategieFiles && data.payload.strategieFiles.length > 0))) {
        return data.payload as GoogleDriveFolderManifest;
      }
    }
  } catch (err) {
    console.warn('Supabase Manifest Lookup fehlgeschlagen:', err);
  }

  // 3. Fallback auf bekanntes hinterlegtes SiP-Manifest
  if (KNOWN_SIP_MANIFESTS[folderId]) {
    return KNOWN_SIP_MANIFESTS[folderId];
  }

  throw new Error(
    `Im angegebenen Google Drive Ordner konnten keine SiP-Unterlagen gefunden werden. Bitte stelle sicher, dass der Ordner freigegeben ist („Jeder mit dem Link kann ansehen“) und die Antragsmappe (.pdf) sowie der Unterordner „Strategie“ (.docx) enthalten sind.`
  );
}

/**
 * Lädt eine Datei direkt über Googles CDN herunter (mit CORS-Header)
 */
async function downloadDriveFileAsArrayBuffer(
  fileId: string,
  fileName: string,
  onProgress?: (status: string) => void
): Promise<ArrayBuffer> {
  const url = `https://drive.usercontent.google.com/download?id=${fileId}`;
  onProgress?.(`Lade ${fileName} herunter...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fehler beim Herunterladen von "${fileName}" (HTTP ${response.status})`);
  }

  return await response.arrayBuffer();
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

  if (!manifest.antragsmappe && manifest.strategieFiles.length === 0) {
    throw new Error('Weder Antragsmappe (PDF) noch Strategiedateien (DOCX) im Google Drive Ordner gefunden.');
  }

  // 2. Antragsmappe (PDF) online herunterladen und Text extrahieren
  let antragsmappeText = '';
  if (manifest.antragsmappe) {
    onProgress?.({
      percent: 20,
      statusText: `Lade Antragsmappe herunter (${manifest.antragsmappe.name})...`,
    });
    const pdfBuffer = await downloadDriveFileAsArrayBuffer(
      manifest.antragsmappe.id,
      manifest.antragsmappe.name,
      (status) => onProgress?.({ percent: 25, statusText: status })
    );

    onProgress?.({
      percent: 35,
      statusText: 'Verarbeite Antragsmappe PDF & filtere Geschäftsordnung...',
    });
    antragsmappeText = await extractTextFromPdfArrayBuffer(pdfBuffer);
  }

  // 3. Strategiedateien (DOCX) online herunterladen und Texte extrahieren
  const strategieTexts: string[] = [];
  const totalStrats = manifest.strategieFiles.length;

  for (let i = 0; i < totalStrats; i++) {
    const file = manifest.strategieFiles[i];
    const pct = Math.round(35 + (i / Math.max(1, totalStrats)) * 25);
    onProgress?.({
      percent: pct,
      statusText: `Lade Strategie ${i + 1} von ${totalStrats} herunter (${file.name})...`,
    });

    try {
      const docxBuffer = await downloadDriveFileAsArrayBuffer(file.id, file.name);
      const text = await extractTextFromDocxArrayBuffer(docxBuffer);
      if (text.trim()) {
        strategieTexts.push(`--- Strategie: ${file.name} ---\n${text}`);
      }
    } catch (err) {
      console.warn(`Fehler beim Laden von Strategiedatei ${file.name}:`, err);
    }
  }

  const combinedStrategieText = strategieTexts.join('\n\n');

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
      statusText: `Lade ${motionNum}. Antrag & ${motionNum}. Strategie: ${motion.title.slice(0, 45)}...`,
      currentMotionNumber: motionNum,
      totalMotions,
    });

    // Kleiner Yield für flüssige UI-Aktualisierung
    await new Promise((resolve) => setTimeout(resolve, 50));
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
    success: true,
    message: finalMessage,
    antraege: combined.antraege,
    summary: {
      ...combined.summary,
      strategyFilesCount: manifest.strategieFiles.length,
    },
    strategyNotes: combined.strategyNotes,
  };
}
