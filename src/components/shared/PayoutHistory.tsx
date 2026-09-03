import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatNotificationTime } from "@/lib/notifications";
import { methodLabel, PAYOUT_STATUS, type SettlementPayment } from "@/lib/owed";

/**
 * The payment entries, as both portals show them in both directions. A Server
 * Component, so the `actions` slot can hand each row whatever forms that portal
 * needs — review buttons for whoever is owed, edit and withdraw for whoever
 * paid.
 */
export function PayoutHistory({
  entries,
  showClient = false,
  empty = "No payments recorded yet.",
  actions,
}: {
  entries: SettlementPayment[];
  showClient?: boolean;
  empty?: string;
  actions?: (entry: SettlementPayment) => ReactNode;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-ink-muted px-5 py-6">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-border-hairline">
      {entries.map((e) => {
        const status = PAYOUT_STATUS[e.status];
        return (
          <li key={e.id} className="p-4 md:p-5 flex gap-4">
            {e.receiptUrl ? (
              <a
                href={e.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 w-14 h-16 rounded-md border border-border-hairline overflow-hidden bg-surface-2 hover:border-border-strong transition-colors"
              >
                {e.receiptIsPdf ? (
                  <span className="h-full w-full flex items-center justify-center text-ink-muted">
                    <FileText size={16} />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires; not worth optimizing
                  <img src={e.receiptUrl} alt="Payment screenshot" className="h-full w-full object-cover" />
                )}
              </a>
            ) : (
              <span className="shrink-0 w-14 h-16 rounded-md border border-dashed border-border-hairline flex items-center justify-center text-[10px] text-ink-muted text-center leading-tight px-1">
                {e.method === "cash" ? "Cash" : "No proof"}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm text-financial font-medium">{formatPKR(e.amount)}</span>
                <span className="text-xs text-ink-secondary">{methodLabel(e.method)}</span>
                <span className={`text-xs ${status.tone}`}>
                  · {e.confirmedOffline ? "Recorded received" : status.label}
                </span>
              </div>

              {showClient && e.clientName && (
                <p className="text-xs text-ink-primary mt-1 truncate">{e.clientName}</p>
              )}

              <p className="text-[11px] text-ink-muted mt-1">
                Recorded {formatNotificationTime(e.createdAt)}
                {e.reviewedAt ? ` · reviewed ${formatNotificationTime(e.reviewedAt)}` : ""}
              </p>

              {/* Never let this read as the owner having confirmed it. */}
              {e.confirmedOffline && (
                <p className="text-[11px] text-status-pending mt-1">
                  Marked received by Hostello — this owner has no portal login to confirm it
                  themselves.
                </p>
              )}

              {e.reference && (
                <p className="text-xs text-ink-secondary mt-1 break-words">{e.reference}</p>
              )}

              {e.status === "rejected" && (
                // Whoever was owed is the one who said it never arrived, so the
                // direction decides whose words these are.
                <p className="text-xs text-status-booked mt-2">
                  {(() => {
                    const who = e.direction === "to_client" ? e.clientName ?? "The owner" : "Hostello";
                    return e.note ? `${who} says: ${e.note}` : `${who} could not find this payment.`;
                  })()}{" "}
                  <span className="text-ink-muted">The amount owed is unchanged.</span>
                </p>
              )}

              {actions && <div className="mt-2 flex items-center gap-3 flex-wrap">{actions(e)}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
