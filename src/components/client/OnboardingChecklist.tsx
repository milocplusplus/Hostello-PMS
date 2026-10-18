import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * The first three things a new host does, ticked from their own data. It goes
 * away on its own once all three are true, so it never lingers as clutter.
 */
export async function OnboardingChecklist({ clientId }: { clientId: string }) {
  const supabase = await createClient();

  const [{ data: units }, { count: bookings }] = await Promise.all([
    supabase.from("properties").select("id").eq("client_id", clientId).order("created_at"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);

  const unitIds = (units ?? []).map((u) => u.id);
  const firstUnit = unitIds[0] ?? null;
  let linked = false;
  if (unitIds.length > 0) {
    const { count } = await supabase
      .from("calendar_feeds")
      .select("id", { count: "exact", head: true })
      .in("property_id", unitIds);
    linked = (count ?? 0) > 0;
  }

  const steps = [
    { done: Boolean(firstUnit), label: "Add your first property", href: "/client/properties/new" },
    {
      done: linked,
      label: "Connect your Airbnb calendar",
      href: firstUnit ? `/client/properties/${firstUnit}/calendar` : "/client/properties/new",
    },
    { done: (bookings ?? 0) > 0, label: "Add your first booking", href: "/client/bookings/new" },
  ];

  if (steps.every((s) => s.done)) return null;

  return (
    <section className="card p-5 flex flex-col gap-3">
      <h2 className="text-lg">Get set up</h2>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="tile px-3 py-2.5 flex items-center gap-3 text-sm hover:border-border-strong transition-colors"
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  s.done ? "gradient-gold text-surface-0" : "border border-border-hairline text-ink-muted"
                }`}
              >
                {s.done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className={s.done ? "text-ink-muted line-through" : "text-ink-primary"}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
