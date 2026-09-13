import { requireOwner } from "@/lib/auth";

/**
 * Owner-only. Applying a request writes `properties`, which only `is_admin()`
 * has a policy for — ops can read the queue but could never clear it, so the
 * page itself is the owner's.
 */
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
