import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { createClientCalendarBlock, deleteClientCalendarBlock } from "../actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { errorBanner } from "@/lib/form-styles";
import { formatDayMonth, formatMonthParam, parseMonthParam } from "@/lib/calendar";
import { blockTypeColor, blockTypeLabel } from "@/lib/block-sources";
import { PageHeader } from "@/components/shared/PageHeader";
import { BlockDatesForm } from "@/components/shared/BlockDatesForm";
import { listUnavailable } from "@/lib/availability";

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

  const unavailable = await listUnavailable(
    supabase,
    (properties ?? []).map((p) => p.id)
  );

  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date, block_type, notes, properties(name)")
    .in("property_id", (properties ?? []).map((p) => p.id))
    // Same rule as /admin/calendar/block: an imported channel date is a real
    // reservation on Airbnb or Booking.com. Unblocking one here would free a
    // sold night until the next sync put it back.
    .is("feed_id", null)
    .order("start_date", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Block dates"
        sub="Three quick steps — the block card fills in as you go."
        back={{ href: "/client/calendar", label: "Calendar" }}
        info={
          <p>
            Close off dates for personal use or maintenance — this won&apos;t create a booking.
          </p>
        }
      />

      {error && <p className={errorBanner}>{error}</p>}

      <BlockDatesForm
        action={createClientCalendarBlock}
        groups={[{ clientName: clientRecord.name, units: properties ?? [] }]}
        multiple={false}
        month={monthStr}
        unavailable={unavailable}
      />

      <div className="card p-6">
        <h2 className="text-base mb-4">Your blocks</h2>
        {(!blocks || blocks.length === 0) && <p className="text-sm text-ink-muted">No blocks yet.</p>}
        {blocks && blocks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {blocks.map((b) => {
              const propName = (b.properties as unknown as { name: string } | null)?.name ?? "—";
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border-hairline bg-surface-2/50 px-3 py-2.5 hover:border-border-strong transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span
                      className="shrink-0 w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: blockTypeColor(b.block_type), boxShadow: `0 0 8px ${blockTypeColor(b.block_type)}` }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-primary truncate">{propName}</p>
                      <p className="text-xs text-ink-muted truncate">
                        {b.start_date === b.end_date
                          ? formatDayMonth(b.start_date)
                          : `${formatDayMonth(b.start_date)} → ${formatDayMonth(b.end_date)}`}
                        {" · "}
                        {blockTypeLabel(b.block_type)}
                        {b.notes ? ` · ${b.notes}` : ""}
                      </p>
                    </div>
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
