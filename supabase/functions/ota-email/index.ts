import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { parseOtaEmail } from "./parse.ts";

/**
 * The one place a channel's reservation email is read.
 *
 * Sibling of `ical-sync`, and for the same reason: nothing external can call a
 * Next.js Server Action, and an inbound-email webhook is about as external as
 * it gets. Postmark POSTs here; this function stores the mail verbatim, has a
 * go at reading it, and hands the result to `record_ota_message()`.
 *
 * What it does NOT do: decide which property the mail belongs to, decide
 * whether it is reviewable, or write a notification — those are rules and live
 * in SQL. And, above all, it never computes a payout. A parsed mail is a
 * proposal; `src/lib/payout.ts` runs when an admin approves it in the app.
 *
 *   POST ?secret=…            Postmark inbound webhook
 *   POST { action: "preview" } dry run: parse and return, write nothing
 *
 * JWT verification must be OFF at the gateway — Postmark has no JWT to present.
 * The shared secret (Vault, `ota_inbound_secret`) is what guards it instead.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Postgres `text` will take anything, but a runaway mail should not become a row. */
const MAX_BODY_CHARS = 200_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function rpc<T>(name: string, args: unknown, accessToken = SERVICE_ROLE_KEY): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${await res.text()}`);

  return (await res.json()) as T;
}

/**
 * The webhook's shared secret, or an admin's JWT for the preview action.
 *
 * Postmark can only decorate the URL, so the secret is accepted from the query
 * string as well as a header. That does put it in the function's access logs,
 * which is why it is a rotatable Vault secret and not a key to anything else.
 */
async function authorize(req: Request, url: URL): Promise<"webhook" | "admin" | null> {
  const secret = req.headers.get("X-Ota-Secret") ?? url.searchParams.get("secret");

  if (secret && (await rpc<boolean>("is_ota_inbound_secret", { p_secret: secret }))) {
    return "webhook";
  }

  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      if (await rpc<boolean>("is_admin", {}, auth.slice(7))) return "admin";
    } catch {
      // Falls through to null.
    }
  }

  return null;
}

function clip(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_BODY_CHARS) : "";
}

/** Postmark's inbound payload, reduced to the six things that matter. */
function readPostmark(body: Record<string, unknown>) {
  const fromFull = body.FromFull as { Email?: string } | undefined;
  const toFull = Array.isArray(body.ToFull)
    ? (body.ToFull[0] as { Email?: string } | undefined)
    : undefined;

  return {
    messageId: String(body.MessageID ?? body.MessageId ?? "").trim(),
    from: String(fromFull?.Email ?? body.From ?? "").trim(),
    to: String(toFull?.Email ?? body.To ?? "").trim(),
    subject: String(body.Subject ?? "").trim(),
    text: clip(body.TextBody),
    html: clip(body.HtmlBody),
    date: String(body.Date ?? ""),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const caller = await authorize(req, url);

  if (!caller) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  // A dry run, for holding a real email up against the parser without writing
  // anything. This is how the label tables in parse.ts get corrected.
  if (body.action === "preview") {
    if (caller !== "admin") return json({ error: "Preview is admin-only." }, 403);

    return json(
      parseOtaEmail({
        subject: String(body.subject ?? ""),
        from: String(body.from ?? ""),
        textBody: clip(body.text ?? body.TextBody),
        htmlBody: clip(body.html ?? body.HtmlBody),
      })
    );
  }

  try {
    const mail = readPostmark(body);

    if (!mail.messageId) {
      // Without an id there is no dedupe key, and a Postmark retry would file
      // the reservation twice. Refuse rather than risk it.
      return json({ error: "No MessageID on the payload." }, 400);
    }

    const received = mail.date ? new Date(mail.date) : new Date();

    const outcome = parseOtaEmail({
      subject: mail.subject,
      from: mail.from,
      textBody: mail.text,
      htmlBody: mail.html,
      receivedAt: Number.isNaN(received.getTime()) ? new Date() : received,
    });

    const result = await rpc<Record<string, unknown>>("record_ota_message", {
      p_provider: "postmark",
      p_message_id: mail.messageId,
      p_from: mail.from,
      p_to: mail.to,
      p_subject: mail.subject,
      p_raw_text: mail.text,
      p_raw_html: mail.html,
      p_source: outcome.source,
      p_kind: outcome.kind,
      p_parsed: outcome.parsed,
      p_parse_error: outcome.error,
    });

    // 200 even when the parse failed: the mail is safely stored and waiting in
    // the inbox, so there is nothing for Postmark to usefully retry. Only a
    // genuine fault below earns a 500 and a redelivery.
    return json(result);
  } catch (err) {
    console.error("ota-email failed", err);
    return json({ error: "Could not record that email. Check the function logs." }, 500);
  }
});
