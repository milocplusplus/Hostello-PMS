import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

/**
 * Web Push for alerts the database raised on its own.
 *
 * The app pushes what its Server Actions write (`src/lib/push.ts`). Everything
 * else — channel emails, the calendar sync, the morning jobs, the health check
 * — is inserted by SQL, where nothing can reach the app, so it used to stop at
 * the bell. pg_cron calls this once a minute (`run_push_sweep()`), and it
 * sends what `push_sweep_claim()` hands it.
 *
 * What it does NOT decide: who is due, who has push switched off, which
 * categories are muted, or where a tap lands. The claim decides the first
 * three in SQL, and the payload's URL is `/notifications/open/<id>`, which the
 * app resolves with its own `notificationHref` — so no rule lives here.
 *
 * The payload shape and send options match `push.ts` exactly, so `public/sw.js`
 * and the Android wrapper cannot tell the two senders apart.
 *
 *   POST (X-Sweep-Secret)   the schedule
 *
 * JWT verification is off at the gateway — pg_cron has no JWT. The shared
 * secret (Vault, `push_sweep_secret`) is what guards it instead.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Item = {
  subscription_id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  title: string;
  body: string | null;
  category: string;
  url: string;
  tag: string;
};

type Claim = {
  keys: { public: string; private: string; subject: string } | null;
  items: Item[];
};

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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = req.headers.get("X-Sweep-Secret");
  if (!secret || !(await rpc<boolean>("is_push_sweep_secret", { p_secret: secret }))) {
    return json({ error: "Unauthorized" }, 401);
  }

  // "Does Web Push still work in this runtime?" — signs and encrypts with a
  // throwaway key pair for a made-up subscription and sends it to a push
  // service that will refuse it. A refusal *from the service* means the
  // library did its part; a thrown error before any response means it did not.
  // Touches no real subscriber and needs no real key.
  const body = await req.json().catch(() => ({}));
  if ((body as { action?: string }).action === "selftest") {
    const b64url = (bytes: ArrayBuffer | Uint8Array) =>
      btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const p256dh = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const auth = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const vapid = webpush.generateVAPIDKeys();
    webpush.setVapidDetails("mailto:ops@hostello.pk", vapid.publicKey, vapid.privateKey);
    try {
      await webpush.sendNotification(
        { endpoint: "https://fcm.googleapis.com/fcm/send/hostello-selftest", keys: { p256dh, auth } },
        JSON.stringify({ title: "selftest" }),
        { TTL: 60 }
      );
      return json({ status: "accepted" });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      return json({
        status: statusCode ? "service_refused" : "library_failed",
        statusCode: statusCode ?? null,
        message: String((err as Error)?.message ?? err).slice(0, 300),
      });
    }
  }

  try {
    const claim = await rpc<Claim>("push_sweep_claim", {});
    if (!claim.keys) return json({ status: "no_keys" });
    if (claim.items.length === 0) return json({ status: "nothing_due" });

    webpush.setVapidDetails(claim.keys.subject, claim.keys.public, claim.keys.private);

    const dead: string[] = [];
    const results = await Promise.allSettled(
      claim.items.map(async (item) => {
        try {
          await webpush.sendNotification(
            { endpoint: item.endpoint, keys: { p256dh: item.p256dh ?? "", auth: item.auth ?? "" } },
            JSON.stringify({
              title: item.title,
              body: item.body,
              url: item.url,
              category: item.category,
              tag: item.tag,
            }),
            // "high" gets past Android's Doze — see the same line in push.ts.
            { TTL: 60 * 60 * 12, urgency: "high" }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(item.subscription_id);
          throw err;
        }
      })
    );

    if (dead.length > 0) await rpc("push_sweep_dead", { p_ids: dead });

    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    return json({
      status: "sent",
      sent: results.length - failed.length,
      failed: failed.length,
      errors: failed.slice(0, 3).map((f) => String((f.reason as Error)?.message ?? f.reason).slice(0, 200)),
    });
  } catch (err) {
    console.error("push-sweep failed", err);
    return json({ error: "Sweep failed. Check the function logs." }, 500);
  }
});
