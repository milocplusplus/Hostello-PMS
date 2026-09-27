import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { getRecurring, listExpenseCategories } from "@/lib/expenses";
import { RecurringForm } from "@/components/client/RecurringForm";
import { PageHeader } from "@/components/shared/PageHeader";

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
    supabase.from("properties_v").select("id, name").eq("client_id", clientRecord.id).order("name"),
  ]);

  if (!recurring) notFound();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Edit recurring bill"
        back={{ href: "/client/expenses/recurring", label: "Recurring bills" }}
        info={
          <p>
            Changes apply from the next one. Bills already on your Expenses page keep what they were.
          </p>
        }
      />

      <RecurringForm
        recurring={recurring}
        categories={categories}
        properties={properties ?? []}
        error={error}
      />
    </div>
  );
}
