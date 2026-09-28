import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { secondaryButton } from "@/lib/form-styles";

/**
 * How a channel account's reservation emails reach Hostello's inbox.
 *
 * One guide for both portals — the owner page and the staff setup page — so
 * the steps an owner is sent and the steps staff read cannot drift apart.
 * Best route first: Hostello as co-host / extranet user gets the emails
 * directly with nothing for the owner to maintain; forwarding is the fallback.
 */
export function ChannelForwardingGuide({
  address,
  cohostEmail,
  audience,
}: {
  address: string;
  cohostEmail: string | null;
  audience: "owner" | "staff";
}) {
  const you = audience === "owner" ? "you" : "the owner";
  const invite = cohostEmail ?? (audience === "owner" ? "the email Hostello gives you" : "Hostello's account email");

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[11px] text-ink-muted">Hostello&apos;s booking inbox</span>
          <span className="text-sm font-medium break-all">{address}</span>
        </div>
        <CopyLinkButton value={address} className={`${secondaryButton} inline-flex items-center gap-1.5 shrink-0`} />
      </div>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">1. Best: add Hostello to the listing</h2>
        <p className="text-xs text-ink-muted">
          Hostello then gets every booking, change and cancellation email for that listing
          directly — nothing to forward, nothing to keep switched on.
        </p>
        <ol className="list-decimal pl-5 text-sm flex flex-col gap-2">
          <li>
            <strong>Airbnb:</strong> open the listing → <em>Co-hosts</em> (in the app: Listings →
            the listing → Co-hosts) → <em>Invite a co-host</em> → enter{" "}
            <span className="text-hostello-gold break-all">{invite}</span>. Give access to
            reservations and the calendar.
          </li>
          <li>
            <strong>Booking.com:</strong> in the extranet, open the property&apos;s{" "}
            <em>Contacts</em> (Property → General info) and add{" "}
            <span className="text-hostello-gold break-all">{address}</span> as the{" "}
            <em>Reservations</em> contact. Booking emails then come straight to Hostello.
          </li>
        </ol>
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">2. Otherwise: forward the emails automatically</h2>
        <p className="text-xs text-ink-muted">
          For an account {you} would rather not share. Only Airbnb and Booking.com emails are
          forwarded; Hostello ignores anything else that arrives.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <strong>Gmail (on a computer)</strong>
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>
              Settings (gear) → <em>See all settings</em> → <em>Forwarding and POP/IMAP</em> →{" "}
              <em>Add a forwarding address</em> → {address}.
            </li>
            <li>
              Gmail sends Hostello a confirmation. Hostello confirms it from the channel inbox —
              {audience === "owner" ? " let Hostello know you've done this step." : " it appears there as its own card."}
            </li>
            <li>
              <em>Filters and Blocked Addresses</em> → <em>Create a new filter</em> → in{" "}
              <em>From</em> type <code className="text-xs">airbnb.com OR booking.com</code> →{" "}
              <em>Create filter</em> → tick <em>Forward it to</em> {address} → <em>Create filter</em>.
              Don&apos;t tick &quot;Delete it&quot; — {you} keep your own copy.
            </li>
          </ol>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <strong>Outlook / Hotmail</strong>
          <ol className="list-decimal pl-5 flex flex-col gap-1.5">
            <li>
              Settings → <em>Mail</em> → <em>Rules</em> → <em>Add new rule</em>.
            </li>
            <li>
              Condition <em>From</em> contains <code className="text-xs">airbnb.com</code>, add
              another for <code className="text-xs">booking.com</code>; action{" "}
              <em>Forward to</em> {address}. Save.
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}
