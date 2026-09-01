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

/** Empty cells stay flat; the more units are taken, the more purple the day. */
function shade(ratio: number, weekend: boolean): string {
  if (ratio <= 0) return weekend ? "var(--color-surface-3)" : "var(--color-surface-2)";
  const pct = Math.round(25 + ratio * 60);
  return `color-mix(in srgb, var(--color-hostello-purple-glow) ${pct}%, var(--color-surface-2))`;
}

/** A fully-booked day earns a glow; a half-empty one shouldn't. */
function glow(ratio: number): string | undefined {
  if (ratio < 0.999) return undefined;
  return "0 0 10px -2px var(--color-hostello-purple-glow)";
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
    <div className="card overflow-hidden divide-y divide-border-hairline">
      <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-4 px-4 pt-3.5 pb-2.5">
        <p className="eyebrow sm:w-56 shrink-0">Client</p>
        <div className="flex-1 min-w-0 grid gap-px" style={{ gridTemplateColumns: columns }}>
          {days.map((d) => {
            const n = Number(d.slice(8, 10));
            const label = d === today || n === 1 || n % 5 === 0 ? n : "";
            return (
              <p
                key={d}
                className={`num text-center text-[9px] leading-none ${
                  d === today ? "text-hostello-gold font-semibold" : "text-ink-muted"
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
            className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-surface-2/50 transition-colors"
          >
            <div className="sm:w-56 shrink-0 flex items-center gap-2.5 min-w-0">
              <Avatar name={c.name} size={30} rounded="lg" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-primary truncate group-hover:text-hostello-purple-light transition-colors">
                  {c.name}
                </p>
                <p className="text-[11px] text-ink-muted truncate">
                  {c.properties} {c.properties === 1 ? "property" : "properties"} ·{" "}
                  <span className="num">{pct}%</span> booked
                  {c.arrivals > 0 && ` · ${c.arrivals} arriving`}
                </p>
              </div>
            </div>

            <div className="flex-1 min-w-0 grid gap-px" style={{ gridTemplateColumns: columns }}>
              {days.map((d, i) => {
                const taken = c.occupied[i] ?? 0;
                const ratio = c.properties > 0 ? taken / c.properties : 0;
                return (
                  <span
                    key={d}
                    title={`${formatDayMonth(d)} — ${taken} of ${c.properties} occupied`}
                    className={`h-7 rounded-[3px] transition-transform duration-150 hover:scale-y-110 ${
                      d === today ? "ring-1 ring-hostello-gold/70" : ""
                    }`}
                    style={{
                      backgroundColor: shade(ratio, isWeekend(d)),
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
