import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Keeps today's rupee rate for the currencies Airbnb quotes in, so the database can
 * turn a foreign price into rupees by itself (a host's booking is added from the
 * email with nobody there to type the figure). pg_cron calls this once a day
 * (`run_fx_rates_refresh()`); the rates land in `fx_rates` through `save_fx_rates()`.
 *
 * The source is the same free daily mid-market rate the rest of the app uses
 * (open.er-api.com, no key). It is an estimate of what the bank will receive, not
 * the figure itself — Airbnb pays out at its own rate.
 *
 *   POST (X-Fx-Secret)   the schedule
 *
 * JWT verification is off at the gateway — pg_cron has no JWT. The shared secret
 * (Vault, `fx_rates_secret`) guards it instead.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** What Airbnb hosts are paid or quoted in. Rupees need no rate. */
const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "CAD", "AUD", "CHF", "JPY", "SGD"];

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

  const secret = req.headers.get("X-Fx-Secret");
  if (!secret || !(await rpc<boolean>("is_fx_rates_secret", { p_secret: secret }))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    // Rupees as the base: one rupee buys `rates[X]` of X, so a unit of X costs 1 / that.
    const res = await fetch("https://open.er-api.com/v6/latest/PKR");
    if (!res.ok) return json({ error: `Rate source answered ${res.status}` }, 502);
    const body = (await res.json()) as {
      result?: string;
      time_last_update_unix?: number;
      rates?: Record<string, number>;
    };
    if (body.result !== "success" || !body.rates) return json({ error: "Rate source gave no rates" }, 502);

    const asOf = body.time_last_update_unix
      ? new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const rates: Record<string, number> = {};
    for (const code of CURRENCIES) {
      const perRupee = body.rates[code];
      if (typeof perRupee === "number" && perRupee > 0) rates[code] = Math.round((1 / perRupee) * 10000) / 10000;
    }
    if (Object.keys(rates).length === 0) return json({ error: "No usable rates" }, 502);

    const saved = await rpc<number>("save_fx_rates", { p_rates: rates, p_as_of: asOf });
    return json({ status: "saved", saved, as_of: asOf, usd: rates.USD ?? null });
  } catch (err) {
    console.error("fx-rates failed", err);
    return json({ error: "Refresh failed. Check the function logs." }, 500);
  }
});
