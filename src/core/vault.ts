/**
 * Encrypted key/value vault. Holds the derived (non-extractable) key in memory only
 * while unlocked. Locking drops the key reference.
 */
import { base64ToBytes } from './encoding';
import {
  DEFAULT_ITERATIONS,
  decryptWithKey,
  deriveKey,
  encryptWithKey,
  generateSalt,
  parseEnvelope,
  type Envelope,
} from './crypto';
import type { StorageAdapter } from './storage';

export const VAULT_KEY = 'vault';

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked');
    this.name = 'VaultLockedError';
  }
}

export class Vault {
  private key: CryptoKey | null = null;
  private salt: Uint8Array<ArrayBuffer> | null = null;
  private iterations = DEFAULT_ITERATIONS;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly defaultIterations = DEFAULT_ITERATIONS,
    private readonly storageKey = VAULT_KEY,
  ) {}

  get isUnlocked(): boolean {
    return this.key !== null;
  }

  async exists(): Promise<boolean> {
    return (await this.storage.getItem(this.storageKey)) !== null;
  }

  /** Creates a new vault (overwrites nothing: throws if one already exists). */
  async create<T>(passphrase: string, initial: T): Promise<void> {
    if (await this.exists()) throw new Error('A vault already exists on this device');
    this.salt = generateSalt();
    this.iterations = this.defaultIterations;
    this.key = await deriveKey(passphrase, this.salt, this.iterations);
    await this.save(initial);
  }

  /** Unlocks and returns the decrypted data. Throws DecryptionError on a wrong passphrase. */
  async unlock<T>(passphrase: string): Promise<T> {
    const raw = await this.storage.getItem(this.storageKey);
    if (raw === null) throw new Error('No vault found');
    const envelope = parseEnvelope(raw);
    const salt = base64ToBytes(envelope.salt);
    const key = await deriveKey(passphrase, salt, envelope.iter);
    const plaintext = await decryptWithKey(key, envelope);
    this.key = key;
    this.salt = salt;
    this.iterations = envelope.iter;
    return JSON.parse(plaintext) as T;
  }

  async save<T>(data: T): Promise<void> {
    if (!this.key || !this.salt) throw new VaultLockedError();
    const envelope = await encryptWithKey(this.key, this.salt, this.iterations, JSON.stringify(data));
    await this.storage.setItem(this.storageKey, JSON.stringify(envelope));
  }

  /** Re-encrypts the data under a new passphrase (new salt + key). */
  async changePassphrase<T>(currentPassphrase: string, newPassphrase: string): Promise<T> {
    const data = await this.unlock<T>(currentPassphrase);
    this.salt = generateSalt();
    this.iterations = this.defaultIterations;
    this.key = await deriveKey(newPassphrase, this.salt, this.iterations);
    await this.save(data);
    return data;
  }

  /** Returns the raw encrypted envelope (safe to export as a backup). */
  async exportEncrypted(): Promise<Envelope> {
    const raw = await this.storage.getItem(this.storageKey);
    if (raw === null) throw new Error('No vault found');
    return parseEnvelope(raw);
  }

  /**
   * Imports an encrypted backup. Nothing is written unless it decrypts with the given
   * passphrase and passes `validate` (which may throw or normalise the data).
   */
  async importEncrypted<T>(raw: string, passphrase: string, validate: (data: unknown) => T = (d) => d as T): Promise<T> {
    const envelope = parseEnvelope(raw);
    const salt = base64ToBytes(envelope.salt);
    const key = await deriveKey(passphrase, salt, envelope.iter);
    const data = validate(JSON.parse(await decryptWithKey(key, envelope)));
    await this.storage.setItem(this.storageKey, JSON.stringify(envelope));
    this.key = key;
    this.salt = salt;
    this.iterations = envelope.iter;
    return data;
  }

  lock(): void {
    this.key = null;
    this.salt = null;
  }

  async destroy(): Promise<void> {
    this.lock();
    await this.storage.removeItem(this.storageKey);
  }
}
