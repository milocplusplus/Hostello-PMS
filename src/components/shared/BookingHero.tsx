import Link from "next/link";
import { ArrowLeft, Clock, Home, MessageCircle, Pencil, Phone, Users } from "lucide-react";
import { unitArt } from "@/lib/unit-tint";
import { Avatar } from "@/components/shared/Avatar";
import { ChannelChip, StayBar } from "@/components/shared/BookingCard";

export type HeroUnit = { id: string; name: string; detail: string; href?: string; photo?: string | null };

/**
 * The top of a booking: a colour banner for the unit (a photo, once units have
 * one), the guest, the nights, and the ways to reach them. Shared by the admin
 * and owner booking pages; everything below it is each page's own.
 */
export function BookingHero({
  backHref,
  guestName,
  subtitle,
  source,
  status,
  units,
  checkIn,
  checkOut,
  today,
  hours,
  guests,
  timing,
  phone,
  waNumber,
  editHref,
}: {
  backHref: string;
  guestName: string | null;
  subtitle?: string | null;
  source: string;
  status: string;
  units: HeroUnit[];
  checkIn: string;
  checkOut: string;
  today: string;
  /** A short stay's window; null for a stay of nights. */
  hours: string | null;
  guests: number | null;
  /** "Arriving 14:00 · leaving 11:00", when either is known. */
  timing: string | null;
  phone: string | null;
  waNumber: string | null;
  editHref?: string;
}) {
  const round =
    "w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90";
  return (
    <section className="card overflow-hidden">
      <div
        className="relative h-36 md:h-40 p-4 flex flex-col justify-between overflow-hidden"
        style={{ background: unitArt(units[0]?.name ?? "unit", units[0]?.photo) }}
      >
        {!units[0]?.photo && (
          <Home size={180} strokeWidth={1} className="absolute -right-6 -top-8 text-white/20" aria-hidden />
        )}
        <div className="relative flex items-center justify-between gap-3">
          <Link href={backHref} aria-label="Back" className={`${round} bg-black/35 backdrop-blur-sm text-white`}>
            <ArrowLeft size={20} />
          </Link>
          <span className="flex items-center gap-2">
            {status !== "confirmed" && (
              <span className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-sm text-[11px] font-extrabold capitalize text-status-pending">
                {status}
              </span>
            )}
            <ChannelChip source={source} />
          </span>
        </div>
        {/* Right-aligned: the guest avatar overlaps the banner's bottom-left */}
        <div className="relative flex gap-2 flex-wrap justify-end pl-20">
          {units.length === 0 && (
            <span className="px-2.5 py-1 rounded-full bg-black/45 text-xs font-bold text-white">No unit</span>
          )}
          {units.map((u) => {
            const chip = (
              <>
                <span className="font-extrabold">{u.name}</span>
                {u.detail && <span className="text-white/70"> · {u.detail}</span>}
              </>
            );
            const cls = "px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-sm text-xs text-white";
            return u.href ? (
              <Link key={u.id} href={u.href} className={`${cls} hover:bg-black/60`}>
                {chip}
              </Link>
            ) : (
              <span key={u.id} className={cls}>
                {chip}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative px-4 md:px-5 pb-5 flex flex-col gap-4">
        <div className="flex items-end gap-3 -mt-7">
          <span className="rounded-full ring-4 ring-surface-1">
            <Avatar name={guestName} size={64} />
          </span>
          <div className="min-w-0 pb-1">
            <h1 className="text-2xl truncate">{guestName ?? "Guest"}</h1>
            {subtitle && <p className="text-xs text-ink-secondary truncate">{subtitle}</p>}
          </div>
        </div>

        <StayBar checkIn={checkIn} checkOut={checkOut} today={today} hours={hours} />

        <div className="flex items-center gap-2 flex-wrap">
          {guests != null && (
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/6 text-xs font-bold">
              <Users size={14} className="text-hostello-purple-light" />
              {guests}
            </span>
          )}
          {timing && (
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/6 text-xs font-bold">
              <Clock size={14} className="text-hostello-purple-light" />
              {timing}
            </span>
          )}
          <span className="flex-1" />
          {phone && (
            <a href={`tel:${phone}`} aria-label={`Call ${phone}`} className={`${round} bg-white/8 text-ink-primary`}>
              <Phone size={18} />
            </a>
          )}
          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
              className={`${round} bg-[#25d366] text-white`}
            >
              <MessageCircle size={18} />
            </a>
          )}
          {editHref && (
            <Link href={editHref} aria-label="Edit booking" className={`${round} pill-active`}>
              <Pencil size={17} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Sale price, advance and balance as three tiles, balance in gold. */
export function PaymentTiles({
  sale,
  advance,
  balance,
  note,
}: {
  sale: string;
  advance: string;
  balance: string;
  /** How the total was built, when it was not typed as one. */
  note?: string | null;
}) {
  const tiles = [
    { label: "Price", value: sale, cls: "text-ink-primary" },
    { label: "Advance", value: advance, cls: "text-ink-primary" },
    { label: "Balance", value: balance, cls: "text-hostello-gold-bright" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white/5 px-3 py-2.5 min-w-0">
            <p className="text-[11px] font-bold text-ink-muted">{t.label}</p>
            <p className={`num text-sm md:text-base font-extrabold truncate ${t.cls}`}>{t.value}</p>
          </div>
        ))}
      </div>
      {note && <p className="text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
