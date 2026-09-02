import { ShieldCheck } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { opsCanPriceBookings } from "@/lib/payout-inputs";
import { Avatar } from "@/components/shared/Avatar";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  secondaryButton,
  errorBanner,
  noticeBanner,
} from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { inviteOpsUser, resetOpsPassword, setOpsAccess } from "./actions";

/**
 * Who else can sign in.
 *
 * An operations account sees the same stays, dates and guests as this portal
 * and none of the money: no revenue, no split, no payouts, no deal terms. The
 * listing needs the email and the ban state out of `auth.users`, which no
 * session may read — `list_ops_logins()` reads them and re-checks the caller.
 */

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string;
  blocked: boolean;
  last_sign_in_at: string | null;
};

function when(iso: string | null): string {
  if (!iso) return "never signed in";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "signed in today";
  if (days === 1) return "signed in yesterday";
  if (days < 30) return `signed in ${days} days ago`;
  return `signed in ${new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOwner();
  const { error, notice } = await searchParams;

  const supabase = await createClient();
  const { data, error: listError } = await supabase.rpc("list_ops_logins");
  const staff = (data ?? []) as StaffRow[];
  const canPrice = opsCanPriceBookings();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <p className="eyebrow">Management</p>
        <h1 className="text-2xl md:text-3xl font-semibold mt-1.5">Staff</h1>
        <p className="text-sm text-ink-secondary mt-2">
          An operations account runs the calendar, the bookings and the check-ins. It never
          sees revenue, the Hostello/client split, payouts, deal terms or this page.
        </p>
      </div>

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      {listError && (
        <p className={errorBanner}>The list of accounts could not be read: {listError.message}</p>
      )}

      {/* An ops login is denied the deal terms outright, so the server has to
          look them up on its behalf to work out a booking's split. Without the
          key it can't, and saving a booking is the one thing ops loses. */}
      {!canPrice && (
        <p className={errorBanner}>
          Operations accounts can see and run everything, but <strong>cannot save bookings</strong>{" "}
          until <code>SUPABASE_SERVICE_ROLE_KEY</code> is set on this deployment. Working out a
          booking&apos;s split needs the deal terms, which an operations login is not allowed to
          read, so the server reads them instead.
        </p>
      )}

      <section className="card p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Add an operations account</h2>
        <form action={inviteOpsUser} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabel} htmlFor="staff-name">
                Name
              </label>
              <input id="staff-name" name="full_name" className={fieldInput} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabel} htmlFor="staff-email">
                Email
              </label>
              <input
                id="staff-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                className={fieldInput}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabel} htmlFor="staff-password">
              Temporary password
            </label>
            <input
              id="staff-password"
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="off"
              className={fieldInput}
            />
            <p className="text-[11px] text-ink-muted">
              At least 8 characters. Hand it over yourself — nothing is emailed from here,
              and they can change it once they are in.
            </p>
          </div>
          <SubmitButton
            className={primaryButton}
            blocking
            busy="Creating the account…"
            note="Setting up their login and their operations role."
          >
            Create account
          </SubmitButton>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Operations team</h2>

        {staff.length === 0 && !listError && (
          <div className="card p-8 flex flex-col items-center gap-2 text-center">
            <ShieldCheck className="w-5 h-5 text-ink-muted" aria-hidden />
            <p className="text-sm text-ink-secondary">No operations accounts yet.</p>
          </div>
        )}

        {staff.map((s) => (
          <div key={s.id} className="card p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={s.full_name ?? s.email} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-primary truncate">
                  {s.full_name ?? s.email}
                  {s.blocked && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-negative border border-negative/40 rounded-full px-1.5 py-0.5">
                      No access
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-muted truncate mt-0.5">
                  {s.email} · {when(s.last_sign_in_at)}
                </p>
              </div>
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <form action={resetOpsPassword} className="flex items-end gap-2">
                <input type="hidden" name="id" value={s.id} />
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabel} htmlFor={`pw-${s.id}`}>
                    New password
                  </label>
                  <input
                    id={`pw-${s.id}`}
                    name="password"
                    type="text"
                    minLength={8}
                    autoComplete="off"
                    className={fieldInput}
                  />
                </div>
                <SubmitButton className={secondaryButton} busy="Setting the password…">
                  Set
                </SubmitButton>
              </form>

              <form action={setOpsAccess} className="ml-auto">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="blocked" value={(!s.blocked).toString()} />
                {s.blocked ? (
                  <SubmitButton className={secondaryButton} busy="Restoring access…">
                    Restore access
                  </SubmitButton>
                ) : (
                  <ConfirmDeleteButton
                    confirmText={`Remove ${s.full_name ?? s.email}'s access? They stay on past bookings they entered, and you can restore them here.`}
                    label="Remove access"
                    busy="Removing their access…"
                    className="text-xs text-ink-muted hover:text-negative transition-colors px-1"
                  />
                )}
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
