import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, currentUser } from "@/lib/auth";
import { todayISO } from "@/lib/calendar";
import { findAvailable, readCriteria, type FinderParams } from "@/lib/availability-search";
import { AvailabilityFinder } from "@/components/shared/AvailabilityFinder";
import { AvailabilityResults } from "@/components/shared/AvailabilityResults";
import { PageHeader } from "@/components/shared/PageHeader";

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
  const result = await findAvailable(supabase, criteria, client.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find dates"
        info={
          <p>
            Which of your units are free, for how many guests and at what price, so you can
            answer someone without opening the calendar.
          </p>
        }
      />

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
