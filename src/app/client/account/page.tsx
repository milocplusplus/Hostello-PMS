import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/auth";
import { HealthChip } from "@/components/admin/HealthChip";
import { HostExport } from "@/components/client/HostExport";
import { SubmitButton } from "@/components/shared/Busy";
import { PageHeader } from "@/components/shared/PageHeader";
import { errorBanner, fieldInput, fieldLabel } from "@/lib/form-styles";
import { formatDayMonth } from "@/lib/calendar";
import { subscriptionHealth, type HostSubscription } from "@/lib/hosts";
import { businessContact, loadSettings } from "@/lib/settings";
import { deleteMyAccount, exportMyData } from "./actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const client = await currentClient();
  // Managed owners have Hostello for all of this.
  if (!client || client.account_type !== "host") redirect("/client");

  const supabase = await createClient();
  const [{ data: sub }, { count: units }, settings] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_key, billing_period, status, trial_ends_at, current_period_end, comped, note, plans(name, max_listings)")
      .eq("client_id", client.id)
      .maybeSingle(),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("status", "active"),
    loadSettings(),
  ]);

  const plan = sub ? (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) : null;
  const contact = businessContact(settings);
  const health = subscriptionHealth((sub as unknown as HostSubscription) ?? null);
  const phone = settings.businessPhone?.replace(/[^\d+]/g, "") ?? "";

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader title="Account" sub={client.name} />

      {error && <p className={errorBanner}>{error}</p>}

      <section className="card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base">Your plan</h2>
          <HealthChip health={health} />
        </div>
        {sub ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-ink-muted">Plan</dt>
            <dd className="text-ink-primary">{plan ? `${plan.name} · up to ${plan.max_listings} properties` : sub.plan_key}</dd>
            <dt className="text-ink-muted">In use</dt>
            <dd className="text-ink-primary">
              {units ?? 0}
              {plan ? ` of ${plan.max_listings}` : ""} active {units === 1 ? "property" : "properties"}
            </dd>
            {sub.status === "trial" && sub.trial_ends_at && (
              <>
                <dt className="text-ink-muted">Trial ends</dt>
                <dd className="text-ink-primary">{formatDayMonth(sub.trial_ends_at.slice(0, 10))}</dd>
              </>
            )}
            {sub.current_period_end && sub.status !== "trial" && (
              <>
                <dt className="text-ink-muted">Paid until</dt>
                <dd className="text-ink-primary">{formatDayMonth(sub.current_period_end.slice(0, 10))}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-ink-secondary">No plan is set on this account.</p>
        )}
        <p className="text-xs text-ink-secondary">
          To pay, renew or change plan, contact {contact.name}
          {contact.line ? `: ${contact.line}` : "."}
        </p>
        {phone && (
          <a
            href={`https://wa.me/${phone.replace(/^\+/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm self-start"
          >
            Message on WhatsApp
          </a>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="text-base">Your data</h2>
        <p className="text-xs text-ink-secondary">
          A spreadsheet with your bookings, guest payments, expenses and properties. It works even if
          your plan has lapsed.
        </p>
        <HostExport action={exportMyData} />
      </section>

      <section className="card p-5 flex flex-col gap-3 border-status-booked/30">
        <h2 className="text-base">Delete my account</h2>
        <p className="text-xs text-ink-secondary">
          This removes your properties, bookings, guest details, ID scans, photos, expenses and your
          sign-in, for good. It cannot be undone, so download your data first. What you paid Hostello
          stays on record, and Hostello&apos;s internal activity log keeps its entries.
        </p>
        <form action={deleteMyAccount} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className={fieldLabel}>
              Type DELETE to confirm
            </label>
            <input
              id="confirm"
              name="confirm"
              required
              autoComplete="off"
              pattern="DELETE"
              placeholder="DELETE"
              className={fieldInput}
            />
          </div>
          <SubmitButton
            className="btn btn-ghost btn-sm text-status-booked"
            blocking
            busy="Deleting your account…"
            note="This can take a few seconds."
          >
            Delete everything
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
