import { redirect } from "next/navigation";
import { LogIn, LogOut, BedDouble, Wallet, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { todayISO, formatFullDate, formatDayMonth } from "@/lib/calendar";
import { TodayBoard, type TodayStay } from "@/components/shared/TodayBoard";
import { markClientStayProgress } from "@/app/client/bookings/actions";

type Row = {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guests_count: number | null;
  check_in: string;
  check_out: string;
  source: string;
  status: string;
  client_payout: number | null;
  settled: boolean;
  checked_in_at: string | null;
  checked_out_at: string | null;
  booking_properties: unknown;
};

function unitNames(row: { booking_properties: unknown }): string {
  return ((row.booking_properties as { properties: { name: string } | null }[] | null) ?? [])
    .map((bp) => bp.properties?.name)
    .filter(Boolean)
    .join(", ");
}

export default async function ClientTodayPage() {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const today = todayISO();
  const fields =
    "id, guest_name, guest_phone, guests_count, check_in, check_out, source, status, client_payout, settled, checked_in_at, checked_out_at, booking_properties(properties(name))";

  const [{ data: stays }, { data: unsettled }, { data: blocks }] = await Promise.all([
    supabase
      .from("bookings")
      .select(fields)
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .lte("check_in", today)
      .gte("check_out", today)
      .order("check_in"),
    supabase
      .from("bookings")
      .select("client_payout")
      .eq("client_id", clientRecord.id)
      .neq("status", "cancelled")
      .eq("settled", false),
    supabase
      .from("calendar_blocks")
      .select("id, start_date, end_date, block_type, notes, properties(name)")
      .lte("start_date", today)
      .gte("end_date", today),
  ]);

  const toStay = (b: Row): TodayStay => ({
    id: b.id,
    guestName: b.guest_name,
    units: unitNames(b),
    clientName: clientRecord.name,
    guests: b.guests_count,
    phone: b.guest_phone,
    source: b.source,
    status: b.status,
    checkIn: b.check_in,
    checkOut: b.check_out,
    // The owner sees their own payout, never Hostello's share.
    amount: b.client_payout === null ? null : Number(b.client_payout),
    href: `/client/bookings/${b.id}`,
    checkedInAt: b.checked_in_at,
    checkedOutAt: b.checked_out_at,
  });

  const rows = (stays ?? []) as unknown as Row[];
  const arrivals = rows.filter((b) => b.check_in === today).map(toStay);
  const departures = rows.filter((b) => b.check_out === today).map(toStay);
  const staying = rows.filter((b) => b.check_in < today && b.check_out > today).map(toStay);
  const awaiting = (unsettled ?? []).reduce((s, b) => s + Number(b.client_payout ?? 0), 0);

  const blocked = (blocks ?? []) as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    block_type: string;
    notes: string | null;
    properties: unknown;
  }[];

  const tiles = [
    { label: "Arriving", value: String(arrivals.length), icon: LogIn, tint: "var(--color-positive)" },
    {
      label: "Departing",
      value: String(departures.length),
      icon: LogOut,
      tint: "var(--color-hostello-purple-glow)",
    },
    {
      label: "In house",
      value: String(arrivals.length + staying.length),
      icon: BedDouble,
      tint: "var(--color-channel-booking)",
    },
    {
      label: "Awaiting payout",
      value: formatPKR(awaiting),
      icon: Wallet,
      tint: "var(--color-hostello-gold)",
    },
  ];

  return (
    <div className="flex flex-col gap-4 animate-in">
      <div>
        <p className="text-ink-muted text-xs tracking-wide">OVERVIEW</p>
        <h1 className="text-2xl font-semibold mt-1">Today</h1>
        <p className="text-sm text-ink-secondary mt-1.5">{formatFullDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4 flex flex-col gap-1.5">
            <span
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ backgroundColor: `color-mix(in srgb, ${t.tint} 20%, transparent)` }}
            >
              <t.icon size={15} style={{ color: t.tint }} />
            </span>
            <p className="text-xl font-semibold leading-none mt-1 truncate">{t.value}</p>
            <p className="text-[11px] text-ink-muted">{t.label}</p>
          </div>
        ))}
      </div>

      <TodayBoard
        arrivals={arrivals}
        departures={departures}
        staying={staying}
        progressAction={markClientStayProgress}
      />

      {blocked.length > 0 && (
        <section className="card overflow-hidden flex flex-col">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-hairline">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-status-blocked) 25%, transparent)",
              }}
            >
              <Lock size={14} style={{ color: "var(--color-status-blocked)" }} />
            </span>
            <h2 className="text-sm font-medium flex-1">Blocked today</h2>
            <span className="text-xs text-ink-muted">{blocked.length}</span>
          </div>
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {blocked.map((bl) => (
              <li key={bl.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary truncate">
                    {(bl.properties as { name: string } | null)?.name ?? "—"}
                  </p>
                  <p className="text-xs text-ink-secondary truncate mt-0.5">
                    {formatDayMonth(bl.start_date)} – {formatDayMonth(bl.end_date)}
                    {bl.notes ? ` · ${bl.notes}` : ""}
                  </p>
                </div>
                <span className="text-[11px] text-ink-muted shrink-0 capitalize">
                  {bl.block_type}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
