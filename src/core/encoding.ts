/** Cryptographically random identifier (hex). */
export function randomId(byteLength = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
