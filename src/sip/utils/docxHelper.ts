import mammoth from 'mammoth';

export async function extractTextFromDocxArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const options: any = { arrayBuffer: buffer };
  if (typeof Buffer !== 'undefined') {
    options.buffer = Buffer.from(buffer);
  }
  const result = await mammoth.extractRawText(options);
  return (result.value || '').normalize('NFC');
}
