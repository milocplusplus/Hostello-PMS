import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/calendar";

/** A host's plan and standing, from their own subscription row. Nothing for a managed owner. */
export async function HostPlanBanner({ clientId }: { clientId: string }) {
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, plans(name, max_listings)")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!sub) return null;

  const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
  const planText = plan ? `${plan.name} plan · up to ${plan.max_listings} listings` : "";

  let headline: string;
  if (sub.status === "trial") {
    const days = sub.trial_ends_at
      ? Math.max(
          0,
          Math.round(
            (Date.parse(sub.trial_ends_at.slice(0, 10)) - Date.parse(todayISO())) / 86_400_000
          )
        )
      : 0;
    headline = `Free trial · ${days} ${days === 1 ? "day" : "days"} left`;
  } else if (sub.status === "read_only") {
    headline = "Your plan has lapsed · read-only";
  } else if (sub.status === "paused") {
    headline = "Your account is paused";
  } else {
    return null;
  }

  return (
    <div className="mb-4 rounded-2xl border border-hostello-gold/30 bg-hostello-gold/10 px-4 py-2.5 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-semibold text-hostello-gold">{headline}</span>
      {planText && <span className="text-ink-secondary">{planText}</span>}
    </div>
  );
}
