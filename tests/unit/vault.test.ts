import { describe, expect, it } from 'vitest';
import { DecryptionError } from '../../src/core/crypto';
import { MemoryStorageAdapter } from '../../src/core/storage';
import { Vault, VaultLockedError, VAULT_KEY } from '../../src/core/vault';

const ITER = 1000;
const data = { profile: { name: 'Sam', weightKg: 72.5 }, notes: 'knee injury 2021' };

async function setup() {
  const storage = new MemoryStorageAdapter();
  const vault = new Vault(storage, ITER);
  await vault.create('my long passphrase', data);
  return { storage, vault };
}

describe('Vault', () => {
  it('stores only an encrypted envelope', async () => {
    const { storage } = await setup();
    const raw = (await storage.getItem(VAULT_KEY)) as string;
    expect(raw).not.toContain('Sam');
    expect(raw).not.toContain('knee');
    expect(JSON.parse(raw)).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iter: ITER });
  });

  it('unlocks with the right passphrase', async () => {
    const { storage } = await setup();
    const fresh = new Vault(storage, ITER);
    expect(await fresh.exists()).toBe(true);
    expect(fresh.isUnlocked).toBe(false);
    expect(await fresh.unlock('my long passphrase')).toEqual(data);
    expect(fresh.isUnlocked).toBe(true);
  });

  it('refuses a wrong passphrase and stays locked', async () => {
    const { storage } = await setup();
    const fresh = new Vault(storage, ITER);
    await expect(fresh.unlock('wrong passphrase')).rejects.toBeInstanceOf(DecryptionError);
    expect(fresh.isUnlocked).toBe(false);
  });

  it('will not overwrite an existing vault on create', async () => {
    const { vault } = await setup();
    await expect(vault.create('another one!', {})).rejects.toThrow('already exists');
  });

  it('saves updates and cannot save when locked', async () => {
    const { storage, vault } = await setup();
    await vault.save({ ...data, notes: 'updated' });
    expect(await new Vault(storage, ITER).unlock('my long passphrase')).toMatchObject({ notes: 'updated' });
    vault.lock();
    expect(vault.isUnlocked).toBe(false);
    await expect(vault.save(data)).rejects.toBeInstanceOf(VaultLockedError);
  });

  it('errors when unlocking or exporting a missing vault', async () => {
    const v = new Vault(new MemoryStorageAdapter(), ITER);
    expect(await v.exists()).toBe(false);
    await expect(v.unlock('x')).rejects.toThrow('No vault found');
    await expect(v.exportEncrypted()).rejects.toThrow('No vault found');
  });

  it('changes the passphrase (re-encrypting with a new salt)', async () => {
    const { storage, vault } = await setup();
    const before = JSON.parse((await storage.getItem(VAULT_KEY)) as string);
    await vault.changePassphrase('my long passphrase', 'a brand new passphrase');
    const after = JSON.parse((await storage.getItem(VAULT_KEY)) as string);
    expect(after.salt).not.toBe(before.salt);
    const fresh = new Vault(storage, ITER);
    await expect(fresh.unlock('my long passphrase')).rejects.toBeInstanceOf(DecryptionError);
    expect(await fresh.unlock('a brand new passphrase')).toEqual(data);
  });

  it('does not change the passphrase if the current one is wrong', async () => {
    const { storage, vault } = await setup();
    await expect(vault.changePassphrase('nope nope nope', 'new passphrase!')).rejects.toBeInstanceOf(DecryptionError);
    expect(await new Vault(storage, ITER).unlock('my long passphrase')).toEqual(data);
  });

  it('exports and imports encrypted backups', async () => {
    const { vault } = await setup();
    const backup = JSON.stringify(await vault.exportEncrypted());
    const other = new Vault(new MemoryStorageAdapter(), ITER);
    await expect(other.importEncrypted(backup, 'wrong passphrase')).rejects.toBeInstanceOf(DecryptionError);
    expect(await other.exists()).toBe(false);
    expect(await other.importEncrypted(backup, 'my long passphrase')).toEqual(data);
    expect(other.isUnlocked).toBe(true);
    await other.save({ ok: true });
    expect(await new Vault((other as unknown as { storage: MemoryStorageAdapter }).storage, ITER).unlock('my long passphrase')).toEqual({ ok: true });
  });

  it('does not write an import that fails validation', async () => {
    const { vault } = await setup();
    const backup = JSON.stringify(await vault.exportEncrypted());
    const other = new Vault(new MemoryStorageAdapter(), ITER);
    await expect(other.importEncrypted(backup, 'my long passphrase', () => { throw new Error('bad data'); })).rejects.toThrow('bad data');
    expect(await other.exists()).toBe(false);
    expect(other.isUnlocked).toBe(false);
  });

  it('destroys the vault', async () => {
    const { vault } = await setup();
    await vault.destroy();
    expect(await vault.exists()).toBe(false);
    expect(vault.isUnlocked).toBe(false);
  });
});
