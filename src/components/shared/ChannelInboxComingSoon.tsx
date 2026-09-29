import Link from "next/link";
import type { CSSProperties } from "react";
import { BellRing, CalendarSync, Coins, Sparkles, UserCheck } from "lucide-react";
import { sourceColor } from "@/lib/block-sources";

/**
 * The Channel inbox while it is on hold (`CHANNEL_INBOX_ON_HOLD` in ota.ts):
 * what it will do, shown as something to look forward to.
 *
 * Deliberately no dates, names or figures. Nothing here has happened yet, and
 * the app never shows made-up data — the "preview" card is shimmer, not a
 * fake booking.
 */

type Audience = "staff" | "owner";

const COPY: Record<
  Audience,
  { sub: string; features: { icon: typeof UserCheck; title: string; body: string }[]; footer: string }
> = {
  staff: {
    sub: "Every booking, change and cancellation from Airbnb and Booking.com — straight into Hostello, ready to approve.",
    features: [
      {
        icon: UserCheck,
        title: "Guest names & prices, filled in",
        body: "Channel bookings arrive with the guest, the dates and the payout already on them. No more typing them up.",
      },
      {
        icon: CalendarSync,
        title: "Cancellations & changes in one tap",
        body: "When a guest cancels or moves their dates, it lands here — one tap and the booking is updated.",
      },
      {
        icon: BellRing,
        title: "Instant phone alerts",
        body: "A notification the moment a channel booking comes in, so nobody misses a last-minute guest.",
      },
      {
        icon: Coins,
        title: "USD converted to rupees",
        body: "Payouts quoted in dollars are turned into rupees for you, at the day's rate.",
      },
    ],
    footer: "Until it's switched on, add channel bookings from Bookings as usual.",
  },
  owner: {
    sub: "Your Airbnb and Booking.com reservations — guest names, dates and prices — straight into your Hostello account.",
    features: [
      {
        icon: UserCheck,
        title: "Guest names & prices, filled in",
        body: "Every channel booking shows up with the guest, the dates and the price already on it.",
      },
      {
        icon: CalendarSync,
        title: "Cancellations & changes, kept in step",
        body: "When a guest cancels or changes their dates, your bookings update to match.",
      },
      {
        icon: BellRing,
        title: "Instant phone alerts",
        body: "A notification on your phone the moment a new booking comes in.",
      },
      {
        icon: Coins,
        title: "USD converted to rupees",
        body: "Payouts quoted in dollars show in rupees, at the day's rate.",
      },
    ],
    footer: "Hostello will let you know the moment it's switched on — there's nothing you need to do yet.",
  },
};

/** One channel on the left, its bookings flowing towards Hostello. */
function ChannelLane({ name, source, delay }: { name: string; source: string; delay: string }) {
  const color = sourceColor(source);
  return (
    <div className="flex items-center gap-3">
      <span
        className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border bg-surface-1/80"
        style={{ borderColor: color, color }}
      >
        {name}
      </span>
      <div className="relative flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}>
        {[0, 0.8, 1.6].map((offset) => (
          <span
            key={offset}
            className="flow-dot absolute -top-[3px] left-0 w-1.5 h-1.5 rounded-full"
            style={
              {
                backgroundColor: color,
                boxShadow: `0 0 10px ${color}`,
                animationDelay: `calc(${delay} + ${offset}s)`,
                "--flow-distance": "min(9rem, 26vw)",
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

export function ChannelInboxComingSoon({ audience }: { audience: Audience }) {
  const copy = COPY[audience];

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[30px] border border-border-hairline bg-surface-1 px-5 py-10 md:px-10 md:py-14">
        {/* Glow behind everything — purple and gold, drifting. */}
        <span className="orb w-72 h-72 -top-24 -left-20 bg-hostello-purple-glow/40" aria-hidden />
        <span className="orb w-64 h-64 -bottom-24 -right-16 bg-hostello-gold/25" aria-hidden />
        <span className="orb w-56 h-56 top-1/3 left-1/2 bg-hostello-magenta/20" aria-hidden />

        <div className="relative flex flex-col items-center text-center gap-5">
          <span className="pulse-gold inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-hostello-gold-bright bg-surface-0/60">
            <Sparkles size={13} aria-hidden />
            Coming soon
          </span>

          <h1 className="text-3xl md:text-5xl font-semibold leading-tight max-w-2xl">
            Get Airbnb and Booking.com{" "}
            <span className="text-gradient-brand">reservation updates</span> here
          </h1>

          <p className="text-sm md:text-base text-ink-secondary max-w-xl">{copy.sub}</p>

          {/* Channels on the left, flowing into Hostello on the right. */}
          <div className="w-full max-w-md mt-4 flex items-center gap-4">
            <div className="flex-1 flex flex-col gap-4">
              <ChannelLane name="Airbnb" source="airbnb" delay="0s" />
              <ChannelLane name="Booking.com" source="booking_com" delay="1.2s" />
            </div>
            <div className="bob shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-3xl gradient-brand flex items-center justify-center text-white text-2xl md:text-3xl font-bold shadow-[0_18px_40px_-12px_rgba(139,92,246,0.8)]">
              H
            </div>
          </div>

          {/* What a card will look like — shimmer, not a made-up booking. */}
          <div className="w-full max-w-sm mt-6 card-hero p-4 text-left flex flex-col gap-3" aria-hidden>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold opacity-90">New reservation</span>
              <span className="text-[10px] rounded-full bg-white/15 px-2 py-0.5">Preview</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="skeleton h-3 w-2/3 rounded-full opacity-70" />
              <span className="skeleton h-3 w-1/2 rounded-full opacity-60" />
              <span className="skeleton h-3 w-1/3 rounded-full opacity-50" />
            </div>
            <span className="self-start text-xs font-semibold rounded-full bg-white text-hostello-purple px-3 py-1">
              {audience === "staff" ? "Approve" : "Added to your calendar"}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {copy.features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card card-hover p-5 flex gap-4">
            <span className="shrink-0 w-10 h-10 rounded-2xl gradient-brand-subtle flex items-center justify-center text-hostello-gold-bright">
              <Icon size={19} aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-xs text-ink-secondary leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </section>

      <p className="text-center text-xs text-ink-muted">
        {copy.footer}{" "}
        {audience === "staff" && (
          <Link href="/admin/bookings/new" className="text-hostello-gold hover:underline">
            New booking
          </Link>
        )}
      </p>
    </div>
  );
}
