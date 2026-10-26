import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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

function extractItems(html: string) {
  const items: Array<{ name: string; id: string; isFolder: boolean }> = [];
  const regex = /aria-label="([^"]+)"[^>]*ssk='5:auSv138:([a-zA-Z0-9_\-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const rawLabel = m[1];
    let id = m[2].replace(/-\d+-\d+$/, '');
    const isFolder = /folder/i.test(rawLabel);
    const cleanName = rawLabel
      .replace(
        /\s+(?:Shared\s+folder|PDF(?:\s+Shared)?|Microsoft\s+(?:Word|Excel)(?:\s+Shared)?)$/i,
        ''
      )
      .trim();
    items.push({ name: cleanName, id, isFolder });
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

          // Folder ID extrahieren falls ganze URL übergeben wurde
          const match = folderId.match(/\/folders\/([a-zA-Z0-9_\-]+)/i);
          if (match && match[1]) folderId = match[1];

          const rootUrl = `https://drive.google.com/drive/folders/${folderId}`;
          const rootHtml = await fetchHtml(rootUrl);
          const rootItems = extractItems(rootHtml);

          // 1. Antragsmappe PDF
          const pdfItem =
            rootItems.find(
              (i) => !i.isFolder && /antragsmappe/i.test(i.name) && i.name.endsWith('.pdf')
            ) || rootItems.find((i) => !i.isFolder && i.name.endsWith('.pdf'));

          // 2. Strategie Ordner
          const stratFolder = rootItems.find((i) => i.isFolder && /strategie/i.test(i.name));
          let docxItems: Array<{ name: string; id: string; isFolder: boolean }> = [];

          if (stratFolder) {
            const stratHtml = await fetchHtml(
              `https://drive.google.com/drive/folders/${stratFolder.id}`
            );
            const stratItems = extractItems(stratHtml);
            const antraegeSub = stratItems.find(
              (i) => i.isFolder && /antr.*strategie/i.test(i.name)
            );

            if (antraegeSub) {
              const subHtml = await fetchHtml(
                `https://drive.google.com/drive/folders/${antraegeSub.id}`
              );
              const subItems = extractItems(subHtml);
              docxItems = subItems.filter(
                (i) => !i.isFolder && (i.name.endsWith('.docx') || i.name.endsWith('.doc'))
              );
            } else {
              docxItems = stratItems.filter(
                (i) =>
                  !i.isFolder &&
                  (i.name.endsWith('.docx') || i.name.endsWith('.doc')) &&
                  !/formatierung|erweiterung/i.test(i.name)
              );
            }
          }

          docxItems.sort((a, b) => {
            const numA = parseInt((a.name.match(/\d+/) || [0])[0], 10);
            const numB = parseInt((b.name.match(/\d+/) || [0])[0], 10);
            return numA - numB;
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
              name: d.name,
              id: d.id,
              downloadUrl: `https://drive.usercontent.google.com/download?id=${d.id}`,
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
