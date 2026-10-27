import { describe, expect, it } from 'vitest';
import { randomId } from '../../src/core/encoding';

describe('randomId', () => {
  it('creates random hex ids of the requested length', () => {
    const a = randomId();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(randomId(4)).toHaveLength(8);
    expect(randomId()).not.toBe(a);
  });
});
