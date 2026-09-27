import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clearPropertyPhoto, updateProperty, uploadPropertyPhoto } from "../../../../actions";
import { PropertyPhotoField } from "@/components/shared/PropertyPhotoField";
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
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <PageHeader
        title="Edit property"
        back={{ href: `/admin/clients/${id}`, label: clientRecord.name }}
      />

      <PropertyPhotoField
        name={property.name}
        photoPath={property.photo_path ?? null}
        fields={{ id: property.id, client_id: id }}
        uploadAction={uploadPropertyPhoto}
        removeAction={clearPropertyPhoto}
      />

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
