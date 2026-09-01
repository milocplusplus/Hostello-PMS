import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { createCalendarBlock, deleteCalendarBlock } from "../actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { fieldLabel, fieldInput, primaryButton, primaryButtonStyle, errorBanner } from "@/lib/form-styles";
import { formatMonthParam, parseMonthParam } from "@/lib/calendar";

export default async function BlockDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; month?: string }>;
}) {
  const { error, month: monthParam } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const { year, month0 } = parseMonthParam(monthParam);
  const monthStr = formatMonthParam(year, month0);

  const { data: properties } = await supabase
    .from("properties_v")
    .select("id, name, client_id, clients:clients_v(name)")
    .eq("status", "active")
    .order("name");

  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date, notes, properties:properties_v(name)")
    // Imported channel dates are managed on /admin/calendar/feeds — unblocking
    // one here would only bring it back on the next sync.
    .is("feed_id", null)
    .order("start_date", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link href="/admin/calendar" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Calendar
        </Link>
        <h1 className="text-xl font-medium mt-1">Block dates</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Close dates with no booking — owner stays, maintenance, or a channel the app doesn&apos;t see yet.
        </p>
      </div>

      <form action={createCalendarBlock} className="card p-6 flex flex-col gap-4">
        <input type="hidden" name="month" value={monthStr} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="property_id" className={fieldLabel}>
            Property
          </label>
          <select id="property_id" name="property_id" required className={fieldInput}>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.clients as unknown as { name: string } | null)?.name ?? "—"} · {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="start_date" className={fieldLabel}>
              Start date
            </label>
            <input id="start_date" name="start_date" type="date" required className={fieldInput} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="end_date" className={fieldLabel}>
              End date
            </label>
            <input id="end_date" name="end_date" type="date" required className={fieldInput} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason" className={fieldLabel}>
            Reason (optional)
          </label>
          <input id="reason" name="reason" placeholder="e.g. Owner personal use, maintenance" className={fieldInput} />
        </div>

        {error && <p className={errorBanner}>{error}</p>}

        <button type="submit" className={`mt-1 ${primaryButton}`} style={primaryButtonStyle}>
          Block these dates
        </button>
      </form>

      <div className="card p-6">
        <h2 className="text-sm font-medium text-ink-secondary mb-4">Recent blocks</h2>
        {(!blocks || blocks.length === 0) && (
          <p className="text-sm text-ink-muted">No blocks yet.</p>
        )}
        {blocks && blocks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {blocks.map((b) => {
              const propName = (b.properties as unknown as { name: string } | null)?.name ?? "—";
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 text-sm border-b border-border-hairline last:border-0 pb-2 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-ink-primary">
                      {propName} — {b.start_date === b.end_date ? b.start_date : `${b.start_date} → ${b.end_date}`}
                    </p>
                    {b.notes && <p className="text-xs text-ink-muted truncate">{b.notes}</p>}
                  </div>
                  <form action={deleteCalendarBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="month" value={monthStr} />
                    <ConfirmDeleteButton
                      confirmText="Remove this block? The dates will become available again."
                      label="Unblock"
                      className="text-xs text-ink-muted hover:text-status-booked shrink-0 transition-colors"
                    />
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
