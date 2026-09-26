import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { getExpense, listExpenseCategories } from "@/lib/expenses";
import { ExpenseForm } from "@/components/client/ExpenseForm";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { deleteExpense } from "../actions";

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const clientRecord = await currentClient();
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  // RLS scopes the read, so someone else's id is simply not found.
  const [expense, categories, { data: properties }] = await Promise.all([
    getExpense(supabase, id),
    listExpenseCategories(supabase, clientRecord.id),
    supabase.from("properties_v").select("id, name").order("name"),
  ]);

  if (!expense) notFound();

  const month = expense.incurredOn.slice(0, 7);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link href={`/client/expenses?month=${month}`} className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Expenses
        </Link>
        <h1 className="text-xl font-medium mt-1">Edit expense</h1>
      </div>

      <ExpenseForm
        expense={expense}
        categories={categories}
        properties={properties ?? []}
        error={error}
      />

      <form action={deleteExpense} className="flex justify-center">
        <input type="hidden" name="id" value={expense.id} />
        <input type="hidden" name="month" value={month} />
        <ConfirmDeleteButton
          confirmText="Delete this expense? Its bill photo goes with it."
          label="Delete expense"
          busy="Deleting the expense…"
          className="text-xs text-ink-muted hover:text-status-booked transition-colors"
        />
      </form>
    </div>
  );
}
