import Link from "next/link";
import { redirect } from "next/navigation";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import {
  expenseMethodLabel,
  karachiToday,
  listExpenseCategories,
  listRecurring,
  nextDueDate,
  ordinal,
} from "@/lib/expenses";
import { errorBanner } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { RecurringForm } from "@/components/client/RecurringForm";
import { deleteRecurring, setRecurringActive } from "../actions";

export default async function RecurringExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [bills, categories, { data: properties }] = await Promise.all([
    listRecurring(supabase, clientRecord.id),
    listExpenseCategories(supabase, clientRecord.id),
    supabase.from("properties_v").select("id, name").order("name"),
  ]);

  const today = karachiToday();
  const iconButton =
    "p-1.5 rounded-md text-ink-muted hover:text-ink-primary hover:bg-surface-2 transition-colors";

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link href="/client/expenses" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Expenses
        </Link>
        <h1 className="text-xl font-medium mt-1">Recurring bills</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Set a monthly bill up once. On its day it appears on your Expenses page as due, and
          you confirm what it actually came to — it counts in no total until you do.
        </p>
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      {bills.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-secondary">
          No recurring bills yet. Internet, society fees and utilities are the usual ones.
        </div>
      ) : (
        <ul className="card divide-y divide-[var(--color-border-hairline)] overflow-hidden">
          {bills.map((b) => {
            const details = [b.propertyName ?? "All units", b.vendor, expenseMethodLabel(b.method)].filter(
              Boolean
            );
            return (
              <li key={b.id} className={`px-4 md:px-5 py-3 flex items-start gap-3 ${b.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary truncate">{b.categoryName}</p>
                  <p className="text-xs text-ink-secondary truncate mt-0.5">{details.join(" · ")}</p>
                  <p className="text-[11px] text-ink-muted mt-1">
                    Every month on the {ordinal(b.dayOfMonth)} ·{" "}
                    {b.active ? `next ${formatDayMonth(nextDueDate(b, today))}` : "paused"}
                  </p>
                </div>

                <p className="num text-sm text-ink-primary shrink-0">
                  <span className="text-[11px] text-ink-muted">about </span>
                  {formatPKR(b.amount)}
                </p>

                <div className="flex items-center gap-0.5 shrink-0 -mr-1.5">
                  <form action={setRecurringActive}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="active" value={b.active ? "false" : "true"} />
                    <SubmitButton
                      className={iconButton}
                      ariaLabel={b.active ? "Pause" : "Resume"}
                      title={b.active ? "Pause" : "Resume"}
                      busy={b.active ? "Pausing the bill…" : "Resuming the bill…"}
                    >
                      {b.active ? <Pause size={14} /> : <Play size={14} />}
                    </SubmitButton>
                  </form>
                  <Link href={`/client/expenses/recurring/${b.id}`} className={iconButton} aria-label="Edit">
                    <Pencil size={14} />
                  </Link>
                  <form action={deleteRecurring}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmDeleteButton
                      confirmText="Stop this recurring bill? Expenses you already confirmed stay; any still waiting to be confirmed are removed."
                      label="Delete recurring bill"
                      busy="Removing the bill…"
                      className="p-1.5 rounded-md text-ink-muted hover:text-status-booked hover:bg-status-booked/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </ConfirmDeleteButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="group" open={bills.length === 0 || !!error}>
        <summary className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary cursor-pointer list-none transition-colors">
          <Plus size={14} className="text-ink-muted" />
          Set up a bill
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <RecurringForm categories={categories} properties={properties ?? []} />
          <p className="text-[11px] text-ink-muted">
            If this month&apos;s day has already passed, the first one comes next month — add this
            month&apos;s by hand if it isn&apos;t in yet.
          </p>
        </div>
      </details>
    </div>
  );
}
