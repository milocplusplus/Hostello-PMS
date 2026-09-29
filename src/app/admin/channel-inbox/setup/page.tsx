import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CHANNEL_INBOX_ON_HOLD } from "@/lib/ota";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { noticeBanner } from "@/lib/form-styles";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChannelForwardingGuide } from "@/components/shared/ChannelForwardingGuide";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";

/**
 * Getting every owner's channel emails into the inbox, and seeing whose are
 * arriving.
 *
 * The address is one Hostello inbox (Cloudflare Email Routing → the
 * `cloudflare/email-worker.js` worker → the `ota-email` function). Listings sit
 * on a mix of Hostello's and owners' accounts, so each owner either adds
 * Hostello to the listing or forwards — the guide below is the same one owners
 * see at /client/channel-setup.
 */

type Status = { client_id: string; last_email_at: string | null; emails_30d: number; accounts: string[] };

function since(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Listings are linked, yet nothing has arrived in two weeks. */
function isQuiet(listings: number, lastEmailAt: string | null): boolean {
  if (listings === 0) return false;
  return !lastEmailAt || Date.now() - new Date(lastEmailAt).getTime() > 14 * 86_400_000;
}

export default async function ChannelInboxSetupPage() {
  // On hold: nothing to set up yet — the inbox page shows what's coming.
  if (CHANNEL_INBOX_ON_HOLD) redirect("/admin/channel-inbox");

  const [profile, settings, supabase, h] = await Promise.all([
    currentProfile(),
    loadSettings(),
    createClient(),
    headers(),
  ]);
  const isOwner = canSeeSplit(profile?.role);
  const address = settings.channelInboxAddress;

  const [{ data: units }, { data: status }] = await Promise.all([
    supabase
      .from("properties_v")
      .select("client_id, airbnb_listing_id, booking_hotel_id, clients:clients_v(name)")
      .eq("bookable", true),
    supabase.rpc("channel_intake_status"),
  ]);

  // One row per owner with at least one unit on a channel.
  const owners = new Map<string, { name: string; listings: number }>();
  for (const u of (units ?? []) as unknown as {
    client_id: string;
    airbnb_listing_id: string | null;
    booking_hotel_id: string | null;
    clients: { name: string } | null;
  }[]) {
    const row = owners.get(u.client_id) ?? { name: u.clients?.name ?? "—", listings: 0 };
    if (u.airbnb_listing_id || u.booking_hotel_id) row.listings++;
    owners.set(u.client_id, row);
  }
  const byClient = new Map(((status ?? []) as Status[]).map((s) => [s.client_id, s]));
  const rows = [...owners.entries()]
    .map(([id, o]) => ({ id, ...o, status: byClient.get(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "hostello-pms.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const ownerLink = `${proto}://${host}/client/channel-setup`;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Inbox setup"
        back={{ href: "/admin/channel-inbox", label: "Channel inbox" }}
        info={
          <p>
            Every Airbnb and Booking.com email should reach one Hostello address. Owners either
            add Hostello to their listing or forward the emails; the table shows whose are
            arriving.
          </p>
        }
      />

      {!address ? (
        <p className={noticeBanner}>
          The inbox address isn&apos;t set yet.{" "}
          {isOwner ? (
            <Link href="/admin/settings#channel-inbox" className="text-hostello-gold hover:underline">
              Set it in Settings
            </Link>
          ) : (
            "The owner sets it in Settings."
          )}{" "}
          once the Cloudflare route below is working.
        </p>
      ) : (
        <>
          <div className="card p-4 flex flex-col gap-2">
            <span className="text-xs text-ink-muted">Send owners this page — the same steps, for them:</span>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm break-all">{ownerLink}</span>
              <CopyLinkButton
                value={ownerLink}
                className="text-xs text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 shrink-0"
              />
            </div>
          </div>
          <ChannelForwardingGuide address={address} cohostEmail={settings.channelCohostEmail} audience="staff" />
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-secondary">Whose emails are arriving</h2>
        {rows.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-secondary">No owners with units yet.</p>
        ) : (
          <div className="card divide-y divide-border-hairline">
            {rows.map((r) => {
              const quiet = isQuiet(r.listings, r.status?.last_email_at ?? null);
              return (
                <div key={r.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm truncate">{r.name}</span>
                    <span className={`text-xs shrink-0 ${quiet ? "text-status-pending" : "text-ink-muted"}`}>
                      {r.listings === 0
                        ? "no channel listings linked"
                        : `last email ${since(r.status?.last_email_at ?? null)}`}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted">
                    {r.listings} listing{r.listings === 1 ? "" : "s"} linked
                    {r.status ? ` · ${r.status.emails_30d} email${r.status.emails_30d === 1 ? "" : "s"} in 30 days` : ""}
                    {r.status && r.status.accounts.length > 0 ? ` · from ${r.status.accounts.join(", ")}` : ""}
                    {r.listings === 0 && isOwner && (
                      <>
                        {" · "}
                        <Link href={`/admin/clients/${r.id}/channels`} className="text-hostello-gold hover:underline">
                          link listings
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-ink-muted -mt-1">
          Amber: listings are linked but no email has arrived in two weeks — that owner&apos;s
          forwarding (or Hostello&apos;s co-host access) is probably not set up.
        </p>
      </section>

      {isOwner && (
        <details className="card p-5">
          <summary className="text-sm font-medium cursor-pointer">One-time setup: the address (Cloudflare)</summary>
          <ol className="list-decimal pl-5 mt-3 text-sm flex flex-col gap-2 text-ink-secondary">
            <li>
              Add the domain to Cloudflare (free plan): <em>Add a site</em>, keep the DNS records it
              finds — and check the website ones (A, <code className="text-xs">www</code>) and the
              existing mailbox ones (MX, SPF, DKIM) are all there — then change the nameservers at the
              registrar to the two Cloudflare gives. Check the website and the existing mailbox still
              work once it switches.
            </li>
            <li>
              <em>Workers &amp; Pages</em> → <em>Create</em> → a &quot;Hello World&quot; worker named{" "}
              <code className="text-xs">hostello-intake</code> → <em>Edit code</em> → paste{" "}
              <code className="text-xs">cloudflare/email-worker.js</code> from the repo → <em>Deploy</em>.
            </li>
            <li>
              Worker → <em>Settings</em> → <em>Variables and Secrets</em> → add Secret{" "}
              <code className="text-xs">OTA_SECRET</code>: in Supabase&apos;s SQL editor run{" "}
              <code className="text-xs">
                select decrypted_secret from vault.decrypted_secrets where name = &apos;ota_inbound_secret&apos;;
              </code>{" "}
              and paste the value.
            </li>
            <li>
              The domain → <em>Email</em> → <em>Email Routing</em>. If the domain already has a
              mailbox (hostello.pro does — info@ on Titan), <strong>do not enable it for the main
              domain</strong>: that replaces its MX records and stops info@. Instead, under{" "}
              <em>Settings → Subdomains</em>, add <code className="text-xs">in</code>, then create
              the custom address <code className="text-xs">bookings@in.…</code> → action{" "}
              <em>Send to a Worker</em> → <code className="text-xs">hostello-intake</code>.
            </li>
            <li>
              Put that address in{" "}
              <Link href="/admin/settings#channel-inbox" className="text-hostello-gold hover:underline">
                Settings → Channel inbox
              </Link>
              , then forward one old Airbnb email to it: it should appear in the inbox within a
              minute.
            </li>
          </ol>
        </details>
      )}
    </div>
  );
}
