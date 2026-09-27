import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, type LucideIcon } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { CountUp } from "@/components/shared/CountUp";

export type SettlementTab = "to-hostello" | "to-client";

export function isSettlementTab(value: unknown): value is SettlementTab {
  return value === "to-hostello" || value === "to-client";
}

/**
 * The two directions of settlement, side by side.
 *
 * They are tabs rather than two pages on purpose: the pair used to be one tick
 * telling two stories, and the surest way to keep them apart is to show both
 * balances at once with whose money each is written on the label.
 */
export function SettlementTabs({
  portal,
  tab,
  toHostello,
  toClient,
}: {
  portal: "admin" | "client";
  tab: SettlementTab;
  toHostello: number;
  toClient: number;
}) {
  const base = portal === "admin" ? "/admin/settlements" : "/client/settlements";

  const tabs: { key: SettlementTab; label: string; caption: string; amount: number }[] = [
    {
      key: "to-hostello",
      label: "Owed to Hostello",
      caption: portal === "admin" ? "Clients owe you" : "You owe Hostello",
      amount: toHostello,
    },
    {
      key: "to-client",
      label: portal === "admin" ? "Owed to Client" : "Owed to You",
      caption: portal === "admin" ? "You owe clients" : "Hostello owes you",
      amount: toClient,
    },
  ];

  // Whichever direction brings money to the viewer points in.
  const incoming: SettlementTab = portal === "admin" ? "to-hostello" : "to-client";

  return (
    <div className="grid grid-cols-2 gap-3">
      {tabs.map((t) => {
        const active = t.key === tab;
        const Icon = t.key === incoming ? ArrowDownLeft : ArrowUpRight;
        return (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={`p-4 md:p-5 flex flex-col gap-2 text-left active:scale-[0.98] transition-transform ${
              active ? "card-hero" : "card hover:bg-white/[0.03]"
            }`}
          >
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                active ? "bg-white/20" : "bg-white/6 text-ink-secondary"
              }`}
            >
              <Icon size={18} strokeWidth={2.4} />
            </span>
            <span
              className={`num block text-lg md:text-2xl font-extrabold truncate ${
                active ? "text-white" : "text-ink-secondary"
              }`}
            >
              Rs <CountUp value={t.amount} />
            </span>
            <span className={`block text-xs font-bold ${active ? "text-white/85" : "text-ink-muted"}`}>
              {t.caption}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** A small figure tile on the settlements pages: icon, amount, one-word label. */
export function MoneyStat({
  icon: Icon,
  tint,
  label,
  value,
  valueClass = "text-ink-primary",
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="card p-4 md:p-5 flex flex-col gap-2">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tint}`}>
        <Icon size={18} />
      </span>
      <p className={`num text-lg md:text-2xl font-extrabold truncate ${valueClass}`}>{formatPKR(value)}</p>
      <p className="text-xs font-bold text-ink-muted">{label}</p>
    </div>
  );
}
