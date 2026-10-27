/** Passphrase strength rules. The passphrase is the only thing protecting the data, so be strict. */
export const MIN_PASSPHRASE_LENGTH = 10;

export interface PassphraseCheck {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  problems: string[];
}

const COMMON = new Set([
  'password', 'password1', 'password123', '1234567890', '123456789', 'qwertyuiop', 'iloveyou',
  'letmein123', 'gympassword', 'workout123', 'fitness123', 'abcdefghij', 'passw0rd123',
]);

export function checkPassphrase(passphrase: string): PassphraseCheck {
  const problems: string[] = [];
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    problems.push(`Use at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  if (COMMON.has(passphrase.toLowerCase())) problems.push('This passphrase is too common');
  if (/^(.)\1+$/.test(passphrase)) problems.push('Avoid repeating a single character');

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(passphrase)).length;
  let score = 0;
  if (passphrase.length >= MIN_PASSPHRASE_LENGTH) score++;
  if (passphrase.length >= 14) score++;
  if (classes >= 2) score++;
  if (classes >= 3 || passphrase.length >= 20) score++;
  if (problems.length) score = Math.min(score, 1);
  return { ok: problems.length === 0, score: score as PassphraseCheck['score'], problems };
}
