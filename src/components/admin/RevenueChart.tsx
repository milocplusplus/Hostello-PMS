"use client";

import { useState } from "react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";

const W = 600;
const H = 180;
const PAD_L = 46;
const PAD_B = 22;
const PAD_T = 8;

function axisLabel(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Rounds up to a readable axis ceiling (1/2/5 × 10^n). */
function niceMax(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const scaled = n / pow;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Cumulative month-to-date revenue. `series` is one point per day of the month,
 * already cumulated, so the last point equals the month's gross.
 */
export function RevenueChart({ dates, series }: { dates: string[]; series: number[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(...series, 0));
  const plotW = W - PAD_L;
  const plotH = H - PAD_B - PAD_T;

  const x = (i: number) => PAD_L + (i / Math.max(1, series.length - 1)) * plotW;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${PAD_T + plotH} L${PAD_L},${PAD_T + plotH} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const tickEvery = Math.max(1, Math.ceil(series.length / 5));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - PAD_L) / plotW) * (series.length - 1));
          setHover(Math.min(series.length - 1, Math.max(0, i)));
        }}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-hostello-purple-glow)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-hostello-purple-glow)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-border-hairline)"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 8}
              y={y(v) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-ink-muted)"
            >
              {axisLabel(Math.round(v))}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#revenue-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-hostello-purple-glow)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {dates.map((d, i) =>
          i % tickEvery === 0 ? (
            <text
              key={d}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-ink-muted)"
            >
              {formatDayMonth(d)}
            </text>
          ) : null
        )}

        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
            />
            <circle cx={x(hover)} cy={y(series[hover])} r="4" fill="var(--color-ink-primary)" />
          </>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md px-2.5 py-1.5 text-xs"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `${(y(series[hover]) / H) * 100}%`,
            backgroundColor: "var(--color-surface-3)",
            border: "1px solid var(--color-border-strong)",
          }}
        >
          <p className="text-ink-secondary whitespace-nowrap">{formatDayMonth(dates[hover])}</p>
          <p className="text-ink-primary font-medium whitespace-nowrap">{formatPKR(series[hover])}</p>
        </div>
      )}
    </div>
  );
}
