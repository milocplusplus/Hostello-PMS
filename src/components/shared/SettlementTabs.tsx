import Link from "next/link";
import { formatPKR } from "@/lib/payout";

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

  return (
    <div className="grid grid-cols-2 gap-3">
      {tabs.map((t) => {
        const active = t.key === tab;
        return (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={`card p-4 text-left transition-colors ${
              active
                ? "border border-hostello-gold/40 bg-surface-2"
                : "border border-transparent hover:bg-surface-2"
            }`}
          >
            <span className={`block text-xs ${active ? "text-ink-primary" : "text-ink-secondary"}`}>
              {t.label}
            </span>
            <span
              className={`block text-lg md:text-2xl font-semibold mt-1.5 truncate ${
                active ? "text-financial" : "text-ink-secondary"
              }`}
            >
              {formatPKR(t.amount)}
            </span>
            <span className="block text-[11px] text-ink-muted mt-1">{t.caption}</span>
          </Link>
        );
      })}
    </div>
  );
}
