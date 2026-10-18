import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { HealthChip } from "@/components/admin/HealthChip";
import { SubmitButton } from "@/components/shared/Busy";
import { PageHeader } from "@/components/shared/PageHeader";
import { errorBanner, fieldInput, fieldLabel, noticeBanner, primaryButton, secondaryButton } from "@/lib/form-styles";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import { PAYMENT_METHODS, SUBSCRIPTION_STATUSES, subscriptionHealth, type HostSubscription } from "@/lib/hosts";
import { viewAsOwner } from "../../clients/actions";
import { extendHostTrial, recordHostPayment, saveHostSubscription } from "../actions";

const STATUS_LABEL: Record<string, string> = {
  trial: "Free trial",
  active: "Paid",
  read_only: "Lapsed (read-only)",
  paused: "Paused",
};

export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const [{ data: host }, { data: plans }, { data: payments }, { count: units }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, contact_email, contact_phone, created_at, terms_accepted_at, subscriptions(plan_key, billing_period, status, trial_ends_at, current_period_end, comped, note)"
      )
      .eq("id", id)
      .eq("account_type", "host")
      .maybeSingle(),
    supabase.from("plans").select("key, name, max_listings").order("sort"),
    supabase
      .from("subscription_payments")
      .select("id, amount, method, reference, months, period_end, note, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("client_id", id),
  ]);
  if (!host) notFound();

  const raw = host.subscriptions as unknown as HostSubscription | HostSubscription[] | null;
  const sub = (Array.isArray(raw) ? raw[0] : raw) ?? null;
  const planName = (key: string) => plans?.find((p) => p.key === key)?.name ?? key;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <PageHeader
        title={host.name}
        sub={[host.contact_email, host.contact_phone].filter(Boolean).join(" · ")}
        back={{ href: "/admin/hosts", label: "Hosts" }}
        actions={<HealthChip health={subscriptionHealth(sub)} />}
      />

      {error && <p className={errorBanner}>{error}</p>}
      {notice && <p className={noticeBanner}>{notice}</p>}

      <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-secondary">
        <span>Joined {formatDayMonth(host.created_at.slice(0, 10))}</span>
        <span>
          {units ?? 0} {units === 1 ? "property" : "properties"}
        </span>
        <span>{host.terms_accepted_at ? "Accepted the terms" : "Terms not recorded"}</span>
        <form action={viewAsOwner} className="ml-auto">
          <input type="hidden" name="id" value={id} />
          <SubmitButton className={secondaryButton} busy="Opening their account…">
            <Eye size={14} />
            View as host
          </SubmitButton>
        </form>
      </div>

      {!sub ? (
        <p className={errorBanner}>This host has no plan row. Something went wrong at sign-up.</p>
      ) : (
        <>
          <section className="card p-5 flex flex-col gap-4">
            <h2 className="text-base">Trial</h2>
            <p className="text-xs text-ink-secondary">
              {sub.trial_ends_at
                ? `Trial ends ${formatDayMonth(sub.trial_ends_at.slice(0, 10))}.`
                : "No trial end set."}{" "}
              Extending brings a lapsed host back to trial.
            </p>
            <div className="flex flex-wrap gap-2">
              {[7, 14, 30].map((d) => (
                <form key={d} action={extendHostTrial}>
                  <input type="hidden" name="client_id" value={id} />
                  <input type="hidden" name="days" value={d} />
                  <SubmitButton className={secondaryButton} busy="Extending…">
                    +{d} days
                  </SubmitButton>
                </form>
              ))}
            </div>
          </section>

          <section className="card p-5 flex flex-col gap-4">
            <h2 className="text-base">Record a payment</h2>
            <p className="text-xs text-ink-secondary">
              For a host who paid by bank transfer, JazzCash or cash. It marks them paid and moves the
              paid-until date forward.
              {sub.current_period_end && ` Paid until ${formatDayMonth(sub.current_period_end.slice(0, 10))} now.`}
            </p>
            <form action={recordHostPayment} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="hidden" name="client_id" value={id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="amount" className={fieldLabel}>
                  Amount received (PKR)
                </label>
                <input id="amount" name="amount" type="number" min="0" step="1" required className={fieldInput} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="months" className={fieldLabel}>
                  Pays for
                </label>
                <select id="months" name="months" defaultValue="1" className={fieldInput}>
                  <option value="1">1 month</option>
                  <option value="12">12 months</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="method" className={fieldLabel}>
                  How
                </label>
                <select id="method" name="method" defaultValue="bank" className={fieldInput}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="reference" className={fieldLabel}>
                  Reference (optional)
                </label>
                <input id="reference" name="reference" placeholder="Transaction ID" className={fieldInput} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="pay_note" className={fieldLabel}>
                  Note (optional)
                </label>
                <input id="pay_note" name="note" className={fieldInput} />
              </div>
              <SubmitButton className={`${primaryButton} sm:col-span-2 sm:justify-self-start`} busy="Recording the payment…">
                Record payment
              </SubmitButton>
            </form>

            {(payments ?? []).length > 0 && (
              <ul className="flex flex-col divide-y divide-[var(--color-border-hairline)] border-t border-border-hairline">
                {(payments ?? []).map((p) => (
                  <li key={p.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-ink-primary">
                        <span className="num font-semibold">{formatPKR(Number(p.amount))}</span> ·{" "}
                        {PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method} ·{" "}
                        {p.months === 12 ? "12 months" : "1 month"}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {formatDayMonth(p.created_at.slice(0, 10))} · to {formatDayMonth(p.period_end.slice(0, 10))}
                        {p.reference ? ` · ${p.reference}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 flex flex-col gap-4">
            <h2 className="text-base">Plan and standing</h2>
            <p className="text-xs text-ink-secondary">
              The dates and status are set by hand here. Comped means a plan you are giving away: it
              shows as paid and never lapses on its own.
            </p>
            <form action={saveHostSubscription} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="hidden" name="client_id" value={id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="plan_key" className={fieldLabel}>
                  Plan
                </label>
                <select id="plan_key" name="plan_key" defaultValue={sub.plan_key} className={fieldInput}>
                  {(plans ?? []).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} · up to {p.max_listings} properties
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="status" className={fieldLabel}>
                  Status
                </label>
                <select id="status" name="status" defaultValue={sub.status} className={fieldInput}>
                  {SUBSCRIPTION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="trial_ends_at" className={fieldLabel}>
                  Trial ends
                </label>
                <input
                  id="trial_ends_at"
                  name="trial_ends_at"
                  type="date"
                  defaultValue={sub.trial_ends_at?.slice(0, 10) ?? ""}
                  className={fieldInput}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="current_period_end" className={fieldLabel}>
                  Paid until
                </label>
                <input
                  id="current_period_end"
                  name="current_period_end"
                  type="date"
                  defaultValue={sub.current_period_end?.slice(0, 10) ?? ""}
                  className={fieldInput}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-secondary sm:col-span-2">
                <input type="checkbox" name="comped" defaultChecked={sub.comped} />
                Comped (free plan, given by you)
              </label>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="note" className={fieldLabel}>
                  Note (only you see this)
                </label>
                <input id="note" name="note" defaultValue={sub.note ?? ""} className={fieldInput} />
              </div>
              <SubmitButton className={`${primaryButton} sm:col-span-2 sm:justify-self-start`} busy="Saving…">
                Save plan
              </SubmitButton>
            </form>
            <p className="text-[11px] text-ink-muted">Now on {planName(sub.plan_key)}.</p>
          </section>
        </>
      )}
    </div>
  );
}
