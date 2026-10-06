import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canSeeSplit, currentProfile, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import {
  findAvailable,
  listFinderOptions,
  readCriteria,
  type FinderParams,
} from "@/lib/availability-search";
import { AvailabilityFinder } from "@/components/shared/AvailabilityFinder";
import { AvailabilityResults } from "@/components/shared/AvailabilityResults";
import { PageHeader } from "@/components/shared/PageHeader";

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
  const [result, options] = await Promise.all([
    findAvailable(supabase, criteria),
    listFinderOptions(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find dates"
        info={
          <p>
            What is free, for how many, at what price. Everything listed here can actually be
            booked: it reads the same occupied nights the booking form checks on save.
          </p>
        }
      />

      <AvailabilityFinder
        key={JSON.stringify(criteria)}
        criteria={criteria}
        today={todayISO()}
        options={options}
      />

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
