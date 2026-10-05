import Link from "next/link";
import { notFound } from "next/navigation";
import { Images } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { updateProperty } from "../../../../actions";
import { unitArt } from "@/lib/unit-tint";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { PageHeader } from "@/components/shared/PageHeader";

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
    .select("id, name, location, city, province, type, status, stack_rate, short_stay_stack_rate, max_guests, nightly_rate, short_stay_rate, photo_path")
    .eq("id", propertyId)
    .single();

  if (!clientRecord || !property) notFound();

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Edit property"
        back={{ href: `/admin/clients/${id}`, label: clientRecord.name }}
      />

      <Link
        href={`/admin/photos/${property.id}`}
        className="relative block h-40 overflow-hidden rounded-2xl"
        style={{ background: unitArt(property.name, property.photo_path) }}
      >
        <span className="btn btn-primary absolute left-3 bottom-3 h-10 rounded-xl">
          <Images size={16} />
          Photos
        </span>
      </Link>

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
