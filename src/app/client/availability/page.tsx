import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import { findAvailable, readCriteria, type FinderParams } from "@/lib/availability-search";
import { AvailabilityFinder } from "@/components/shared/AvailabilityFinder";
import { AvailabilityResults } from "@/components/shared/AvailabilityResults";

/**
 * The owner's own version. `properties_v` scopes it to their units on its own,
 * so there is no client filter here and no client column in the results.
 */
export default async function ClientAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<FinderParams>;
}) {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect("/login");

  const client = await currentClient();
  if (!client) redirect("/login");

  const criteria = readCriteria(await searchParams);
  const result = await findAvailable(supabase, criteria);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">YOUR PROPERTIES</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Availability finder</h1>
        <p className="text-sm text-ink-secondary mt-1.5">
          Which of your units are free, for how many guests and at what price — so you can
          answer someone without opening the calendar.
        </p>
      </div>

      <AvailabilityFinder criteria={criteria} today={todayISO()} />

      <AvailabilityResults
        result={result}
        criteria={criteria}
        base="/client"
        showClient={false}
        canEditProperties={false}
      />
    </div>
  );
}
