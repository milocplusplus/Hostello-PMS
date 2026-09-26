import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { getRecurring, listExpenseCategories } from "@/lib/expenses";
import { RecurringForm } from "@/components/client/RecurringForm";

export default async function EditRecurringPage({
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
  const [recurring, categories, { data: properties }] = await Promise.all([
    getRecurring(supabase, id),
    listExpenseCategories(supabase, clientRecord.id),
    supabase.from("properties_v").select("id, name").order("name"),
  ]);

  if (!recurring) notFound();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link href="/client/expenses/recurring" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Recurring bills
        </Link>
        <h1 className="text-xl font-medium mt-1">Edit recurring bill</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Changes apply from the next one. Bills already on your Expenses page keep what they were.
        </p>
      </div>

      <RecurringForm
        recurring={recurring}
        categories={categories}
        properties={properties ?? []}
        error={error}
      />
    </div>
  );
}
