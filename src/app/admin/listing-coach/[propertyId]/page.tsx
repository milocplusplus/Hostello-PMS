import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  COACH_TABS,
  CoachListing,
  type CoachCompetitorRow,
  type CoachFix,
  type CoachReport,
  type CoachTab,
} from "@/components/admin/CoachListing";

export default async function CoachListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ tab?: string; error?: string; notice?: string }>;
}) {
  const { propertyId } = await params;
  const { tab, error, notice } = await searchParams;

  const supabase = await createClient();
  const [{ data: listing }, { data: reports }, { data: fixes }, { data: competitors }] = await Promise.all([
    supabase
      .from("coach_listings")
      .select("property_id, airbnb_url, properties:properties_v(name, clients:clients_v(name))")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("coach_reports")
      .select("*")
      .eq("property_id", propertyId)
      .order("run_on", { ascending: false })
      .limit(26),
    supabase
      .from("coach_fixes")
      .select("id, area, issue, fix, done_at, confirmed_on, reopened_on")
      .eq("property_id", propertyId)
      .order("created_at"),
    supabase
      .from("coach_competitors")
      .select("id, airbnb_url, title, source")
      .eq("property_id", propertyId)
      .order("created_at"),
  ]);
  if (!listing) notFound();

  const unit = listing.properties as unknown as { name: string; clients: { name: string } | null } | null;

  return (
    <CoachListing
      propertyId={propertyId}
      unitName={unit?.name ?? "Listing"}
      clientName={unit?.clients?.name}
      airbnbUrl={listing.airbnb_url}
      reports={(reports ?? []) as unknown as CoachReport[]}
      fixes={(fixes ?? []) as CoachFix[]}
      competitors={(competitors ?? []) as CoachCompetitorRow[]}
      tab={COACH_TABS.find((t) => t === tab) ?? ("overview" satisfies CoachTab)}
      error={error}
      notice={notice}
    />
  );
}
