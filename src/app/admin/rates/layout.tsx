import { requireOwner } from "@/lib/auth";

/** Owner-only. Ops has no nav link here, which is not the same as being kept out. */
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
