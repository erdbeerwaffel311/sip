/**
 * RFC 6238 TOTP (Time-based One-Time Password) Implementation
 * Verwendet standardisiertes Web Crypto API (HMAC-SHA1, 30s Zeitfenster, 6 Ziffern).
 * 100% kompatibel mit Google Authenticator, Apple Passwörter / Schlüsselbund, Microsoft Authenticator, 1Password etc.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length: number = 32): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[randomBytes[i] % 32];
  }
  return secret;
}

export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export function getTotpUri(
  secret: string,
  accountName: string = 'Admin',
  issuer: string = 'SiP Parlament'
): string {
  const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  return `otpauth://totp/${label}?secret=${cleanSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function base32ToUint8Array(base32: string): Uint8Array {
  const clean = base32.replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export async function generateTotpCode(
  secret: string,
  timestampMs: number = Date.now()
): Promise<string> {
  const timeStep = Math.floor(timestampMs / 1000 / 30);
  const keyBytes = base32ToUint8Array(secret);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const msg = new Uint8Array(8);
  let temp = timeStep;
  for (let i = 7; i >= 0; i--) {
    msg[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const hmacSig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  const hmacBytes = new Uint8Array(hmacSig);

  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export async function verifyTotpCode(
  secret: string,
  candidateCode: string,
  windowSteps: number = 1
): Promise<boolean> {
  const cleanCandidate = candidateCode.replace(/\s+/g, '').trim();
  if (!cleanCandidate || cleanCandidate.length !== 6) return false;

  const now = Date.now();
  // Prüfe aktuelles Zeitfenster und ±1 Fenster (30s Kulanz für leichte Uhrenabweichungen)
  for (let stepOffset = -windowSteps; stepOffset <= windowSteps; stepOffset++) {
    const testTime = now + stepOffset * 30 * 1000;
    try {
      const expectedCode = await generateTotpCode(secret, testTime);
      if (expectedCode === cleanCandidate) {
        return true;
      }
    } catch (_err) {
      // Weiter
    }
  }

  return false;
}

/**
 * Generiert eine Liste von sicheren, einmaligen Notfall- / Ersatzcodes (Standard: 10 Codes im Format XXXX-XXXX).
 * Verwendet cryptographically secure random values und schließt verwechslungsanfällige Zeichen (0, O, I, 1) aus.
 */
export function generateBackupCodes(count: number = 10): string[] {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const codes: string[] = [];
  const existing = new Set<string>();

  while (codes.length < count) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let str = '';
    for (let i = 0; i < 8; i++) {
      str += chars[bytes[i] % chars.length];
    }
    const formatted = `${str.slice(0, 4)}-${str.slice(4)}`;
    if (!existing.has(formatted)) {
      existing.add(formatted);
      codes.push(formatted);
    }
  }

  return codes;
}

/**
 * Bereinigt einen eingegebenen Notfallcode von Bindestrichen, Leerzeichen etc. und wandelt in Großbuchstaben um.
 */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Überprüft einen Notfallcode gegen die Liste vorhandener Codes.
 * Bei Treffer wird der gefundene Code konsumiert (aus der Liste entfernt),
 * sodass jeder Notfallcode exakt 1x gültig ist.
 */
export function verifyAndConsumeBackupCode(
  candidateCode: string,
  backupCodes: string[] = []
): { valid: boolean; remainingCodes: string[]; usedCode?: string } {
  const cleanCandidate = normalizeBackupCode(candidateCode);
  if (!cleanCandidate || cleanCandidate.length < 6) {
    return { valid: false, remainingCodes: backupCodes };
  }

  const matchIndex = backupCodes.findIndex(
    (code) => normalizeBackupCode(code) === cleanCandidate
  );

  if (matchIndex === -1) {
    return { valid: false, remainingCodes: backupCodes };
  }

  const usedCode = backupCodes[matchIndex];
  const remainingCodes = backupCodes.filter((_, idx) => idx !== matchIndex);
  return { valid: true, remainingCodes, usedCode };
}

/**
 * Erstellt eine Textdatei zum Herunterladen der Notfallcodes
 */
export function downloadBackupCodesTxt(codes: string[], clubName: string = 'SiP-Parlament') {
  const content = [
    `======================================================`,
    `NOTFALLCODES / ERSATZCODES FÜR DEN ADMIN-ZUGANG`,
    `${clubName} - Schüler:innenparlament`,
    `Erstellt am: ${new Date().toLocaleString('de-AT')}`,
    `======================================================`,
    ``,
    `ANWEISUNGEN:`,
    `- Jeder dieser 10 Codes kann genau EINMAL verwendet werden,`,
    `  falls du dein Smartphone verlierst oder die Authenticator-App`,
    `  nicht verfügbar ist.`,
    `- Bewahre diese Liste sicher auf (z. B. ausdrucken oder im`,
    `  Passwort-Manager speichern).`,
    ``,
    `DEINE 10 NOTFALLCODES:`,
    ...codes.map((c, i) => `  [${(i + 1).toString().padStart(2, ' ')}]  ${c}`),
    ``,
    `======================================================`,
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notfallcodes-sip-admin-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
