import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, randomId, utf8Decode, utf8Encode } from '../../src/core/encoding';

describe('encoding', () => {
  it('round-trips binary data through base64', () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('encodes known values', () => {
    expect(bytesToBase64(utf8Encode('hi'))).toBe('aGk=');
    expect(utf8Decode(base64ToBytes('aGk='))).toBe('hi');
  });

  it('rejects malformed base64', () => {
    expect(() => base64ToBytes('not base64!')).toThrow('Invalid base64');
    expect(() => base64ToBytes('abc')).toThrow('Invalid base64');
  });

  it('round-trips unicode text', () => {
    expect(utf8Decode(utf8Encode('💪 Übung'))).toBe('💪 Übung');
  });

  it('creates random hex ids of the requested length', () => {
    const a = randomId();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(randomId(4)).toHaveLength(8);
    expect(randomId()).not.toBe(a);
  });
});
