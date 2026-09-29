import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { createCalendarBlock, deleteCalendarBlock } from "../actions";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { errorBanner, noticeBanner } from "@/lib/form-styles";
import { formatDayMonth, formatMonthParam, parseMonthParam } from "@/lib/calendar";
import { blockTypeColor, blockTypeLabel } from "@/lib/block-sources";
import { PageHeader } from "@/components/shared/PageHeader";
import { BlockDatesForm, type UnitGroup } from "@/components/shared/BlockDatesForm";
import { listUnavailable } from "@/lib/availability";
import { staffMay } from "@/lib/settings";

export default async function BlockDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; month?: string }>;
}) {
  const { error, notice, month: monthParam } = await searchParams;

  const supabase = await createClient();
  const canBlock = await staffMay("block");
  const user = await currentUser();
  if (!user) redirect("/login");

  const { year, month0 } = parseMonthParam(monthParam);
  const monthStr = formatMonthParam(year, month0);

  const { data: properties } = await supabase
    .from("properties_v")
    .select("id, name, client_id, clients:clients_v(name)")
    .eq("bookable", true)
    .order("name");

  // One group per client, for the whole-client tick.
  const groups = new Map<string, UnitGroup>();
  for (const p of properties ?? []) {
    const clientName = (p.clients as unknown as { name: string } | null)?.name ?? "—";
    const group = groups.get(p.client_id) ?? { clientName, units: [] };
    group.units.push({ id: p.id, name: p.name });
    groups.set(p.client_id, group);
  }
  const unitGroups = [...groups.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));

  const unavailable = await listUnavailable(
    supabase,
    (properties ?? []).map((p) => p.id)
  );

  const { data: blocks } = await supabase
    .from("calendar_blocks")
    .select("id, property_id, start_date, end_date, block_type, notes, properties:properties_v(name)")
    // Imported channel dates are managed on /admin/calendar/feeds — unblocking
    // one here would only bring it back on the next sync.
    .is("feed_id", null)
    .order("start_date", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Block dates"
        sub={canBlock ? "Three quick steps — the block card fills in as you go." : undefined}
        back={{ href: "/admin/calendar", label: "Calendar" }}
        info={
          <p>
            Close dates with no booking — owner stays, maintenance, or a channel the app doesn&apos;t see yet.
          </p>
        }
      />

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {!canBlock && (
        <p className={noticeBanner}>
          Blocking and unblocking dates is switched off for operations accounts. Ask the admin.
        </p>
      )}

      {canBlock && (
        <BlockDatesForm
          action={createCalendarBlock}
          groups={unitGroups}
          multiple
          month={monthStr}
          unavailable={unavailable}
        />
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base">Recent blocks</h2>
          {/* The row tick boxes join this form by id, so each row keeps its own Unblock too. */}
          {canBlock && blocks && blocks.length > 1 && (
            <form id="bulk-unblock" action={deleteCalendarBlock}>
              <input type="hidden" name="month" value={monthStr} />
              <ConfirmDeleteButton
                confirmText="Remove all the ticked blocks? Those dates become available again."
                label="Unblock ticked"
                busy="Freeing the dates…"
                className="text-xs font-bold text-hostello-purple-light hover:underline"
              />
            </form>
          )}
        </div>
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
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border-hairline bg-surface-2/50 px-3 py-2.5 hover:border-border-strong transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    {canBlock && blocks.length > 1 && (
                      <input
                        type="checkbox"
                        name="ids"
                        value={b.id}
                        form="bulk-unblock"
                        aria-label="Tick to unblock with the others"
                        className="h-4 w-4 shrink-0 accent-[var(--color-hostello-gold)]"
                      />
                    )}
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
                  {canBlock && (
                    <form action={deleteCalendarBlock}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="month" value={monthStr} />
                      <ConfirmDeleteButton
                        confirmText="Remove this block? The dates will become available again."
                        label="Unblock"
                        busy="Freeing the dates…"
                        className="text-xs text-ink-muted hover:text-status-booked shrink-0 transition-colors"
                      />
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
