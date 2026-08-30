import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProperty } from "../../../../actions";
import { PropertyForm } from "@/components/admin/PropertyForm";

export default async function EditPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; propertyId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, propertyId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", id)
    .single();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, location, city, province, type, status, stack_rate, short_stay_stack_rate")
    .eq("id", propertyId)
    .single();

  if (!clientRecord || !property) notFound();

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <div>
        <Link href={`/admin/clients/${id}`} className="text-ink-muted text-xs hover:text-ink-secondary">
          ← {clientRecord.name}
        </Link>
        <h1 className="text-xl font-medium mt-1">Edit property</h1>
      </div>

      <PropertyForm
        action={updateProperty}
        clientId={id}
        propertyId={property.id}
        defaultValues={property}
        error={error}
        submitLabel="Save changes"
      />
    </div>
  );
}
