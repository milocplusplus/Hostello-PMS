import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { KIND_LABEL, type OtaMessageKind, type ParsedReservation } from "@/lib/ota";
import { formatDayMonth } from "@/lib/calendar";
import { errorBanner, fieldInput, fieldLabel, noticeBanner, primaryButton } from "@/lib/form-styles";
import { ChannelForwardingGuide } from "@/components/shared/ChannelForwardingGuide";
import { EmptyState, PageHeader } from "@/components/shared/PageHeader";
import { SubmitButton } from "@/components/shared/Busy";
import { dismissEmail, saveChannelEmail } from "./actions";

type Row = {
  id: string;
  kind: OtaMessageKind;
  status: string;
  subject: string | null;
  from_email: string | null;
  received_at: string;
  raw_text: string | null;
  admin_note: string | null;
  booking_id: string | null;
  property_id: string | null;
  parsed: ParsedReservation | null;
};

/** Gmail asks the receiving address to confirm a forwarding filter; this pulls out the link and code. */
function gmailForwarding(row: Row): { link: string | null; code: string | null } | null {
  if (!/forwarding-noreply@google\.com/i.test(row.from_email ?? "") && !/gmail forwarding confirmation/i.test(row.subject ?? "")) {
    return null;
  }
  const text = row.raw_text ?? "";
  return {
    link: text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"<>]+/i)?.[0] ?? null,
    code: text.match(/confirmation code:\s*(\d+)/i)?.[1] ?? null,
  };
}

function summary(row: Row): string {
  const p = row.parsed;
  const dates = p?.check_in ? `${formatDayMonth(p.check_in)}${p.check_out ? ` → ${formatDayMonth(p.check_out)}` : ""}` : null;
  return [p?.guest_name, dates, p?.listing].filter(Boolean).join(" · ") || row.subject || "Airbnb email";
}

export default async function HostEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const client = await currentClient();
  if (!client || client.account_type !== "host") redirect("/client");

  const supabase = await createClient();
  const [settings, { data: me }, { data: messages }] = await Promise.all([
    loadSettings(),
    supabase.from("clients").select("channel_email").eq("id", client.id).maybeSingle(),
    supabase
      .from("ota_messages")
      .select("id, kind, status, subject, from_email, received_at, raw_text, admin_note, booking_id, property_id, parsed")
      .eq("client_id", client.id)
      .order("received_at", { ascending: false })
      .limit(40),
  ]);

  const rows = (messages ?? []) as unknown as Row[];
  const needsYou = rows.filter((r) => ["pending", "needs_property", "failed"].includes(r.status));
  const added = rows.filter((r) => r.status === "applied");
  const address = settings.channelInboxAddress;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Airbnb emails"
        sub="Bookings from your Airbnb emails, added for you."
        info={
          <p>
            Forward your Airbnb emails to Hostello and each new booking, change and cancellation is
            added to your calendar by itself, with the guest, dates and price filled in.
          </p>
        }
      />

      {error && <p className={errorBanner}>{error}</p>}
      {notice && <p className={noticeBanner}>{notice}</p>}

      {!address ? (
        <EmptyState
          icon={Inbox}
          title={<>Not switched on yet.</>}
          body="Your calendar links still keep your dates in step, and you can add bookings by hand. This page fills in once Hostello turns on its email address."
        />
      ) : (
        <>
          <section className="card p-5 flex flex-col gap-3">
            <h2 className="text-base">1. Your Airbnb email</h2>
            <p className="text-xs text-ink-secondary">
              The email address your Airbnb account uses. Only mail sent to this address is added
              automatically.
            </p>
            <form action={saveChannelEmail} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
                <label htmlFor="channel_email" className={fieldLabel}>
                  Airbnb account email
                </label>
                <input
                  id="channel_email"
                  name="channel_email"
                  type="email"
                  defaultValue={me?.channel_email ?? ""}
                  placeholder="you@gmail.com"
                  className={fieldInput}
                />
              </div>
              <SubmitButton className={primaryButton} busy="Saving…">
                Save
              </SubmitButton>
            </form>
            <p className="text-xs text-ink-secondary">
              Each property also needs its Airbnb listing link, added when you{" "}
              <Link href="/client/properties" className="text-hostello-gold hover:underline">
                edit the property
              </Link>
              , so an email finds the right one.
            </p>
          </section>

          <section className="card p-5 flex flex-col gap-3">
            <h2 className="text-base">2. Forward the emails</h2>
            <ChannelForwardingGuide address={address} cohostEmail={null} audience="owner" forwardOnly />
          </section>
        </>
      )}

      {needsYou.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg">Needs you</h2>
          <ul className="flex flex-col gap-3">
            {needsYou.map((r) => {
              const gmail = gmailForwarding(r);
              return (
                <li key={r.id} className="card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-primary">
                        {gmail ? "Gmail wants to confirm forwarding" : KIND_LABEL[r.kind] ?? "Airbnb email"}
                      </p>
                      {!gmail && <p className="text-xs text-ink-secondary">{summary(r)}</p>}
                    </div>
                    <span className="text-[11px] text-ink-muted shrink-0">{formatDayMonth(r.received_at.slice(0, 10))}</span>
                  </div>

                  {gmail ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-ink-secondary">
                        This is Gmail checking that you meant to forward your Airbnb emails here. Open the
                        link to say yes{gmail.code ? <>, or type the code <span className="text-ink-primary">{gmail.code}</span> into Gmail</> : ""}.
                      </p>
                      {gmail.link && (
                        <a href={gmail.link} target="_blank" rel="noreferrer" className={`${primaryButton} self-start`}>
                          Confirm forwarding
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-status-pending">
                      {r.admin_note ??
                        (r.status === "needs_property"
                          ? "No property is linked to this Airbnb listing yet. Add the listing link to the property."
                          : "We could not read this email.")}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {!gmail && r.kind === "new_booking" && r.parsed?.check_in && (
                      <Link
                        href={`/client/bookings/new?date=${r.parsed.check_in}${r.parsed.check_out ? `&checkout=${r.parsed.check_out}` : ""}${r.property_id ? `&property=${r.property_id}` : ""}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Add by hand
                      </Link>
                    )}
                    <form action={dismissEmail}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="text-xs text-ink-muted hover:text-ink-primary" busy="Dismissing…">
                        {gmail ? "Done" : "Dismiss"}
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Added for you</h2>
        {added.length === 0 ? (
          <EmptyState icon={MailCheck} inset title="Nothing yet." body="Bookings added from your emails will be listed here." />
        ) : (
          <ul className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
            {added.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink-primary truncate">{KIND_LABEL[r.kind] ?? "Airbnb email"}</p>
                  <p className="text-xs text-ink-secondary truncate">{summary(r)}</p>
                </div>
                {r.booking_id && (
                  <Link href={`/client/bookings/${r.booking_id}`} className="text-xs text-hostello-gold hover:underline shrink-0">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
