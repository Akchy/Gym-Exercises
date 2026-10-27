/**
 * Client-side encryption for everything the app stores.
 *
 * - Key derivation: PBKDF2-HMAC-SHA-256 with a random 128-bit salt.
 *   The default iteration count follows the OWASP recommendation (600k).
 * - Encryption: AES-256-GCM (authenticated) with a fresh random 96-bit IV per write.
 * - The passphrase and the raw key never leave memory; the derived CryptoKey is
 *   created as non-extractable so it cannot be exported by page scripts.
 *
 * Only the resulting envelope (salt, iv, ciphertext) is ever persisted, so a storage
 * backend (localStorage, Supabase, S3, ...) never sees plaintext.
 */
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './encoding';

export const DEFAULT_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 1_000;
export const ENVELOPE_VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
/** Additional authenticated data binds ciphertexts to this app + format version. */
const AAD = utf8Encode(`gym-exercises-vault:v${ENVELOPE_VERSION}`);

export interface Envelope {
  v: typeof ENVELOPE_VERSION;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

export class DecryptionError extends Error {
  constructor(message = 'Unable to decrypt: wrong passphrase or corrupted data') {
    super(message);
    this.name = 'DecryptionError';
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto API is unavailable (a secure context / HTTPS is required)');
  return s;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(SALT_BYTES);
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  if (!passphrase) throw new Error('Passphrase is required');
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
    throw new Error(`Iterations must be an integer >= ${MIN_ITERATIONS}`);
  }
  if (salt.length < SALT_BYTES) throw new Error('Salt is too short');
  const baseKey = await subtle().importKey('raw', utf8Encode(passphrase.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithKey(
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  plaintext: string,
): Promise<Envelope> {
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, utf8Encode(plaintext));
  return {
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA256',
    iter: iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function decryptWithKey(key: CryptoKey, envelope: Envelope): Promise<string> {
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv), additionalData: AAD },
      key,
      base64ToBytes(envelope.ct),
    );
    return utf8Decode(new Uint8Array(pt));
  } catch {
    throw new DecryptionError();
  }
}

export async function encryptString(
  passphrase: string,
  plaintext: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<Envelope> {
  const salt = generateSalt();
  const key = await deriveKey(passphrase, salt, iterations);
  return encryptWithKey(key, salt, iterations, plaintext);
}

export async function decryptString(passphrase: string, envelope: Envelope): Promise<string> {
  const key = await deriveKey(passphrase, base64ToBytes(envelope.salt), envelope.iter);
  return decryptWithKey(key, envelope);
}

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    e.v === ENVELOPE_VERSION &&
    e.kdf === 'PBKDF2-SHA256' &&
    typeof e.iter === 'number' &&
    Number.isInteger(e.iter) &&
    e.iter >= MIN_ITERATIONS &&
    typeof e.salt === 'string' &&
    typeof e.iv === 'string' &&
    typeof e.ct === 'string'
  );
}

export function parseEnvelope(raw: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Stored data is not valid JSON');
  }
  if (!isEnvelope(parsed)) throw new Error('Stored data is not a recognised encrypted envelope');
  return parsed;
}
