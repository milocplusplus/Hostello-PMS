import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

/**
 * Supabase client for use in Client Components ("use client").
 * Reads the public URL and anon key — safe to expose in the browser.
 * Row-level security policies in the database control what data
 * each authenticated user can actually see or modify.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
