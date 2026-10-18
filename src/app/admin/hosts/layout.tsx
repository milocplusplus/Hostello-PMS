import { requireOwner } from "@/lib/auth";

/** Owner-only: plans and payments are the platform's business, not ops'. */
export default async function HostsLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
