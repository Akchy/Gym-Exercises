import { describe, expect, it } from 'vitest';
import {
  DecryptionError,
  decryptString,
  deriveKey,
  encryptString,
  generateSalt,
  isEnvelope,
  parseEnvelope,
} from '../../src/core/crypto';
import { base64ToBytes, bytesToBase64 } from '../../src/core/encoding';

const ITER = 1000; // low count keeps unit tests fast; production uses 600k

describe('crypto', () => {
  it('encrypts and decrypts a string', async () => {
    const env = await encryptString('correct horse battery', 'secret weight: 80kg', ITER);
    expect(await decryptString('correct horse battery', env)).toBe('secret weight: 80kg');
  });

  it('never stores plaintext in the envelope', async () => {
    const env = await encryptString('passphrase-123', 'my private notes', ITER);
    const serialized = JSON.stringify(env);
    expect(serialized).not.toContain('my private notes');
    expect(serialized).not.toContain('passphrase-123');
    expect(env.kdf).toBe('PBKDF2-SHA256');
    expect(env.iter).toBe(ITER);
  });

  it('uses a fresh salt and IV for each encryption', async () => {
    const a = await encryptString('pass-phrase', 'same', ITER);
    const b = await encryptString('pass-phrase', 'same', ITER);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(base64ToBytes(a.salt)).toHaveLength(16);
    expect(base64ToBytes(a.iv)).toHaveLength(12);
  });

  it('fails with DecryptionError on a wrong passphrase', async () => {
    const env = await encryptString('right-passphrase', 'data', ITER);
    await expect(decryptString('wrong-passphrase', env)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('detects tampering with the ciphertext (authenticated encryption)', async () => {
    const env = await encryptString('right-passphrase', 'data', ITER);
    const ct = base64ToBytes(env.ct);
    ct[0] ^= 0xff;
    await expect(decryptString('right-passphrase', { ...env, ct: bytesToBase64(ct) })).rejects.toBeInstanceOf(DecryptionError);
  });

  it('detects tampering with the IV', async () => {
    const env = await encryptString('right-passphrase', 'data', ITER);
    const iv = base64ToBytes(env.iv);
    iv[0] ^= 1;
    await expect(decryptString('right-passphrase', { ...env, iv: bytesToBase64(iv) })).rejects.toThrow(DecryptionError);
  });

  it('validates key derivation inputs', async () => {
    await expect(deriveKey('', generateSalt(), ITER)).rejects.toThrow('Passphrase is required');
    await expect(deriveKey('x', generateSalt(), 10)).rejects.toThrow('Iterations');
    await expect(deriveKey('x', new Uint8Array(4), ITER)).rejects.toThrow('Salt is too short');
  });

  it('derives non-extractable keys', async () => {
    const key = await deriveKey('passphrase', generateSalt(), ITER);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  });

  it('treats unicode-equivalent passphrases the same (NFKC)', async () => {
    const env = await encryptString('café-secret', 'ok', ITER);
    expect(await decryptString('café-secret', env)).toBe('ok');
  });

  it('recognises valid envelopes only', async () => {
    const env = await encryptString('p', 'x', ITER);
    expect(isEnvelope(env)).toBe(true);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({ ...env, v: 2 })).toBe(false);
    expect(isEnvelope({ ...env, iter: 5 })).toBe(false);
    expect(isEnvelope({ ...env, ct: 1 })).toBe(false);
  });

  it('parses envelopes and rejects garbage', async () => {
    const env = await encryptString('p', 'x', ITER);
    expect(parseEnvelope(JSON.stringify(env))).toEqual(env);
    expect(() => parseEnvelope('{oops')).toThrow('not valid JSON');
    expect(() => parseEnvelope('{"a":1}')).toThrow('not a recognised');
  });
});
