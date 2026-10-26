import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import https from 'node:https';

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve, reject);
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
  });
}

function extractEmbeddedItems(html: string) {
  const items: Array<{ name: string; id: string; isFolder: boolean; isGoogleDoc: boolean }> = [];
  const regex =
    /<div\s+class="flip-entry"\s+id="entry-([a-zA-Z0-9_\-]+)"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<div\s+class="flip-entry-title">([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1].trim();
    const href = m[2].trim();
    const name = m[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .normalize('NFC')
      .trim();
    const isFolder = /\/folders\//i.test(href);
    const isGoogleDoc = /docs\.google\.com\/document\/d\//i.test(href);
    items.push({ name, id, isFolder, isGoogleDoc });
  }
  return items;
}

function driveFolderCrawlerPlugin(): Plugin {
  return {
    name: 'drive-folder-crawler-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/drive-folder-scrape')) {
          return next();
        }

        try {
          const urlObj = new URL(req.url, 'http://localhost');
          let folderId = urlObj.searchParams.get('folderId') || '';
          if (!folderId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing folderId parameter' }));
            return;
          }

          const match = folderId.match(/\/folders\/([a-zA-Z0-9_\-]+)/i);
          if (match && match[1]) folderId = match[1];

          const rootHtml = await fetchHtml(
            `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`
          );
          const rootItems = extractEmbeddedItems(rootHtml);

          // 1. Antragsmappe PDF
          const pdfItem =
            rootItems.find(
              (i) =>
                !i.isFolder &&
                /antragsmappe/i.test(i.name) &&
                !/vorab-kommentierung|bidi/i.test(i.name) &&
                i.name.toLowerCase().endsWith('.pdf')
            ) ||
            rootItems.find(
              (i) => !i.isFolder && /antragsmappe/i.test(i.name) && i.name.toLowerCase().endsWith('.pdf')
            ) ||
            rootItems.find((i) => !i.isFolder && i.name.toLowerCase().endsWith('.pdf'));

          // 2. Strategie Ordner
          const stratFolder = rootItems.find((i) => i.isFolder && /strategie/i.test(i.name));
          const docxMap = new Map<string, { name: string; id: string; isGoogleDoc: boolean }>();

          const isStratFile = (i: { name: string; isFolder: boolean; isGoogleDoc: boolean }) => {
            if (i.isFolder) return false;
            const lower = i.name.toLowerCase();
            if (/legende|formatierung|wichtigste\s+sip\s+go|how\s+to/i.test(lower)) return false;
            return i.isGoogleDoc || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.txt');
          };

          if (stratFolder) {
            const stratHtml = await fetchHtml(
              `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(stratFolder.id)}`
            );
            const stratItems = extractEmbeddedItems(stratHtml);

            for (const item of stratItems) {
              if (isStratFile(item)) {
                docxMap.set(item.id, item);
              }
            }

            const subFolders = stratItems.filter(
              (i) => i.isFolder && !/bidi|kommentierung|archiv/i.test(i.name)
            );
            for (const sub of subFolders) {
              const subHtml = await fetchHtml(
                `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(sub.id)}`
              );
              const subItems = extractEmbeddedItems(subHtml);
              for (const subItem of subItems) {
                if (isStratFile(subItem)) {
                  docxMap.set(subItem.id, subItem);
                }
              }
            }
          }

          const docxItems = Array.from(docxMap.values()).sort((a, b) => {
            const numA = parseInt((a.name.match(/^(\d+)/) || ['9999'])[0], 10);
            const numB = parseInt((b.name.match(/^(\d+)/) || ['9999'])[0], 10);
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name, 'de');
          });

          const manifest = {
            folderId,
            antragsmappe: pdfItem
              ? {
                  name: pdfItem.name,
                  id: pdfItem.id,
                  downloadUrl: `https://drive.usercontent.google.com/download?id=${pdfItem.id}`,
                }
              : null,
            strategieFiles: docxItems.map((d) => ({
              name: d.isGoogleDoc && !/\.(?:docx|doc)$/i.test(d.name) ? `${d.name}.docx` : d.name,
              id: d.id,
              downloadUrl: d.isGoogleDoc
                ? `https://docs.google.com/document/d/${d.id}/export?format=docx`
                : `https://drive.usercontent.google.com/download?id=${d.id}`,
            })),
            updatedAt: new Date().toISOString(),
          };

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(manifest));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Internal crawler error' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), driveFolderCrawlerPlugin()],
  server: {
    port: 5174,
    host: true,
  },
});
