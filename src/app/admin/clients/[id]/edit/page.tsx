import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateClientRecord } from "../../actions";
import { ClientForm } from "@/components/admin/ClientForm";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function EditClientPage({
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
    .select("id, name, contact_email, contact_phone, deal_model, monthly_fee, share_percent, deduct_percent, ota_model, ota_share_percent")
    .eq("id", id)
    .single();

  if (!clientRecord) notFound();

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <PageHeader
        title="Edit client"
        back={{ href: `/admin/clients/${id}`, label: clientRecord.name }}
      />

      <ClientForm
        action={updateClientRecord}
        clientId={id}
        defaultValues={clientRecord}
        error={error}
        submitLabel="Save changes"
      />
    </div>
  );
}
