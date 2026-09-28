/**
 * Hostello channel inbox — Cloudflare Email Worker.
 *
 * Email Routing hands every message sent to the inbox address to this worker,
 * which passes it on untouched to Hostello's `ota-email` function. All the
 * reading happens there (supabase/functions/ota-email/mime.ts + parse.ts); this
 * file only carries the bytes, so it should never need changing.
 *
 * Paste it into Cloudflare → Workers & Pages → Create → "Hello World" worker →
 * Edit code, replace everything, Deploy. Then, on the worker's Settings →
 * Variables and Secrets:
 *
 *   OTA_SECRET   (Secret)  the `ota_inbound_secret` from Supabase Vault
 *   BACKUP_TO    (Text)    optional: a verified Email Routing destination that
 *                          gets a copy whenever Hostello could not take one
 *   ALWAYS_COPY  (Text)    optional: "yes" to copy every mail to BACKUP_TO
 *
 * It never rejects a message. A rejection bounces back to whoever forwarded
 * it, and Gmail switches forwarding off after enough bounces — one bad hour
 * would silently stop an owner's emails for good.
 */

const INTAKE = "https://vucfpfqcankyztzvmyht.supabase.co/functions/v1/ota-email";

const worker = {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    let ok = false;

    try {
      const res = await fetch(env.INTAKE_URL || INTAKE, {
        method: "POST",
        headers: { "Content-Type": "message/rfc822", "X-Ota-Secret": env.OTA_SECRET ?? "" },
        body: raw,
      });
      ok = res.ok;
      if (!ok) console.log("Hostello intake answered", res.status, (await res.text()).slice(0, 300));
    } catch (err) {
      console.log("Hostello intake unreachable", String(err));
    }

    if (env.BACKUP_TO && (!ok || env.ALWAYS_COPY === "yes")) {
      await message.forward(env.BACKUP_TO);
    }
  },
};

export default worker;
