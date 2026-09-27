import Link from "next/link";
import { Avatar } from "@/components/shared/Avatar";
import { isWeekend, formatDayMonth } from "@/lib/calendar";

export type OverviewClient = {
  id: string;
  name: string;
  properties: number;
  /** Units occupied on each day of the window, same length as `days`. */
  occupied: number[];
  arrivals: number;
  href: string;
};

/** Empty cells stay flat; the more units are taken, the more purple the day,
 *  and a sold-out day turns to the violet → magenta gradient. */
export function shade(ratio: number, weekend = false): string {
  if (ratio <= 0) return weekend ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.045)";
  if (ratio >= 0.999)
    return "linear-gradient(180deg, var(--color-hostello-magenta), var(--color-hostello-purple-glow))";
  const pct = Math.round(30 + ratio * 55);
  return `color-mix(in srgb, var(--color-hostello-purple-glow) ${pct}%, var(--color-surface-2))`;
}

/** A fully-booked day earns a glow; a half-empty one shouldn't. */
function glow(ratio: number): string | undefined {
  if (ratio < 0.999) return undefined;
  return "0 0 12px -2px var(--color-hostello-magenta)";
}

/**
 * The portfolio at a glance: one row per client, one cell per day. This is the
 * top level of the calendar — pick a client here, get their property timeline.
 */
export function CalendarOverview({
  days,
  today,
  clients,
}: {
  days: string[];
  today: string;
  clients: OverviewClient[];
}) {
  const columns = `repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="card overflow-hidden divide-y divide-white/5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-4 px-4 pt-3.5 pb-2.5">
        <span className="sm:w-56 shrink-0" />
        <div className="flex-1 min-w-0 grid gap-px" style={{ gridTemplateColumns: columns }}>
          {days.map((d) => {
            const n = Number(d.slice(8, 10));
            const label = d === today || n === 1 || n % 5 === 0 ? n : "";
            return (
              <p
                key={d}
                className={`num text-center text-[10px] font-bold leading-none ${
                  d === today ? "text-hostello-gold-bright" : "text-ink-muted"
                }`}
              >
                {label}
              </p>
            );
          })}
        </div>
      </div>

      {clients.map((c) => {
        const nights = c.occupied.reduce((sum, n) => sum + n, 0);
        const capacity = c.properties * days.length;
        const pct = capacity > 0 ? Math.round((nights / capacity) * 100) : 0;

        return (
          <Link
            key={c.id}
            href={c.href}
            className="group flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
          >
            <div className="sm:w-56 shrink-0 flex items-center gap-2.5 min-w-0">
              <Avatar name={c.name} size={36} rounded="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-primary truncate group-hover:text-hostello-purple-light transition-colors">
                  {c.name}
                </p>
                <p className="text-[11px] font-semibold text-ink-muted truncate">
                  {c.properties} {c.properties === 1 ? "unit" : "units"}
                  {c.arrivals > 0 && ` · ${c.arrivals} in`}
                </p>
              </div>
              <span className="num text-sm font-extrabold text-hostello-purple-light">{pct}%</span>
            </div>

            <div className="flex-1 min-w-0 grid gap-px" style={{ gridTemplateColumns: columns }}>
              {days.map((d, i) => {
                const taken = c.occupied[i] ?? 0;
                const ratio = c.properties > 0 ? taken / c.properties : 0;
                return (
                  <span
                    key={d}
                    title={`${formatDayMonth(d)} — ${taken} of ${c.properties} occupied`}
                    className={`h-8 rounded-[5px] transition-transform duration-150 hover:scale-y-110 ${
                      d === today ? "ring-2 ring-hostello-gold-bright/80" : ""
                    }`}
                    style={{
                      background: shade(ratio, isWeekend(d)),
                      boxShadow: glow(ratio),
                    }}
                  />
                );
              })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
