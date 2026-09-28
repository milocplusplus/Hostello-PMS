import Link from "next/link";
import { Landmark, Smartphone, Trash2 } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { loadSettings, houseStyle, WALLET_LABEL } from "@/lib/settings";
import { DEAL_MODELS, OTA_MODELS } from "@/lib/payout";
import { DEFAULT_TEMPLATES, GUEST_MESSAGES, TEMPLATE_FIELDS, type GuestMessageContext } from "@/lib/guest-messages";
import { addDaysISO, todayISO } from "@/lib/calendar";
import { fieldInput, fieldLabel, primaryButton, errorBanner, noticeBanner } from "@/lib/form-styles";
import { PageHeader } from "@/components/shared/PageHeader";
import { SubmitButton } from "@/components/shared/Busy";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import {
  addPaymentAccount,
  removePaymentAccount,
  saveBookingDefaults,
  saveBusiness,
  saveChannelInbox,
  saveDealDefaults,
  saveGuestTemplate,
  saveOpsRules,
  saveOwnerNoticeDefaults,
} from "./actions";
import { OWNER_NOTICE_GROUPS } from "@/lib/owner-notices";

function Section({
  id,
  title,
  about,
  children,
}: {
  id: string;
  title: string;
  about: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card p-5 md:p-6 flex flex-col gap-4 scroll-mt-24">
      <div>
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-ink-muted mt-1">{about}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={htmlFor} className={fieldLabel}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOwner();
  const { error, notice } = await searchParams;
  const s = await loadSettings();

  // A stay to preview the guest messages against — nobody real.
  const checkIn = addDaysISO(todayISO(), 7);
  const sample: GuestMessageContext = {
    guestName: "Ayesha Khan",
    unitNames: ["Gulberg 2BHK"],
    checkIn,
    checkOut: addDaysISO(checkIn, 3),
    balanceDue: 15000,
    expectedArrival: null,
    expectedDeparture: null,
    shortStay: null,
    house: houseStyle(s),
  };

  const opsRules = [
    { name: "ops_can_edit_prices", on: s.opsCanEditPrices, label: "Change prices", about: "Sale price, per-night price and advance on an existing booking." },
    { name: "ops_can_cancel", on: s.opsCanCancel, label: "Cancel bookings", about: "Ops can cancel a stay." },
    { name: "ops_can_block", on: s.opsCanBlock, label: "Block and unblock dates", about: "Ops can add and remove blocks on the calendar." },
  ];

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      <PageHeader
        title="Settings"
        sub="How Hostello works, in one place"
        info={
          <p>
            Every change here is recorded in the audit log with what it was before. Defaults only
            pre-fill new clients and bookings — nothing already saved is changed.
          </p>
        }
      />

      {notice && <p className={noticeBanner}>{notice}</p>}
      {error && <p className={errorBanner}>{error}</p>}

      <Section id="business" title="Business" about="On payment receipts, the monthly statement PDF, guest messages and the sign-in page.">
        <form action={saveBusiness} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Business name" htmlFor="business_name">
            <input id="business_name" name="business_name" required maxLength={80} defaultValue={s.businessName} className={fieldInput} />
          </Field>
          <Field label="Phone" htmlFor="business_phone">
            <input id="business_phone" name="business_phone" defaultValue={s.businessPhone ?? ""} className={fieldInput} />
          </Field>
          <Field label="Email" htmlFor="business_email">
            <input id="business_email" name="business_email" type="email" defaultValue={s.businessEmail ?? ""} className={fieldInput} />
          </Field>
          <Field label="Address" htmlFor="business_address">
            <input id="business_address" name="business_address" defaultValue={s.businessAddress ?? ""} className={fieldInput} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton className={primaryButton} busy="Saving…">Save</SubmitButton>
          </div>
        </form>
      </Section>

      <Section id="payments" title="Hostello payment details" about="Shown to owners when they pay Hostello, each number with a copy button, and put into the guest balance reminder.">
        {s.paymentAccounts.length === 0 ? (
          <p className="text-sm text-ink-secondary">No accounts yet. Owners see none until you add one.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border-hairline)]">
            {s.paymentAccounts.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 shrink-0">
                  {a.kind === "bank" ? <Landmark size={16} /> : <Smartphone size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">
                    {a.kind === "bank" ? a.bank : WALLET_LABEL[a.kind]} · {a.title}
                  </p>
                  <p className="text-xs text-ink-muted truncate">
                    {a.number}
                    {a.kind === "bank" && a.iban ? ` · ${a.iban}` : ""}
                  </p>
                </div>
                <form action={removePaymentAccount}>
                  <input type="hidden" name="index" value={i} />
                  <ConfirmDeleteButton
                    confirmText="Remove this account? Owners will stop seeing it."
                    label="Remove account"
                    busy="Removing…"
                    className="p-2 text-ink-muted hover:text-negative transition-colors"
                  >
                    <Trash2 size={15} />
                  </ConfirmDeleteButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-hostello-purple-light">Add a bank account</summary>
          <form action={addPaymentAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <input type="hidden" name="kind" value="bank" />
            <Field label="Bank" htmlFor="bank"><input id="bank" name="bank" required placeholder="e.g. Meezan Bank" className={fieldInput} /></Field>
            <Field label="Account title" htmlFor="bank_title"><input id="bank_title" name="title" required className={fieldInput} /></Field>
            <Field label="Account number" htmlFor="bank_number"><input id="bank_number" name="number" required className={fieldInput} /></Field>
            <Field label="IBAN (optional)" htmlFor="iban"><input id="iban" name="iban" placeholder="PK36…" className={fieldInput} /></Field>
            <div className="sm:col-span-2"><SubmitButton className={primaryButton} busy="Adding…">Add bank account</SubmitButton></div>
          </form>
        </details>

        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-hostello-purple-light">Add JazzCash / Easypaisa</summary>
          <form action={addPaymentAccount} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <Field label="Wallet" htmlFor="wallet_kind">
              <select id="wallet_kind" name="kind" className={fieldInput} defaultValue="jazzcash">
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">Easypaisa</option>
              </select>
            </Field>
            <Field label="Account name" htmlFor="wallet_title"><input id="wallet_title" name="title" required className={fieldInput} /></Field>
            <Field label="Number" htmlFor="wallet_number"><input id="wallet_number" name="number" required inputMode="tel" className={fieldInput} /></Field>
            <div className="sm:col-span-3"><SubmitButton className={primaryButton} busy="Adding…">Add wallet</SubmitButton></div>
          </form>
        </details>
      </Section>

      <Section id="channel-inbox" title="Channel inbox" about="Where Airbnb and Booking.com emails are forwarded, and the account owners invite as co-host. Setting the address takes the inbox out of 'coming soon' and fills in the setup guides.">
        <form action={saveChannelInbox} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Inbox address" htmlFor="channel_inbox_address">
            <input id="channel_inbox_address" name="channel_inbox_address" type="email" placeholder="bookings@yourdomain.com" defaultValue={s.channelInboxAddress ?? ""} className={fieldInput} />
          </Field>
          <Field label="Hostello's channel account email" htmlFor="channel_cohost_email">
            <input id="channel_cohost_email" name="channel_cohost_email" type="email" placeholder="The email on Hostello's Airbnb account" defaultValue={s.channelCohostEmail ?? ""} className={fieldInput} />
          </Field>
          <div className="sm:col-span-2 flex items-center gap-3 flex-wrap">
            <SubmitButton className={primaryButton} busy="Saving…">Save</SubmitButton>
            <Link href="/admin/channel-inbox/setup" className="text-xs text-hostello-gold hover:underline">
              Setup guide
            </Link>
          </div>
        </form>
      </Section>

      <Section id="deals" title="Default deal terms" about="Pre-filled when you add a client. Existing clients keep their own terms.">
        <form action={saveDealDefaults} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Deal model" htmlFor="default_deal_model">
            <select id="default_deal_model" name="default_deal_model" defaultValue={s.defaultDealModel} className={fieldInput}>
              {DEAL_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Monthly fee (PKR)" htmlFor="default_monthly_fee">
            <input id="default_monthly_fee" name="default_monthly_fee" type="number" min="0" step="1" defaultValue={s.defaultMonthlyFee} className={fieldInput} />
          </Field>
          <Field label="Hostello share %" htmlFor="default_share_percent">
            <input id="default_share_percent" name="default_share_percent" type="number" min="0" max="100" step="0.5" defaultValue={s.defaultSharePercent} className={fieldInput} />
          </Field>
          <Field label="Deduction %" htmlFor="default_deduct_percent">
            <input id="default_deduct_percent" name="default_deduct_percent" type="number" min="0" max="100" step="0.5" defaultValue={s.defaultDeductPercent} className={fieldInput} />
          </Field>
          <Field label="OTA bookings (Airbnb, Booking.com)" htmlFor="default_ota_model">
            <select id="default_ota_model" name="default_ota_model" defaultValue={s.defaultOtaModel} className={fieldInput}>
              {OTA_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="OTA share %" htmlFor="default_ota_share_percent">
            <input id="default_ota_share_percent" name="default_ota_share_percent" type="number" min="0" max="100" step="0.5" defaultValue={s.defaultOtaSharePercent} className={fieldInput} />
          </Field>
          <div className="sm:col-span-2"><SubmitButton className={primaryButton} busy="Saving…">Save</SubmitButton></div>
        </form>
      </Section>

      <Section id="bookings" title="Bookings" about="What a new booking starts with, in both portals. Everything stays editable on the booking.">
        <form action={saveBookingDefaults} className="grid grid-cols-2 gap-3">
          <Field label="Standard check-in" htmlFor="checkin_time">
            <input id="checkin_time" name="checkin_time" type="time" required defaultValue={s.checkinTime} className={fieldInput} />
          </Field>
          <Field label="Standard check-out" htmlFor="checkout_time">
            <input id="checkout_time" name="checkout_time" type="time" required defaultValue={s.checkoutTime} className={fieldInput} />
          </Field>
          <Field label="Short stay from" htmlFor="short_stay_start">
            <input id="short_stay_start" name="short_stay_start" type="time" required defaultValue={s.shortStayStart} className={fieldInput} />
          </Field>
          <Field label="Short stay to" htmlFor="short_stay_end">
            <input id="short_stay_end" name="short_stay_end" type="time" required defaultValue={s.shortStayEnd} className={fieldInput} />
          </Field>
          <div className="col-span-2">
            <Field label="A new booking starts as" htmlFor="default_booking_status">
              <select id="default_booking_status" name="default_booking_status" defaultValue={s.defaultBookingStatus} className={fieldInput}>
                <option value="confirmed">Confirmed — the guest is definitely coming</option>
                <option value="tentative">Tentative — on hold until confirmed</option>
              </select>
            </Field>
          </div>
          <div className="col-span-2"><SubmitButton className={primaryButton} busy="Saving…">Save</SubmitButton></div>
        </form>
      </Section>

      <Section id="ops" title="Operations team" about="What ops accounts may do. Switched-off actions are hidden from them and refused by the server.">
        <form action={saveOpsRules} className="flex flex-col gap-3">
          {opsRules.map((r) => (
            <label key={r.name} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" name={r.name} defaultChecked={r.on} className="mt-1 h-4 w-4 accent-[var(--color-hostello-purple)]" />
              <span>
                <span className="block text-sm font-bold">{r.label}</span>
                <span className="block text-xs text-ink-muted">{r.about}</span>
              </span>
            </label>
          ))}
          <div><SubmitButton className={primaryButton} busy="Saving…">Save</SubmitButton></div>
        </form>
      </Section>

      <Section id="owner-notices" title="Owner notifications" about="What every owner is sent by default. You can change it for one owner on their client page, and owners can mute more themselves.">
        <form action={saveOwnerNoticeDefaults} className="flex flex-col gap-3">
          {OWNER_NOTICE_GROUPS.map((g) => (
            <label key={g.key} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" name={g.key} defaultChecked={s.ownerNotices[g.key]} className="mt-1 h-4 w-4 accent-[var(--color-hostello-purple)]" />
              <span>
                <span className="block text-sm font-bold">{g.label}</span>
                <span className="block text-xs text-ink-muted">{g.about}</span>
              </span>
            </label>
          ))}
          <div><SubmitButton className={primaryButton} busy="Saving…">Save</SubmitButton></div>
        </form>
      </Section>

      <Section id="messages" title="Guest messages" about="The WhatsApp texts on each booking. Staff can still edit a message before sending it.">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-[11px] font-bold text-ink-secondary mb-1.5">Fill-ins</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-muted">
            {TEMPLATE_FIELDS.map((f) => (
              <li key={f.key}>
                <code className="text-hostello-gold">{`{${f.key}}`}</code> — {f.about}
              </li>
            ))}
          </ul>
        </div>
        {GUEST_MESSAGES.map((m) => (
          <TemplateEditor
            key={m.id}
            id={m.id}
            label={m.label}
            saved={s.guestTemplates[m.id] ?? null}
            builtIn={DEFAULT_TEMPLATES[m.id]}
            sample={sample}
            action={saveGuestTemplate}
          />
        ))}
      </Section>
    </div>
  );
}
