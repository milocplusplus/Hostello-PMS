import { redirect } from "next/navigation";
import { LogIn, LogOut, TriangleAlert, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { rowShortStay, departureDate } from "@/lib/short-stay";
import { currentUser } from "@/lib/auth";
import { todayISO, addDaysISO, formatFullDate } from "@/lib/calendar";
import { StaySection, type TodayStay } from "@/components/shared/TodayBoard";
import { markStayProgress } from "@/app/admin/bookings/actions";

/** How far back a missed tick is still worth chasing. */
const LOOKBACK_DAYS = 30;
/** How far ahead the board lets you tick early. */
const LOOKAHEAD_DAYS = 7;

type Row = {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guests_count: number | null;
  check_in: string;
  check_out: string;
  source: string;
  status: string;
  sale_price: number | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  is_short_stay: boolean;
  short_stay_start: string | null;
  short_stay_end: string | null;
  clients: unknown;
  booking_properties: unknown;
};

function toStay(b: Row): TodayStay {
  return {
    id: b.id,
    guestName: b.guest_name,
    units: ((b.booking_properties as { properties: { name: string } | null }[] | null) ?? [])
      .map((bp) => bp.properties?.name)
      .filter(Boolean)
      .join(", "),
    clientName: (b.clients as { name: string } | null)?.name ?? null,
    guests: b.guests_count,
    phone: b.guest_phone,
    source: b.source,
    status: b.status,
    checkIn: b.check_in,
    checkOut: b.check_out,
    amount: b.sale_price === null ? null : Number(b.sale_price),
    href: `/admin/bookings/${b.id}`,
    checkedInAt: b.checked_in_at,
    checkedOutAt: b.checked_out_at,
    shortStay: rowShortStay(b),
  };
}

export default async function AdminCheckInsPage() {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const today = todayISO();
  const from = addDaysISO(today, -LOOKBACK_DAYS);
  const until = addDaysISO(today, LOOKAHEAD_DAYS);

  const { data } = await supabase
    .from("bookings")
    .select(
      "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, sale_price, checked_in_at, checked_out_at, is_short_stay, short_stay_start, short_stay_end, clients(name), booking_properties(properties(name))"
    )
    .neq("status", "cancelled")
    .gte("check_out", from)
    .lte("check_in", until)
    .order("check_in");

  const rows = ((data ?? []) as unknown as Row[]).map(toStay);

  // A stay produces two independent jobs — an arrival and a departure — and
  // they fall due on different days, so each is grouped on its own date.
  const arrivingToday = rows.filter((s) => s.checkIn === today);
  // A short stay is out the same day it arrives, so its departure job is that
  // date — never the check-out morning it is stored with.
  const leaves = (s: TodayStay) => departureDate(s.checkIn, s.checkOut, Boolean(s.shortStay));

  const departingToday = rows.filter((s) => leaves(s) === today);
  const missedArrivals = rows.filter((s) => s.checkIn < today && !s.checkedInAt);
  const missedDepartures = rows.filter((s) => leaves(s) < today && !s.checkedOutAt);
  const arrivingSoon = rows.filter((s) => s.checkIn > today);
  const departingSoon = rows.filter((s) => leaves(s) > today && leaves(s) <= until);

  const leftToday =
    arrivingToday.filter((s) => !s.checkedInAt).length +
    departingToday.filter((s) => !s.checkedOutAt).length;
  const missed = missedArrivals.length + missedDepartures.length;

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">OPERATIONS</p>
        <h1 className="text-2xl font-semibold mt-1">Check-ins &amp; check-outs</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          {formatFullDate(today)} ·{" "}
          {leftToday === 0
            ? "Nothing left to mark today"
            : `${leftToday} still to mark today`}
          {missed > 0 && ` · ${missed} missed earlier`}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StaySection
          title="Arriving today"
          icon={LogIn}
          tint="var(--color-positive)"
          stays={arrivingToday}
          empty="No arrivals today."
          step="in"
          progressAction={markStayProgress}
        />
        <StaySection
          title="Departing today"
          icon={LogOut}
          tint="var(--color-hostello-purple-glow)"
          stays={departingToday}
          empty="No departures today."
          step="out"
          progressAction={markStayProgress}
        />

        {/* The reason this page exists: the day sheet only ever shows today, so
            an arrival nobody marked is invisible from the day after. */}
        {missedArrivals.length > 0 && (
          <StaySection
            title="Never marked arrived"
            note={`Check-in has passed. Showing the last ${LOOKBACK_DAYS} days.`}
            icon={TriangleAlert}
            tint="var(--color-status-pending)"
            stays={missedArrivals}
            empty=""
            step="in"
            progressAction={markStayProgress}
          />
        )}
        {missedDepartures.length > 0 && (
          <StaySection
            title="Never marked departed"
            note={`Check-out has passed. Showing the last ${LOOKBACK_DAYS} days.`}
            icon={TriangleAlert}
            tint="var(--color-status-pending)"
            stays={missedDepartures}
            empty=""
            step="out"
            progressAction={markStayProgress}
          />
        )}

        {arrivingSoon.length > 0 && (
          <StaySection
            title="Arriving soon"
            note={`Next ${LOOKAHEAD_DAYS} days — mark an early arrival here.`}
            icon={CalendarClock}
            tint="var(--color-channel-booking)"
            stays={arrivingSoon}
            empty=""
            step="in"
            progressAction={markStayProgress}
          />
        )}
        {departingSoon.length > 0 && (
          <StaySection
            title="Departing soon"
            note={`Next ${LOOKAHEAD_DAYS} days.`}
            icon={CalendarClock}
            tint="var(--color-channel-booking)"
            stays={departingSoon}
            empty=""
            step="out"
            progressAction={markStayProgress}
          />
        )}
      </div>
    </div>
  );
}
