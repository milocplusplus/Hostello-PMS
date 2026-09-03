"use client";

import { Delete } from "lucide-react";
import { formatPKR } from "@/lib/payout";

/**
 * The amount, entered the way a banking app enters one: the figure is the
 * screen, and the keys are under the thumb.
 *
 * Controlled by the flow above it, which owns the value — this only ever
 * appends a digit or drops one, and refuses anything that would take the
 * amount past what may actually be sent. A cap that silently ignores the
 * keypress is what stops the review screen ever showing a number the server
 * will reject.
 */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export function AmountKeypad({
  value,
  onChange,
  max,
  remainingLabel,
}: {
  /** Digits only, as typed. "" is an empty screen, not a zero. */
  value: string;
  onChange: (next: string) => void;
  /** The most that may be sent right now. */
  max: number;
  remainingLabel: (remaining: number) => string;
}) {
  const amount = Number(value || 0);
  const remaining = Math.max(0, Math.round((max - amount) * 100) / 100);
  const atCap = amount >= max && max > 0;

  function press(key: (typeof KEYS)[number]) {
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(value.slice(0, -1));

    // No leading zeros: "0" on an empty screen is still an empty screen.
    const next = (value + key).replace(/^0+/, "");
    if (next.length > 9) return;
    if (Number(next) > max) return;
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center py-2">
        <p
          className={`font-semibold tabular-nums transition-colors ${
            value ? "text-financial" : "text-ink-muted"
          } ${value.length > 6 ? "text-3xl" : "text-[2.75rem] leading-none"}`}
        >
          {value ? formatPKR(amount) : "Rs 0"}
        </p>
        <p className="text-[11px] text-ink-muted mt-2.5 min-h-[1rem]">
          {max <= 0 ? "" : atCap ? "The full balance" : remainingLabel(remaining)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onChange(String(Math.round(max)))}
        disabled={max <= 0 || atCap}
        className="btn btn-ghost btn-sm self-center disabled:opacity-40"
      >
        Pay the full {formatPKR(max)}
      </button>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "back" ? "Delete last digit" : key === "clear" ? "Clear" : key}
            className={`h-14 rounded-xl border border-border-hairline bg-surface-2 text-lg font-medium text-ink-primary transition-colors hover:border-border-strong hover:bg-surface-3 active:bg-surface-3 flex items-center justify-center ${
              key === "clear" || key === "back" ? "text-ink-secondary" : ""
            }`}
          >
            {key === "back" ? (
              <Delete size={18} />
            ) : key === "clear" ? (
              <span className="text-xs">Clear</span>
            ) : (
              key
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
