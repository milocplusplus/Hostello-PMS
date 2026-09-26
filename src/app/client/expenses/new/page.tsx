import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import { listExpenseCategories } from "@/lib/expenses";
import { ExpenseForm } from "@/components/client/ExpenseForm";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; month?: string }>;
}) {
  const { error, month } = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  const [categories, { data: properties }] = await Promise.all([
    listExpenseCategories(supabase, clientRecord.id),
    supabase.from("properties_v").select("id, name").order("name"),
  ]);

  // Opened from a past month's list, the bill most likely belongs to that month.
  const today = todayISO();
  const defaultDate =
    month && /^\d{4}-\d{2}$/.test(month) && month !== today.slice(0, 7) ? `${month}-01` : today;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href={`/client/expenses${month ? `?month=${month}` : ""}`}
          className="text-ink-muted text-xs hover:text-ink-secondary"
        >
          ← Expenses
        </Link>
        <h1 className="text-xl font-medium mt-1">Add expense</h1>
        <p className="text-sm text-ink-secondary mt-1">
          A bill, repair or purchase for one unit — or for all of them.
        </p>
      </div>

      <ExpenseForm
        categories={categories}
        properties={properties ?? []}
        error={error}
        defaultDate={defaultDate}
      />
    </div>
  );
}
