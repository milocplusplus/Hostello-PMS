import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import { listExpenseCategories } from "@/lib/expenses";
import { ExpenseForm } from "@/components/client/ExpenseForm";
import { PageHeader } from "@/components/shared/PageHeader";

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
    supabase.from("properties_v").select("id, name").eq("client_id", clientRecord.id).order("name"),
  ]);

  // Opened from a past month's list, the bill most likely belongs to that month.
  const today = todayISO();
  const defaultDate =
    month && /^\d{4}-\d{2}$/.test(month) && month !== today.slice(0, 7) ? `${month}-01` : today;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Add expense"
        back={{ href: `/client/expenses${month ? `?month=${month}` : ""}`, label: "Expenses" }}
      />

      <ExpenseForm
        categories={categories}
        properties={properties ?? []}
        error={error}
        defaultDate={defaultDate}
      />
    </div>
  );
}
