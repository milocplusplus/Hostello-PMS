import { createClientRecord } from "../actions";
import { ClientForm } from "@/components/admin/ClientForm";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <PageHeader
        title="Add a client"
        back={{ href: "/admin/clients", label: "Clients" }}
      />

      <ClientForm action={createClientRecord} error={error} submitLabel="Save client" />
    </div>
  );
}
