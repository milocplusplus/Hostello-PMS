/**
 * Where the Supabase URL and anon key come from.
 *
 * Both values are public by design: `NEXT_PUBLIC_*` is inlined into the client
 * bundle, so the anon key is already downloadable by anyone who opens the site.
 * Row-level security is what protects the data, not the secrecy of this key.
 *
 * They are checked in here as defaults because a masked copy-paste (a string of
 * U+2022 bullet characters copied from Supabase's hidden key display) was saved
 * into the Vercel env var and took down every auth call in production — `fetch`
 * refuses to put a non-Latin-1 character in an HTTP header, so every sign-in died
 * with "Cannot convert argument to a ByteString". A value that cannot be mistyped
 * cannot break.
 *
 * An env var still wins when it is set and actually usable, so a different
 * Supabase project can be pointed at without touching code. A corrupted one is
 * ignored rather than shipped.
 */

const FALLBACK_URL = "https://vucfpfqcankyztzvmyht.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1Y2ZwZnFjYW5reXp0enZteWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDAwMDAsImV4cCI6MjEwMjk3NjAwMH0.nxHJWrX4gybmBa2pgtfiY3cnxkmFLWfQQ7Cb4FH-Hkk";

/**
 * A value is only usable if every character can survive being put in an HTTP
 * header — printable ASCII. Bullets, smart quotes and stray whitespace all fail.
 */
function usable(value: string | undefined): value is string {
  const trimmed = value?.trim();
  return !!trimmed && /^[\x21-\x7e]+$/.test(trimmed);
}

// Referenced as full literals so Next.js can inline them at build time.
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_URL = usable(envUrl) ? envUrl.trim() : FALLBACK_URL;
export const SUPABASE_ANON_KEY = usable(envAnonKey) ? envAnonKey.trim() : FALLBACK_ANON_KEY;
