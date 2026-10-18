import { redirect } from "next/navigation";
import { currentClient } from "@/lib/auth";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { saveHostProperty } from "../actions";

export default async function NewHostPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const client = await currentClient();
  // Managed owners ask Hostello for changes; only a self-serve host adds units.
  if (!client || client.account_type !== "host") redirect("/client/properties");

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader title="Add a property" back={{ href: "/client/properties", label: "Properties" }} />
      <PropertyForm
        action={saveHostProperty}
        clientId={client.id}
        error={error}
        submitLabel="Save property"
        hostMode
      />
    </div>
  );
}
