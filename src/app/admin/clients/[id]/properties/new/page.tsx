import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProperty } from "../../../actions";
import { PropertyForm } from "@/components/admin/PropertyForm";

export default async function NewPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!clientRecord) notFound();

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <div>
        <Link href={`/admin/clients/${id}`} className="text-ink-muted text-xs hover:text-ink-secondary">
          ← {clientRecord.name}
        </Link>
        <h1 className="text-xl font-medium mt-1">Add a property</h1>
      </div>

      <PropertyForm action={createProperty} clientId={id} error={error} submitLabel="Save property" />
    </div>
  );
}
