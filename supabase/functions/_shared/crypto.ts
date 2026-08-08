// AES-256-GCM encrypt/decrypt for OAuth tokens at rest. Used only inside
// edge functions — the client never sees a raw or decrypted token.
//
// INTEGRATIONS_ENCRYPTION_KEY must be a 32-byte key, base64-encoded.
// Generate one with: openssl rand -base64 32

const enc = new TextEncoder();
const dec = new TextDecoder();

async function importKey(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('INTEGRATIONS_ENCRYPTION_KEY') ?? '';
  if (!keyB64) throw new Error('INTEGRATIONS_ENCRYPTION_KEY is not configured');
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Stored form is base64(iv || ciphertext) — a single text column, no
// separate iv column to manage.
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toB64(combined);
}

export async function decryptSecret(stored: string): Promise<string> {
  const key = await importKey();
  const combined = fromB64(stored);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return dec.decode(plaintext);
}
