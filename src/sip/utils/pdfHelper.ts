import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
  }
}

export async function extractTextFromPdfArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      const hasEOL = Boolean('hasEOL' in item && item.hasEOL);
      const currentY = Array.isArray(item.transform) ? item.transform[5] : null;

      if (!str && !hasEOL) continue;

      // Wenn die Y-Position sich merklich ändert (> 4 Punkte) oder hasEOL gesetzt ist: Zeilenumbruch
      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 4) {
        if (!pageText.endsWith('\n')) {
          pageText += '\n';
        }
      } else if (
        pageText.length > 0 &&
        !pageText.endsWith('\n') &&
        !pageText.endsWith(' ') &&
        !str.startsWith(' ')
      ) {
        pageText += ' ';
      }

      pageText += str;

      if (hasEOL && !pageText.endsWith('\n')) {
        pageText += '\n';
      }

      if (currentY !== null) {
        lastY = currentY;
      }
    }

    fullText += `\n\n--- SEITE ${i} ---\n` + pageText.trim() + '\n';
  }

  return fullText;
}
