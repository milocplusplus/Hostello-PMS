import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Home, Users } from "lucide-react";
import { addDaysISO, daysBetweenISO, formatDayMonth } from "@/lib/calendar";
import { nightsBetween } from "@/lib/payout";
import { sourceColor, sourceLabel } from "@/lib/block-sources";
import { unitArt } from "@/lib/unit-tint";
import { Avatar } from "@/components/shared/Avatar";

/**
 * The stay as a strip of nights: gone ones lit violet, tonight gold, the rest
 * dim. Past two weeks the segments get too thin to read, so a long stay is one
 * progress bar instead. A short stay has no nights, only its hours.
 */
export function StayBar({
  checkIn,
  checkOut,
  today,
  hours,
}: {
  checkIn: string;
  checkOut: string;
  today: string;
  hours?: string | null;
}) {
  if (hours) {
    return (
      <p className="flex items-center gap-2 text-xs font-bold">
        <Clock size={14} className="text-hostello-gold-bright" />
        {formatDayMonth(checkIn)} · {hours}
      </p>
    );
  }
  const nights = nightsBetween(checkIn, checkOut);
  const done = Math.min(nights, Math.max(0, daysBetweenISO(checkIn, today)));
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-extrabold whitespace-nowrap">{formatDayMonth(checkIn)}</span>
      {nights <= 14 ? (
        <span className="flex-1 flex gap-[3px]">
          {Array.from({ length: nights }, (_, i) => {
            const night = addDaysISO(checkIn, i);
            const cls =
              night < today
                ? "bg-hostello-purple-light/60"
                : night === today
                  ? "gradient-gold shadow-[0_0_8px_var(--color-hostello-gold-bright)]"
                  : "bg-white/12";
            return <span key={night} className={`flex-1 h-2 rounded-full ${cls}`} />;
          })}
        </span>
      ) : (
        <span className="flex-1 h-2 rounded-full bg-white/12 overflow-hidden">
          <span
            className="block h-full rounded-full bg-hostello-purple-light/70"
            style={{ width: `${(done / nights) * 100}%` }}
          />
        </span>
      )}
      <span className="text-xs font-extrabold whitespace-nowrap">{formatDayMonth(checkOut)}</span>
      <span className="num text-[11px] font-extrabold px-2 py-0.5 rounded-lg bg-white/8 text-ink-secondary">
        {nights}N
      </span>
    </div>
  );
}

/** Channel as a dot and a short name, on a dark chip that reads over any tint. */
export function ChannelChip({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 text-[11px] font-extrabold text-white">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceColor(source) }} />
      {(sourceLabel(source) ?? "Other").split(/[ (]/)[0]}
    </span>
  );
}

/**
 * One stay in a list: a colour banner standing in for the unit's photo, the
 * guest, the price and the nights. Shared by the admin and owner lists.
 * `footer` holds per-row actions (cancel), outside the link so a form can live
 * there.
 */
export function BookingCard({
  href,
  guestName,
  units,
  subtitle,
  source,
  status,
  checkIn,
  checkOut,
  hours,
  guests,
  price,
  today,
  footer,
  photo,
}: {
  href: string;
  guestName: string | null;
  units: string;
  subtitle?: string | null;
  source: string;
  status: string;
  checkIn: string;
  checkOut: string;
  hours?: string | null;
  guests?: number | null;
  price: string | null;
  today: string;
  footer?: ReactNode;
  /** The first unit's photo path, when it has one. */
  photo?: string | null;
}) {
  const cancelled = status === "cancelled";
  return (
    <article className={`card overflow-hidden flex flex-col ${cancelled ? "opacity-60" : ""}`}>
      <Link href={href} className="block active:scale-[0.99] transition-transform">
        <div
          className="relative h-20 px-3.5 py-3 flex items-end justify-between gap-2 overflow-hidden"
          style={{ background: unitArt(units || "unit", photo) }}
        >
          {!photo && (
            <Home
              size={112}
              strokeWidth={1.2}
              className="absolute -right-3 -top-5 text-white/20"
              aria-hidden
            />
          )}
          <span className="relative min-w-0 truncate px-2.5 py-1 rounded-full bg-black/55 text-xs font-bold text-white">
            {units || "No unit"}
          </span>
          <span className="relative shrink-0">
            <ChannelChip source={source} />
          </span>
        </div>
        <div className="p-3.5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={guestName} size={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-extrabold truncate">{guestName ?? "Guest"}</span>
                {status !== "confirmed" && (
                  <span
                    className={`shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full capitalize ${
                      cancelled
                        ? "bg-white/8 text-ink-muted"
                        : "border border-dashed border-status-pending text-status-pending"
                    }`}
                  >
                    {status}
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1.5 text-xs text-ink-secondary truncate">
                {guests != null && (
                  <>
                    <Users size={13} className="shrink-0" />
                    {guests}
                  </>
                )}
                {subtitle && <span className="truncate">{guests != null ? `· ${subtitle}` : subtitle}</span>}
              </span>
            </div>
            {price && (
              <span className="num shrink-0 text-[15px] font-extrabold text-hostello-gold-bright">{price}</span>
            )}
          </div>
          <StayBar checkIn={checkIn} checkOut={checkOut} today={today} hours={hours} />
        </div>
      </Link>
      {footer && (
        <div className="mt-auto border-t border-white/5 px-3.5 py-2 flex items-center justify-end gap-3">
          {footer}
        </div>
      )}
    </article>
  );
}
