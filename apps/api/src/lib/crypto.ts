/**
 * Symmetric encryption for secrets at rest (Google OAuth tokens in D1).
 *
 * AES-256-GCM via Web Crypto. The key is `TOKEN_ENCRYPTION_KEY` — a base64
 * encoding of exactly 32 random bytes. Ciphertext is stored as
 * base64(iv ‖ ciphertext+tag); a fresh 12-byte IV is generated per encryption.
 */

const IV_BYTES = 12;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyB64);
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be base64 of exactly 32 bytes (AES-256).");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a UTF-8 string, returning base64(iv ‖ ciphertext+tag). */
export async function encryptSecret(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return bytesToBase64(combined);
}

/** Decrypt a value produced by {@link encryptSecret}. */
export async function decryptSecret(payloadB64: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const combined = base64ToBytes(payloadB64);
  const iv = combined.subarray(0, IV_BYTES);
  const ciphertext = combined.subarray(IV_BYTES);

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
