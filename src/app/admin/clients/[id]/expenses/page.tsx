import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMonthLabel, parseMonthParam } from "@/lib/calendar";
import { listExpenses, unpaidTotal } from "@/lib/expenses";
import { ExpenseList, ExpenseMonthNav, ExpenseSummary } from "@/components/shared/ExpenseList";

/**
 * An owner's own books, read-only. The owner keeps them; Hostello can look.
 * Owner-only by the `clients/` layout, and by RLS — ops has no policy on
 * `expenses` at all.
 */
export default async function ClientExpensesAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;
  const { year, month0 } = parseMonthParam(month);
  const monthLabel = formatMonthLabel(year, month0);

  const supabase = await createClient();
  const [{ data: clientRecord }, expenses, unpaid] = await Promise.all([
    supabase.from("clients").select("id, name").eq("id", id).maybeSingle(),
    listExpenses(supabase, id, { year, month0 }),
    unpaidTotal(supabase, id),
  ]);

  if (!clientRecord) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/clients/${id}`} className="text-ink-muted text-xs hover:text-ink-secondary">
          ← {clientRecord.name}
        </Link>
        <h1 className="text-xl font-semibold mt-1">Expenses</h1>
        <p className="text-sm text-ink-secondary mt-1">
          What {clientRecord.name} has recorded for their units. Theirs to keep — read-only here,
          and it never touches settlements.
        </p>
      </div>

      <ExpenseMonthNav basePath={`/admin/clients/${id}/expenses`} year={year} month0={month0} />

      <ExpenseSummary
        monthLabel={monthLabel}
        monthTotal={expenses.reduce((sum, e) => sum + e.amount, 0)}
        count={expenses.length}
        filtered={false}
        unpaid={unpaid}
      />

      <ExpenseList expenses={expenses} empty={`Nothing recorded for ${monthLabel}.`} />
    </div>
  );
}
