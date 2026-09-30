import { createClientRecord } from "../actions";
import { ClientForm } from "@/components/admin/ClientForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { loadSettings } from "@/lib/settings";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // The deal terms start at the defaults in Settings; the admin can change any.
  const s = await loadSettings();

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Add a client"
        back={{ href: "/admin/clients", label: "Clients" }}
      />

      <ClientForm
        action={createClientRecord}
        error={error}
        submitLabel="Save client"
        defaultValues={{
          name: "",
          deal_model: s.defaultDealModel,
          monthly_fee: s.defaultMonthlyFee,
          share_percent: s.defaultSharePercent,
          deduct_percent: s.defaultDeductPercent,
          ota_model: s.defaultOtaModel,
          ota_share_percent: s.defaultOtaSharePercent,
        }}
      />
    </div>
  );
}
