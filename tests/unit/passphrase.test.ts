import { describe, expect, it } from 'vitest';
import { checkPassphrase, MIN_PASSPHRASE_LENGTH } from '../../src/core/passphrase';

describe('checkPassphrase', () => {
  it('rejects short passphrases', () => {
    const r = checkPassphrase('short');
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain(String(MIN_PASSPHRASE_LENGTH));
  });

  it('rejects common passphrases', () => {
    expect(checkPassphrase('Password123').problems).toContain('This passphrase is too common');
  });

  it('rejects a single repeated character', () => {
    expect(checkPassphrase('aaaaaaaaaaaa').ok).toBe(false);
  });

  it('scores longer, more varied passphrases higher', () => {
    const weak = checkPassphrase('abcdefghjk');
    const strong = checkPassphrase('Blue-Horse-Runs-42!');
    expect(weak.ok).toBe(true);
    expect(strong.ok).toBe(true);
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBe(4);
  });

  it('caps the score when there are problems', () => {
    expect(checkPassphrase('aB3$').score).toBeLessThanOrEqual(1);
  });
});
