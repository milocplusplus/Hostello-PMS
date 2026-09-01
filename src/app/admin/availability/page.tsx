import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import { findAvailable, readCriteria, type FinderParams } from "@/lib/availability-search";
import { AvailabilityFinder } from "@/components/shared/AvailabilityFinder";
import { AvailabilityResults } from "@/components/shared/AvailabilityResults";

/**
 * Answering an enquiry, for both staff roles. Nothing here is a split figure —
 * the guest count and the asking rate are what ops quotes at the door — so it
 * is not behind `canSeeSplit`. Only the "Add details" shortcut is, because it
 * points into `/admin/clients`, which ops is bounced off.
 */
export default async function AdminAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<FinderParams>;
}) {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const owner = canSeeSplit((await currentProfile())?.role);
  const criteria = readCriteria(await searchParams);
  const result = await findAvailable(supabase, criteria);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">OPERATIONS</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Availability finder</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          What is free, for how many, at what price. Everything listed here can actually be
          booked — it reads the same occupied nights the booking form checks on save.
        </p>
      </div>

      <AvailabilityFinder criteria={criteria} today={todayISO()} />

      <AvailabilityResults
        result={result}
        criteria={criteria}
        base="/admin"
        showClient
        canEditProperties={owner}
      />
    </div>
  );
}
