import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Serves one property's availability as an .ics for an OTA to subscribe to.
 *
 *   GET /functions/v1/ical/<token>
 *
 * JWT verification is off by necessity — Airbnb fetches this anonymously and
 * cannot send a header. The secret token in the path is the whole credential,
 * which is why the document it returns carries dates and nothing else: no
 * guest name, no phone, no price. Everything else lives in
 * `public.ical_export_document()`; this is only the doorway.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function readToken(url: URL): string | null {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last !== "ical" ? decodeURIComponent(last) : null;
}

async function fetchDocument(token: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ical_export_document`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: token }),
  });

  if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`);

  return (await res.json()) as string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return textResponse("Method not allowed", 405);
  }

  const token = readToken(new URL(req.url));

  // Shape-check before touching the database: this URL is public, so a bad
  // token should cost a regex and nothing more.
  if (!token || !TOKEN_PATTERN.test(token)) {
    return textResponse("Not found", 404);
  }

  let document: string | null;

  try {
    document = await fetchDocument(token);
  } catch (err) {
    console.error("ical export failed", err);
    return textResponse("Calendar temporarily unavailable", 503);
  }

  // Unknown or switched-off token. Deliberately the same answer as a
  // malformed one, so this cannot be used to tell live tokens from dead ones.
  if (!document) return textResponse("Not found", 404);

  const headers = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="hostello.ics"',
    "Cache-Control": "no-cache, max-age=0",
  };

  // A HEAD must carry the headers and no body — some fetchers probe first.
  return new Response(req.method === "HEAD" ? null : document, { status: 200, headers });
});
