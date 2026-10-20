/**
 * How good a password is, in plain terms, for the sign-up form's meter.
 *
 * This is guidance, not the gate: Supabase decides what it will accept (and says
 * why when it refuses — see `signUp`). The meter only has to point people at a
 * password that will pass and be hard to guess: longer beats clever, and mixing
 * kinds of characters helps.
 */

export type Check = { id: string; label: string; ok: boolean };

export type Strength = {
  /** 0 = too short, 1 = weak, 2 = okay, 3 = strong, 4 = very strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: Check[];
};

/** Passwords everybody tries first. Compared lower-cased, with digits and symbols stripped from the ends. */
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyui", "qwertyuiop", "asdfghjk", "asdfghjkl", "zxcvbnm",
  "letmein", "welcome", "iloveyou", "admin", "administrator", "login", "monkey", "dragon",
  "football", "baseball", "abc", "abcdef", "abcdefgh", "hostello", "airbnb", "booking", "pakistan",
  "islamabad", "lahore", "karachi", "changeme", "default", "master", "sunshine", "princess",
]);

function isCommon(password: string): boolean {
  const lower = password.toLowerCase();
  const core = lower.replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (COMMON.has(lower) || (core.length >= 3 && COMMON.has(core))) return true;
  // 12345678, 11111111, abababab: one repeated unit, or a run of digits.
  if (/^(.{1,2})\1{3,}$/.test(password)) return true;
  if (/^\d+$/.test(password) && ("0123456789".includes(password) || "9876543210".includes(password))) return true;
  return false;
}

export function passwordStrength(password: string): Strength {
  const len = password.length;
  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /\d/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const kinds = [lower, upper, digit, symbol].filter(Boolean).length;

  const checks: Check[] = [
    { id: "len8", label: "At least 8 characters", ok: len >= 8 },
    { id: "case", label: "Upper and lower case letters", ok: lower && upper },
    { id: "digit", label: "A number", ok: digit },
    { id: "symbol", label: "A symbol, like ! ? - _ @ #", ok: symbol },
    { id: "len12", label: "12 or more characters is best", ok: len >= 12 },
  ];

  if (len === 0) return { score: 0, label: "", checks };
  if (len < 8) return { score: 0, label: "Too short", checks };
  if (isCommon(password)) return { score: 1, label: "Too common. Pick something less guessable", checks };

  let points = 1;
  if (kinds >= 3) points += 1;
  if (len >= 12) points += 1;
  if (kinds === 4 || len >= 16) points += 1;
  const score = Math.min(4, points) as 1 | 2 | 3 | 4;

  const label = { 1: "Weak", 2: "Okay", 3: "Strong", 4: "Very strong" }[score];
  return { score, label, checks };
}
