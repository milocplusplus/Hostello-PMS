import { CircleDollarSign, Wallet, CalendarDays, Moon } from "lucide-react";
import { sourceColor } from "@/lib/block-sources";
import { formatPKR, isPassThroughSource } from "@/lib/payout";
import type { SourceStats } from "@/lib/stats";

/**
 * Revenue split by channel. Shared by both portals — the only difference is
 * which side of the split the second money column shows.
 */
export function StatsBoard({
  total,
  sources,
  variant,
  periodLabel,
}: {
  total: SourceStats;
  sources: SourceStats[];
  variant: "admin" | "client";
  periodLabel: string;
}) {
  const cutLabel = variant === "admin" ? "Hostello share" : "Your payout";
  const cutOf = (s: SourceStats) => (variant === "admin" ? s.hostelloShare : s.clientPayout);
  // Hostello earns nothing on a stay it did not sell — owner-sourced, a walk-in,
  // a referral. That zero is the deal, not a bad month, so it is worded rather
  // than printed as Rs 0.
  const passThrough = (s: SourceStats) => variant === "admin" && isPassThroughSource(s.source);
  const passedThrough = sources
    .filter((s) => isPassThroughSource(s.source))
    .reduce((sum, s) => sum + s.gross, 0);

  const tiles = [
    {
      label: "Total revenue",
      value: formatPKR(total.gross),
      icon: CircleDollarSign,
      tint: "var(--color-hostello-gold)",
      ink: "text-surface-0",
    },
    {
      label: cutLabel,
      value: formatPKR(cutOf(total)),
      icon: Wallet,
      tint: "var(--color-hostello-purple-glow)",
      ink: "text-white",
    },
    {
      label: "Bookings",
      value: String(total.bookings),
      icon: CalendarDays,
      tint: "var(--color-channel-booking)",
      ink: "text-white",
    },
    {
      label: "Nights",
      value: String(total.nights),
      icon: Moon,
      tint: "var(--color-positive)",
      ink: "text-surface-0",
    },
  ];

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4 md:p-5 flex gap-3.5">
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: t.tint }}
            >
              <t.icon size={20} strokeWidth={2} className={t.ink} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-secondary">{t.label}</p>
              <p className="text-xl md:text-2xl font-semibold mt-0.5 text-ink-primary truncate">
                {t.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <section className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-base font-medium">Revenue by source</h2>
          <p className="text-xs text-ink-muted mt-0.5">{periodLabel}</p>
        </div>

        {total.bookings === 0 ? (
          <p className="rounded-lg bg-surface-2/60 py-10 text-center text-sm text-ink-secondary">
            No revenue recorded in {periodLabel} yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {sources.map((s) => (
              <li key={s.source} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: sourceColor(s.source) }}
                    />
                    <span className="text-sm text-ink-primary truncate">{s.label}</span>
                    <span className="text-[11px] text-ink-muted shrink-0">{s.share}%</span>
                  </span>
                  <span className="text-sm text-ink-primary whitespace-nowrap">
                    {formatPKR(s.gross)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${s.share}%`, backgroundColor: sourceColor(s.source) }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
                  <span>
                    {s.bookings} {s.bookings === 1 ? "booking" : "bookings"} · {s.nights}{" "}
                    {s.nights === 1 ? "night" : "nights"}
                  </span>
                  {passThrough(s) ? (
                    <span>Hostello earns nothing on these</span>
                  ) : (
                    <span>
                      {cutLabel}: <span className="text-ink-secondary">{formatPKR(cutOf(s))}</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border-hairline pt-3 flex flex-col gap-1 text-[11px] text-ink-muted">
          <p>Confirmed bookings only — tentative and cancelled stays are left out.</p>
          {variant === "admin" && passedThrough > 0 && (
            <p>
              <span className="text-ink-secondary">{formatPKR(passedThrough)}</span> of the total is
              owner-sourced, walk-in or referral. Hostello earns nothing on it.
            </p>
          )}
          {variant === "admin" && (
            <p>Hostello share is per-booking only — monthly fees are not counted here.</p>
          )}
        </div>
      </section>
    </div>
  );
}
