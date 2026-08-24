import Link from "next/link";
import { createClientRecord } from "../actions";
import { ClientForm } from "@/components/admin/ClientForm";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6">
      <div>
        <Link href="/admin/clients" className="text-ink-muted text-xs hover:text-ink-secondary">
          ← Clients
        </Link>
        <h1 className="text-xl font-medium mt-1">Add a client</h1>
      </div>

      <ClientForm action={createClientRecord} error={error} submitLabel="Save client" />
    </div>
  );
}
