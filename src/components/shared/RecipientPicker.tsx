import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import type { ClientBalance } from "@/lib/owed";
import { Avatar } from "@/components/shared/Avatar";

/**
 * Who to send to, biggest balance first — `loadOwedByClient` already sorts them
 * that way. Only owners with something outstanding appear: a picker offering a
 * recipient the server would then refuse is a dead end dressed as a choice.
 */
export function RecipientPicker({
  balances,
  hrefBase,
  empty,
}: {
  balances: ClientBalance[];
  /** `/admin/settlements/send` — the client id is appended. */
  hrefBase: string;
  empty: string;
}) {
  const owing = balances.filter((b) => b.balance > 0);

  if (owing.length === 0) {
    return <p className="text-xs text-ink-muted px-5 py-8 text-center">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-border-hairline">
      {owing.map((b) => (
        <li key={b.clientId}>
          <Link
            href={`${hrefBase}?client=${b.clientId}`}
            className="flex items-center gap-3 px-4 md:px-5 py-3.5 hover:bg-surface-2 transition-colors"
          >
            <Avatar name={b.clientName} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink-primary truncate">{b.clientName}</span>
              <span className="block text-[11px] text-ink-muted mt-0.5">
                {b.bookings} {b.bookings === 1 ? "booking" : "bookings"} open
                {!b.hasLogin && " · no portal login"}
              </span>
            </span>
            <span className="shrink-0 text-sm text-financial tabular-nums">
              {formatPKR(b.balance)}
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
