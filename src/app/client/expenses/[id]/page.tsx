import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { getExpense, listExpenseCategories } from "@/lib/expenses";
import { ExpenseForm } from "@/components/client/ExpenseForm";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { deleteExpense } from "../actions";
import { PageHeader } from "@/components/shared/PageHeader";

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
      <PageHeader
        title={expense.confirmed ? "Edit expense" : "Confirm bill"}
        back={{ href: `/client/expenses?month=${month}`, label: "Expenses" }}
        info={
          expense.confirmed ? undefined : (
            <p>
              Your recurring bill filled this in with what it usually comes to. Correct the
              amount and whether it&apos;s paid, attach the bill if you have it, and confirm: it
              counts from then on.
            </p>
          )
        }
      />

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
          confirmText={
            expense.confirmed
              ? "Delete this expense? Its bill photo goes with it."
              : "Skip this one? It won't be added back — next month's still comes."
          }
          label={expense.confirmed ? "Delete expense" : "Skip this one"}
          busy={expense.confirmed ? "Deleting the expense…" : "Skipping the bill…"}
          className="text-xs text-ink-muted hover:text-status-booked transition-colors"
        />
      </form>
    </div>
  );
}
