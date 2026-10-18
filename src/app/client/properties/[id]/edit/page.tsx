import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { saveHostProperty } from "../../actions";

export default async function EditHostPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const client = await currentClient();
  if (!client || client.account_type !== "host") redirect("/client/properties");

  const supabase = await createClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, name, location, province, city, type, status, max_guests, nightly_rate, short_stay_rate")
    .eq("id", id)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!property) notFound();

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader title="Edit property" back={{ href: "/client/properties", label: "Properties" }} />
      <PropertyForm
        action={saveHostProperty}
        clientId={client.id}
        propertyId={property.id}
        defaultValues={property}
        error={error}
        submitLabel="Save changes"
        hostMode
      />
    </div>
  );
}
