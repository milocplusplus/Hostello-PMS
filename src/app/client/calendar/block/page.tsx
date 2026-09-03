import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { createClientCalendarBlock, deleteClientCalendarBlock } from "../actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";
import { fieldLabel, fieldInput, primaryButton, errorBanner } from "@/lib/form-styles";
import { formatMonthParam, parseMonthParam } from "@/lib/calendar";
import { MANUAL_BLOCK_TYPES, blockTypeLabel } from "@/lib/block-sources";

export default async function ClientBlockDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; month?: string }>;
}) {
  const { error, month: monthParam } = await searchParams;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const { year, month0 } = parseMonthParam(monthParam);
  const monthStr = formatMonthParam(year, month0);

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("client_id", clientRecord.id)
    .eq("status", "active")
    .order("name");

  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date, block_type, notes, properties(name)")
    .in("property_id", (properties ?? []).map((p) => p.id))
    .order("start_date", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link href="/client/calendar" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Calendar
        </Link>
        <h1 className="text-xl font-medium mt-1">Block dates</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Close off dates for personal use or maintenance — this won&apos;t create a booking.
        </p>
      </div>

      <form action={createClientCalendarBlock} className="card p-6 flex flex-col gap-4">
        <input type="hidden" name="month" value={monthStr} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="property_id" className={fieldLabel}>
            Property
          </label>
          <select id="property_id" name="property_id" required className={fieldInput}>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="block_type" className={fieldLabel}>
              Why
            </label>
            {/* `booked` is not offered: that is what a channel sync writes for
                an imported reservation, not something anyone picks here. */}
            <select id="block_type" name="block_type" defaultValue="blocked" className={fieldInput}>
              {MANUAL_BLOCK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reason" className={fieldLabel}>
              Note (optional)
            </label>
            <input
              id="reason"
              name="reason"
              placeholder="e.g. Personal use, boiler replacement"
              className={fieldInput}
            />
          </div>
        </div>

        {error && <p className={errorBanner}>{error}</p>}

        <SubmitButton className={`mt-1 ${primaryButton}`} busy="Blocking the dates…">
          Block these dates
        </SubmitButton>
      </form>

      <div className="card p-6">
        <h2 className="text-sm font-medium text-ink-secondary mb-4">Your blocks</h2>
        {(!blocks || blocks.length === 0) && <p className="text-sm text-ink-muted">No blocks yet.</p>}
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
                    <p className="text-xs text-ink-muted truncate">
                      {blockTypeLabel(b.block_type)}
                      {b.notes ? ` · ` : ""}
                    </p>
                  </div>
                  <form action={deleteClientCalendarBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="month" value={monthStr} />
                    <ConfirmDeleteButton
                      confirmText="Remove this block? The dates will become available again."
                      label="Unblock"
                      busy="Freeing the dates…"
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
