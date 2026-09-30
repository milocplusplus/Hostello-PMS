import { EmptyState } from "@/components/shared/PageHeader";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  History,
  KeyRound,
  LogIn,
  ShieldAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  ROLE_LABEL,
  auditSentence,
  formatAuditTime,
  readableChanges,
  readableSnapshot,
  type AuditEntry,
} from "@/lib/audit";

const ICON: Record<string, LucideIcon> = {
  booking: CalendarDays,
  money: Wallet,
  client: Users,
  staff: KeyRound,
  signin: LogIn,
};

/**
 * A list of audit entries, newest first. Server-rendered; the before → after
 * detail opens with a plain <details>, so there is no client code at all.
 * Used by the Audit log page and the History cards on a booking and a client.
 */
export function AuditTrail({
  entries,
  alsoRemoved,
  clientNames,
  empty = "Nothing has been recorded yet.",
}: {
  entries: AuditEntry[];
  alsoRemoved?: Map<number, string[]>;
  clientNames?: Map<string, string>;
  empty?: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState icon={History} title={empty} />
    );
  }

  return (
    <ul className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
      {entries.map((e) => {
        const Icon = e.action === "sign_in_failed" ? ShieldAlert : ICON[e.category] ?? History;
        const changes = e.action === "update" ? readableChanges(e) : [];
        const snapshot = e.action === "insert" || e.action === "delete" ? readableSnapshot(e) : [];
        const removed = alsoRemoved?.get(e.tx);
        const client = e.client_id ? clientNames?.get(e.client_id) : undefined;
        const detail = changes.length > 0 || snapshot.length > 0;
        const failed = e.action === "sign_in_failed";

        const head = (
          <div className="flex items-start gap-3 p-4">
            <span
              className={`mt-0.5 grid place-items-center w-8 h-8 rounded-xl shrink-0 ${
                failed ? "bg-negative/15 text-negative" : "bg-white/6 text-ink-secondary"
              }`}
            >
              <Icon size={15} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-primary">
                <span className="font-bold">{e.actor_name ?? ROLE_LABEL[e.actor_role] ?? "Someone"}</span>{" "}
                <span className="text-[10px] uppercase tracking-[0.12em] text-ink-muted border border-white/10 rounded-full px-1.5 py-0.5 align-middle">
                  {ROLE_LABEL[e.actor_role] ?? e.actor_role}
                </span>{" "}
                {auditSentence(e)}
              </p>
              <p className="text-xs text-ink-muted mt-1 truncate">
                {[e.label, client, formatAuditTime(e.at)].filter(Boolean).join(" · ")}
              </p>
              {removed && (
                <p className="text-xs text-negative/90 mt-1">Also removed: {removed.join(", ")}</p>
              )}
            </div>
            {detail && (
              <ChevronDown
                size={16}
                className="mt-1 text-ink-muted shrink-0 transition-transform group-open:rotate-180"
                aria-hidden
              />
            )}
          </div>
        );

        return (
          <li key={e.id}>
            {detail ? (
              <details className="group">
                <summary className="list-none cursor-pointer hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {head}
                </summary>
                <div className="px-4 pb-4 pl-15">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                    {changes.map((c) => (
                      <div key={c.label} className="contents">
                        <dt className="text-ink-muted">{c.label}</dt>
                        <dd className="text-ink-secondary break-words">
                          <span className="line-through decoration-white/30">{c.before}</span>
                          {" → "}
                          <span className="text-ink-primary font-semibold">{c.after}</span>
                        </dd>
                      </div>
                    ))}
                    {snapshot.map((s) => (
                      <div key={s.label} className="contents">
                        <dt className="text-ink-muted">{s.label}</dt>
                        <dd className="text-ink-secondary break-words">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <RecordLink e={e} />
                </div>
              </details>
            ) : (
              head
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Where the thing now lives, when it still does. */
function RecordLink({ e }: { e: AuditEntry }) {
  if (e.action === "delete") return null;
  const href =
    e.booking_id && e.table_name !== "clients"
      ? `/admin/bookings/${e.booking_id}`
      : e.client_id
        ? `/admin/clients/${e.client_id}`
        : null;
  if (!href) return null;
  return (
    <Link href={href} className="inline-block mt-3 text-xs font-bold text-hostello-purple-light hover:underline">
      Open {e.booking_id ? "booking" : "client"}
    </Link>
  );
}
