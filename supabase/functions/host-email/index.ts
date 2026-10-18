import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Emails a self-serve host the notices they also get in the app: welcome, the
 * trial and plan reminders, and the lapse. pg_cron calls this every five
 * minutes (`run_host_email_sweep()`), only when something is waiting.
 *
 * What it does NOT decide: what is due, who it goes to, or what it says. The
 * claim (`host_email_claim()`) stamps and returns the notices, with the address
 * to use; the words are the notification's own title and body, so the bell and
 * the inbox can never disagree.
 *
 *   POST (X-Email-Secret)   the schedule
 *   POST { action: "test", to }   one sample email, to check the setup
 *
 * Needs two function secrets, set in the Supabase dashboard:
 *   RESEND_API_KEY   a Resend key with sending access
 *   MAIL_FROM        e.g.  Hostello <hello@yourdomain.com>  (a verified domain)
 * and optionally SITE_URL (defaults to the production address).
 *
 * JWT verification is off at the gateway — pg_cron has no JWT. The shared secret
 * (Vault, `host_email_secret`) is what guards it instead.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://hostello-pms.vercel.app").replace(/\/+$/, "");

type Notice = { id: string; kind: string; title: string; body: string | null; email: string | null; name: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function rpc<T>(name: string, args: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]);

function render(n: Notice): { subject: string; html: string; text: string } {
  const first = (n.name ?? "").trim().split(/\s+/)[0] || "there";
  const link = `${SITE_URL}/client/account`;
  const body = n.body ?? "";
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b10;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#16161f;border-radius:16px;padding:28px;color:#f3f3f7;">
<tr><td style="font-size:12px;letter-spacing:3px;color:#d4a73a;font-weight:bold;">HOSTELLO</td></tr>
<tr><td style="padding-top:18px;font-size:20px;font-weight:bold;">${esc(n.title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.5;color:#c9c9d6;">Hi ${esc(first)},<br><br>${esc(body)}</td></tr>
<tr><td style="padding-top:22px;"><a href="${link}" style="display:inline-block;background:#d4a73a;color:#16161f;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:10px;">Open my account</a></td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#8a8a99;">You are receiving this because you have a Hostello account.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${first},\n\n${body}\n\nOpen your account: ${link}\n\nYou are receiving this because you have a Hostello account.`;
  return { subject: n.title, html, text };
}

async function send(to: string, n: Notice): Promise<string | null> {
  const mail = render(n);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // The notice's own id: a retry of the same notice cannot send it twice.
      "Idempotency-Key": `host-email-${n.id}`,
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (res.ok) return null;
  return `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = req.headers.get("X-Email-Secret");
  if (!secret || !(await rpc<boolean>("is_host_email_secret", { p_secret: secret }))) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Without the key nothing is claimed, so the notices wait (three days at most).
  if (!RESEND_API_KEY || !MAIL_FROM) return json({ status: "not_configured" });

  const body = (await req.json().catch(() => ({}))) as { action?: string; to?: string };

  if (body.action === "test") {
    if (!body.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.to)) return json({ error: "Give a real address in `to`." }, 400);
    const error = await send(body.to, {
      id: `test-${Date.now()}`,
      kind: "host_welcome",
      title: "Hostello email test",
      body: "If you can read this, reminder emails are set up correctly.",
      email: body.to,
      name: "there",
    });
    return json(error ? { status: "failed", error } : { status: "sent" });
  }

  try {
    const notices = await rpc<Notice[]>("host_email_claim", {});
    if (notices.length === 0) return json({ status: "nothing_due" });

    const failed: string[] = [];
    const errors: string[] = [];
    for (const n of notices) {
      if (!n.email) {
        errors.push(`${n.id}: no address`);
        continue; // stays stamped: there is nowhere to send it
      }
      const error = await send(n.email, n);
      if (error) {
        failed.push(n.id);
        errors.push(`${n.id}: ${error}`);
      }
    }
    if (failed.length > 0) await rpc("host_email_release", { p_ids: failed });

    return json({ status: "done", sent: notices.length - errors.length, failed: failed.length, errors });
  } catch (err) {
    console.error("host-email failed", err);
    return json({ error: "Sweep failed. Check the function logs." }, 500);
  }
});
