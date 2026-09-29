"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  NotebookPen,
  Plus,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  calculatePayout,
  formatPKR,
  isOtaSource,
  isPassThroughSource,
  nightsBetween,
  usesStackRate,
  type DealModel,
  type OtaModel,
} from "@/lib/payout";
import { BOOKING_SOURCES, sourceColor, sourceLabel } from "@/lib/block-sources";
import { formatDayMonth } from "@/lib/calendar";
import { formatNightly, type PriceMode } from "@/lib/booking-price";
import { RECEIPT_ACCEPT, RECEIPT_KINDS } from "@/lib/receipts";
import { GUEST_ID_ACCEPT } from "@/lib/guest-ids";
import { StayDates } from "@/components/shared/StayDates";
import type { UnavailableRange } from "@/lib/availability";
import type { BookingDefaults } from "@/lib/settings";
import {
  DEFAULT_SHORT_STAY,
  shortStayCheckOut,
  shortStayHours,
} from "@/lib/short-stay";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  errorBanner,
} from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";

type PropertyOption = {
  id: string;
  name: string;
  stack_rate: number;
  short_stay_stack_rate: number;
  client_id: string;
  client_name: string;
};

type ClientTerms = {
  id: string;
  deal_model: DealModel;
  share_percent: number;
  deduct_percent: number;
  ota_model: OtaModel;
  ota_share_percent: number;
};

/** Everything an existing booking fills back in when it is reopened for editing. */
export type BookingFormValues = {
  guestName: string | null;
  guestPhone: string | null;
  guestsCount: number | null;
  salePrice: number;
  /** Set only when the stay was priced per night rather than as a total. */
  nightlyPrice: number | null;
  advance: number;
  source: string;
  status: "confirmed" | "tentative";
  notes: string | null;
  extraUnitIds: string[];
  /** Set only when the booking is hours rather than nights. */
  shortStay: { start: string; end: string } | null;
  /** When the guest says they will turn up and leave. Null = not told us. */
  expectedArrival: string | null;
  expectedDeparture: string | null;
};

export function BookingForm({
  action,
  properties,
  clients,
  initialPropertyId,
  initialDate,
  initialCheckOut,
  initialSource,
  fromBlockId,
  values,
  unavailable = [],
  submitLabel = "Save booking",
  allowReceipt = true,
  showPayoutPreview = true,
  defaults,
  lockPrices = false,
  error,
}: {
  action: (formData: FormData) => void;
  properties: PropertyOption[];
  clients: ClientTerms[];
  initialPropertyId?: string;
  initialDate?: string;
  initialCheckOut?: string;
  /** The channel a prefilled booking came from. Still the admin's to change. */
  initialSource?: string;
  /** The imported hold being written up — see `from_block` in the booking write. */
  fromBlockId?: string;
  /** Present only when an existing booking is being edited. */
  values?: BookingFormValues;
  /** Occupied nights across every selectable unit — the picker greys them out. */
  unavailable?: UnavailableRange[];
  submitLabel?: string;
  /** Token receipts are Hostello's to upload — off in the client portal. */
  allowReceipt?: boolean;
  /** The live split. Off for ops, who fill the same form without seeing it. */
  showPayoutPreview?: boolean;
  /** Business settings for a new booking: status, standard times, short-stay hours. */
  defaults?: BookingDefaults;
  /** Ops with price edits switched off: the figures show but cannot be changed. */
  lockPrices?: boolean;
  error?: string;
}) {
  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.client_name.localeCompare(b.client_name) || a.name.localeCompare(b.name)),
    [properties]
  );

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? sortedProperties[0]?.id ?? "");
  const [extraUnitIds, setExtraUnitIds] = useState<string[]>(values?.extraUnitIds ?? []);
  const [checkIn, setCheckIn] = useState(initialDate ?? "");
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? "");
  const [shortStay, setShortStay] = useState(Boolean(values?.shortStay));
  const [stayStart, setStayStart] = useState(
    values?.shortStay?.start ?? defaults?.shortStayStart ?? DEFAULT_SHORT_STAY.start
  );
  const [stayEnd, setStayEnd] = useState(
    values?.shortStay?.end ?? defaults?.shortStayEnd ?? DEFAULT_SHORT_STAY.end
  );
  const [salePrice, setSalePrice] = useState(values ? String(values.salePrice) : "");
  // Reopens the way it was entered: a booking priced per night comes back with
  // the rate in the box, not the total someone would then have to divide.
  const [priceMode, setPriceMode] = useState<PriceMode>(
    values?.nightlyPrice != null ? "nightly" : "total"
  );
  const [nightlyPrice, setNightlyPrice] = useState(
    values?.nightlyPrice != null ? String(values.nightlyPrice) : ""
  );
  const [guestName, setGuestName] = useState(values?.guestName ?? "");
  const [guestsCount, setGuestsCount] = useState(values?.guestsCount != null ? String(values.guestsCount) : "");
  const [source, setSource] = useState(values?.source ?? initialSource ?? "hostello");
  // An edit reopens with everything visible — those fields already have values,
  // and hiding them behind a toggle reads as if the booking has none.
  const [showMore, setShowMore] = useState(Boolean(values));
  const [status, setStatus] = useState<"confirmed" | "tentative" | "cancelled">(
    values?.status ?? defaults?.status ?? "confirmed"
  );

  const selectedProperty = sortedProperties.find((p) => p.id === propertyId);
  const client = clients.find((c) => c.id === selectedProperty?.client_id);

  // Only units belonging to the same client can be added to one booking.
  const sameClientUnits = sortedProperties.filter(
    (p) => p.client_id === selectedProperty?.client_id && p.id !== propertyId
  );

  function toggleExtraUnit(id: string) {
    setExtraUnitIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  }

  const selectedIds = useMemo(() => [propertyId, ...extraUnitIds], [propertyId, extraUnitIds]);

  // A short stay is charged against the unit's own short-stay rate — flat for
  // the stay, where the nightly rate is per night.
  const stackRateTotal = useMemo(
    () =>
      sortedProperties
        .filter((p) => selectedIds.includes(p.id))
        .reduce(
          (sum, p) => sum + Number((shortStay ? p.short_stay_stack_rate : p.stack_rate) ?? 0),
          0
        ),
    [sortedProperties, selectedIds, shortStay]
  );

  /** Only the nights taken on the units in *this* booking. */
  const busy = useMemo(
    () => unavailable.filter((r) => selectedIds.includes(r.propertyId)),
    [unavailable, selectedIds]
  );

  // Changing the property or adding a unit can make an already-picked range
  // unavailable, so this is checked against the current selection rather than
  // only at pick time. It is the same overlap test the server runs.
  const rangeBlocked = useMemo(
    () => Boolean(checkIn && checkOut && busy.some((r) => r.start < checkOut && r.end >= checkIn)),
    [busy, checkIn, checkOut]
  );

  // Hours are a flat rate for the window, so per-night is not on offer for a
  // short stay — and a booking switched to one falls back to the total it had.
  const nightsForPricing = useMemo(
    () => (checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0),
    [checkIn, checkOut]
  );
  const perNight = priceMode === "nightly" && !shortStay;

  // The same multiplication the server does in `readBookingPrice`. Shown here
  // so the figure is never a surprise; the form still posts the rate, and the
  // server is what turns it into money.
  const grossPrice = perNight
    ? (Number(nightlyPrice) || 0) * nightsForPricing
    : Number(salePrice) || 0;

  const preview = useMemo(() => {
    if (!checkIn || !checkOut || !client) return null;
    if (perNight ? !nightlyPrice : !salePrice) return null;
    return calculatePayout({
      salePrice: grossPrice,
      checkIn,
      checkOut,
      dealModel: client.deal_model,
      sharePercent: client.share_percent,
      deductPercent: client.deduct_percent,
      otaModel: client.ota_model,
      otaSharePercent: client.ota_share_percent,
      stackRate: stackRateTotal,
      source,
      status,
    });
  }, [
    checkIn,
    checkOut,
    salePrice,
    nightlyPrice,
    perNight,
    grossPrice,
    client,
    stackRateTotal,
    source,
    status,
  ]);

  const stackBased = client
    ? usesStackRate({ dealModel: client.deal_model, otaModel: client.ota_model, source })
    : false;
  // Without a rate the stack maths hands Hostello the entire net, which is
  // never what "we also do short stays" means.
  const missingShortStayRate = shortStay && stackBased && stackRateTotal === 0;
  const badWindow = shortStay && stayEnd <= stayStart;

  const nights = nightsForPricing;
  const steps = {
    where: Boolean(selectedProperty),
    when: Boolean(checkIn && checkOut) && !rangeBlocked && !badWindow,
    who: Boolean(guestName.trim() || guestsCount),
    price: grossPrice > 0,
  };
  const doneCount = Object.values(steps).filter(Boolean).length;
  const sourceTint = sourceColor(source);

  return (
    <div className="@container relative isolate">
      {/* The same drifting purple and gold light as the Coming Soon screens. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-clip" aria-hidden>
        <span className="orb w-72 h-72 top-[4%] left-[6%] bg-hostello-purple-glow/20" />
        <span className="orb w-64 h-64 top-1/3 right-[8%] bg-hostello-gold/12" />
        <span className="orb w-56 h-56 bottom-[8%] left-1/3 bg-hostello-magenta/12" />
      </div>

      <form action={action} className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_320px] @3xl:items-start">
        {client && <input type="hidden" name="client_id" value={client.id} />}
        {fromBlockId && <input type="hidden" name="from_block" value={fromBlockId} />}
        <input type="hidden" name="property_ids" value={propertyId} />
        {extraUnitIds.map((id) => (
          <input key={id} type="hidden" name="property_ids" value={id} />
        ))}
        <input type="hidden" name="is_short_stay" value={shortStay ? "1" : ""} />
        {shortStay && (
          <>
            <input type="hidden" name="short_stay_start" value={stayStart} />
            <input type="hidden" name="short_stay_end" value={stayEnd} />
          </>
        )}
        {/* Always posted: left inside "More details" it went missing whenever
            that was closed, and the server fell back to confirmed. */}
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="source" value={source} />

        <div className="stagger flex flex-col gap-4 min-w-0">
          <Step n={1} icon={Building2} title="Where are they staying?" done={steps.where}>
            <select
              id="property"
              aria-label="Property"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setExtraUnitIds([]);
              }}
              className={fieldInput}
            >
              {clients.map((c) => {
                const opts = sortedProperties.filter((p) => p.client_id === c.id);
                if (opts.length === 0) return null;
                const clientName = opts[0].client_name;
                return (
                  <optgroup key={c.id} label={clientName}>
                    {opts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            {sameClientUnits.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className={fieldLabel}>Group with other units? (same guest, same stay)</p>
                <div className="flex flex-wrap gap-2">
                  {sameClientUnits.map((p) => {
                    const on = extraUnitIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-hostello-purple-glow ${
                          on
                            ? "border-hostello-gold bg-hostello-gold/15 text-ink-primary shadow-[0_6px_18px_-10px_rgba(245,201,104,0.9)]"
                            : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                        }`}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleExtraUnit(p.id)} className="sr-only" />
                        {on ? <Check size={12} strokeWidth={3} className="text-hostello-gold" /> : <Plus size={12} />}
                        {p.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </Step>

          <Step
            n={2}
            icon={CalendarDays}
            title={shortStay ? "Which day?" : "Which nights?"}
            done={steps.when}
            aside={
              <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={shortStay}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setShortStay(on);
                    // The picked range means something different on each side, so
                    // keep the day and re-derive rather than carrying nights over.
                    if (checkIn) setCheckOut(on ? shortStayCheckOut(checkIn) : "");
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="relative w-9 h-5 rounded-full bg-surface-3 border border-border-strong transition-colors peer-checked:bg-hostello-gold peer-checked:border-hostello-gold peer-focus-visible:ring-2 peer-focus-visible:ring-hostello-purple-glow after:absolute after:top-0.5 after:left-0.5 after:w-3.5 after:h-3.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
                />
                Short stay (hours, not a night)
              </label>
            }
          >
            <StayDates
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={(from, to) => {
                setCheckIn(from);
                setCheckOut(to);
              }}
              busy={busy}
              mode={shortStay ? "day" : "nights"}
            />

            {shortStay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="stay_start" className={fieldLabel}>
                    From
                  </label>
                  <input
                    id="stay_start"
                    type="time"
                    value={stayStart}
                    onChange={(e) => setStayStart(e.target.value)}
                    className={fieldInput}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="stay_end" className={fieldLabel}>
                    To
                  </label>
                  <input
                    id="stay_end"
                    type="time"
                    value={stayEnd}
                    onChange={(e) => setStayEnd(e.target.value)}
                    className={fieldInput}
                  />
                </div>
              </div>
            )}

            {/* A short stay already states its hours above; these are for a stay
                measured in nights, where the date says nothing about whether they
                land at 2pm or 2am. A new booking starts at the standard times from
                Settings; an edit shows what was saved, blank included. */}
            {!shortStay && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="expected_arrival" className={fieldLabel}>
                    Expected arrival (optional)
                  </label>
                  <input
                    id="expected_arrival"
                    name="expected_arrival"
                    type="time"
                    defaultValue={values ? (values.expectedArrival ?? "") : (defaults?.checkinTime ?? "")}
                    className={fieldInput}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="expected_departure" className={fieldLabel}>
                    Expected departure (optional)
                  </label>
                  <input
                    id="expected_departure"
                    name="expected_departure"
                    type="time"
                    defaultValue={values ? (values.expectedDeparture ?? "") : (defaults?.checkoutTime ?? "")}
                    className={fieldInput}
                  />
                </div>
              </div>
            )}
          </Step>

          <Step n={3} icon={Users} title="Who's coming?" done={steps.who}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="guest_name" className={fieldLabel}>
                  Guest name (optional)
                </label>
                <input
                  id="guest_name"
                  name="guest_name"
                  placeholder="Optional"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="guests_count" className={fieldLabel}>
                  Guests
                </label>
                <input
                  id="guests_count"
                  name="guests_count"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="How many are coming"
                  value={guestsCount}
                  onChange={(e) => setGuestsCount(e.target.value)}
                  className={fieldInput}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="guest_ids" className={fieldLabel}>
                Guest ID cards (optional)
              </label>
              <input
                id="guest_ids"
                name="guest_ids"
                type="file"
                multiple
                accept={GUEST_ID_ACCEPT}
                className={`${fieldInput} file:mr-3 file:rounded-full file:border-0 file:bg-hostello-purple-glow/20 file:px-3 file:py-1 file:text-xs file:text-hostello-purple-light`}
              />
              <p className="text-[11px] text-ink-muted">
                CNIC or passport scans — pick several at once. More can be attached later from the
                booking.
              </p>
            </div>
          </Step>

          <Step n={4} icon={Wallet} title="Price & channel" done={steps.price}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={perNight ? "nightly_price" : "sale_price"} className={fieldLabel}>
                  {perNight ? "Price per night (PKR)" : "Sale price (PKR, gross)"}
                </label>
                {/* Hours are one flat rate for the window, so the choice only makes
                    sense for a stay measured in nights.
                    Same vocabulary as "How you paid" in SendMoneyFlow: a border on
                    both states so it reads as a control at rest, gold and a lifted
                    fill on the chosen one. A borderless pair of muted words read as
                    a caption nobody knew was clickable. */}
                {!shortStay && !lockPrices && (
                  <div className="flex items-center gap-1" role="group" aria-label="How to enter the price">
                    {(["total", "nightly"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPriceMode(m)}
                        aria-pressed={priceMode === m}
                        className={`text-[11px] leading-none rounded-full border px-3 py-1.5 transition-colors ${
                          priceMode === m
                            ? "border-hostello-gold text-ink-primary bg-hostello-gold/10"
                            : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                        }`}
                      >
                        {m === "total" ? "Total" : "Per night"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Which box is filled in is what `price_mode` tells the server; it
                  multiplies the rate itself rather than trusting a total from here. */}
              <input type="hidden" name="price_mode" value={perNight ? "nightly" : "total"} />

              {perNight ? (
                <input
                  id="nightly_price"
                  name="nightly_price"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={nightlyPrice}
                  onChange={(e) => setNightlyPrice(e.target.value)}
                  readOnly={lockPrices}
                  className={`${fieldInput} text-base font-semibold`}
                />
              ) : (
                <input
                  id="sale_price"
                  name="sale_price"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  readOnly={lockPrices}
                  className={`${fieldInput} text-base font-semibold`}
                />
              )}

              {lockPrices && (
                <p className="text-[11px] text-ink-muted">
                  Prices are locked for operations accounts. Ask the admin to change them.
                </p>
              )}

              {perNight && (
                <p className="text-[11px] text-ink-muted">
                  {nightsForPricing > 0 && Number(nightlyPrice) > 0
                    ? `${formatNightly(Number(nightlyPrice), nightsForPricing, formatPKR)} = ${formatPKR(
                        grossPrice
                      )}`
                    : "Pick the dates and the total works itself out."}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className={fieldLabel}>Where the booking came from</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Source">
                {BOOKING_SOURCES.map((s) => {
                  const on = source === s.value;
                  const color = sourceColor(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSource(s.value)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${
                        on
                          ? "text-ink-primary font-semibold"
                          : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                      }`}
                      style={
                        on
                          ? {
                              borderColor: color,
                              backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                              boxShadow: `0 6px 18px -8px ${color}`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color, boxShadow: on ? `0 0 8px ${color}` : undefined }}
                      />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Step>

          <section className="card p-5 flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="flex items-center justify-between gap-3 text-left group"
            >
              <span className="flex items-center gap-3">
                <span className="shrink-0 w-9 h-9 rounded-2xl gradient-brand-subtle border border-hostello-purple-glow/25 flex items-center justify-center text-hostello-purple-light">
                  <NotebookPen size={16} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">More details</span>
                  <span className="text-[11px] text-ink-muted">Phone, advance, receipt, notes</span>
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`text-ink-muted group-hover:text-ink-primary transition-transform ${showMore ? "rotate-180" : ""}`}
              />
            </button>

            {showMore && (
              <div className="animate-fade flex flex-col gap-3 border-t border-border-hairline pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="guest_phone" className={fieldLabel}>
                      Guest phone
                    </label>
                    <input
                      id="guest_phone"
                      name="guest_phone"
                      placeholder="Optional"
                      defaultValue={values?.guestPhone ?? ""}
                      className={fieldInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="advance_received" className={fieldLabel}>
                      Advance received (PKR)
                    </label>
                    <input
                      id="advance_received"
                      name="advance_received"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={values?.advance ?? 0}
                      readOnly={lockPrices}
                      className={fieldInput}
                    />
                  </div>
                </div>

                {allowReceipt && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="receipt" className={fieldLabel}>
                        Token receipt (screenshot, optional)
                      </label>
                      <input
                        id="receipt"
                        name="receipt"
                        type="file"
                        accept={RECEIPT_ACCEPT}
                        className={`${fieldInput} file:mr-3 file:rounded-full file:border-0 file:bg-hostello-purple-glow/20 file:px-3 file:py-1 file:text-xs file:text-hostello-purple-light`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="receipt_kind" className={fieldLabel}>
                        Receipt is for
                      </label>
                      <select id="receipt_kind" name="receipt_kind" className={fieldInput}>
                        {RECEIPT_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="notes" className={fieldLabel}>
                    Notes
                  </label>
                  <input
                    id="notes"
                    name="notes"
                    placeholder="Anything worth remembering"
                    defaultValue={values?.notes ?? ""}
                    className={fieldInput}
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* The stay as it stands, filling in as the steps are answered. Only what
            has been entered — an unanswered line says so rather than guessing. */}
        <aside className="animate-in flex flex-col gap-3 @3xl:sticky @3xl:top-20">
          <div className="card-hero p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold opacity-90">
                <Sparkles size={13} aria-hidden />
                {values ? "This stay" : "New stay"}
              </span>
              <span className="text-[10px] rounded-full bg-white/15 px-2 py-0.5">{doneCount} of 4 set</span>
            </div>

            <div className="flex gap-1" aria-hidden>
              {Object.values(steps).map((on, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors duration-500 ${on ? "bg-white" : "bg-white/20"}`}
                />
              ))}
            </div>

            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight truncate">
                {selectedProperty?.name ?? "Pick a unit"}
                {extraUnitIds.length > 0 && (
                  <span className="text-sm font-semibold opacity-80"> + {extraUnitIds.length} more</span>
                )}
              </p>
              {selectedProperty && <p className="text-xs opacity-75 truncate">{selectedProperty.client_name}</p>}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-white/10 border border-white/15 p-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider opacity-70">{shortStay ? "Day" : "Check-in"}</p>
                <p className="text-sm font-semibold">{checkIn ? formatDayMonth(checkIn) : "—"}</p>
              </div>
              <div className="flex flex-col items-center px-2">
                <span
                  key={shortStay ? `h-${stayStart}-${stayEnd}` : `n-${nights}`}
                  className="animate-receipt-pop text-2xl font-extrabold leading-none num"
                >
                  {(shortStay ? shortStayHours(stayStart, stayEnd) : nights) || "·"}
                </span>
                <span className="text-[10px] opacity-70">{shortStay ? "hours" : nights === 1 ? "night" : "nights"}</span>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] uppercase tracking-wider opacity-70">{shortStay ? "Hours" : "Check-out"}</p>
                <p className="text-sm font-semibold">
                  {shortStay ? `${stayStart}–${stayEnd}` : checkOut ? formatDayMonth(checkOut) : "—"}
                </p>
              </div>
            </div>

            <dl className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="opacity-70">Guest</dt>
                <dd className={`truncate ${steps.who ? "font-semibold" : "opacity-60"}`}>
                  {guestName.trim() || (guestsCount ? "Unnamed" : "Not added")}
                  {Number(guestsCount) > 0 && ` · ${guestsCount} ${Number(guestsCount) === 1 ? "guest" : "guests"}`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="opacity-70">Channel</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2 h-2 rounded-full ring-2 ring-white/40" style={{ backgroundColor: sourceTint }} />
                  {sourceLabel(source)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-white/15">
                <dt className="opacity-70">Price</dt>
                <dd className={`num ${steps.price ? "text-xl font-extrabold" : "opacity-60"}`}>
                  {steps.price ? formatPKR(grossPrice) : "Not set"}
                </dd>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-1 rounded-full bg-black/20 p-1" role="radiogroup" aria-label="Status">
              {(["confirmed", "tentative"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => setStatus(s)}
                  className={`rounded-full py-1.5 text-xs font-semibold transition-all ${
                    status === s ? "bg-white text-hostello-purple shadow" : "text-white/75 hover:text-white"
                  }`}
                >
                  {s === "confirmed" ? "Confirmed" : "Tentative"}
                </button>
              ))}
            </div>
            {status === "tentative" && (
              <p className="-mt-2 text-[11px] opacity-75">Tentative earns nothing until it&rsquo;s confirmed.</p>
            )}
          </div>

          {preview && showPayoutPreview && (
            <div className="animate-fade card p-4 flex flex-col gap-2 text-sm border-hostello-gold/40">
              <p className="eyebrow text-hostello-gold-bright">The split</p>
              <p className="flex justify-between gap-3 text-ink-secondary">
                <span>
                  {shortStay
                    ? `Short stay · ${shortStayHours(stayStart, stayEnd)} hours`
                    : `${preview.nights} night${preview.nights === 1 ? "" : "s"}`}{" "}
                  · Net
                </span>
                <span className="text-ink-primary num">Rs {preview.netSale.toLocaleString("en-PK")}</span>
              </p>
              <p className="flex justify-between gap-3 text-ink-secondary">
                <span>Hostello earns</span>
                <span className="text-financial font-semibold num">
                  Rs {preview.hostelloShare.toLocaleString("en-PK")}
                </span>
              </p>
              <p className="flex justify-between gap-3 text-ink-secondary">
                <span>Client payout</span>
                <span className="text-ink-primary font-semibold num">
                  Rs {preview.clientPayout.toLocaleString("en-PK")}
                </span>
              </p>
              {isPassThroughSource(source) && (
                <p className="text-[11px] text-ink-muted">
                  {sourceLabel(source)} — Hostello earns nothing on this booking.
                </p>
              )}
              {client && isOtaSource(source) && (
                <p className="text-[11px] text-ink-muted">
                  {client.ota_model === "none"
                    ? "This client's Airbnb / Booking.com terms: Hostello earns nothing on these."
                    : client.ota_model === "percent"
                      ? `This client's Airbnb / Booking.com terms: ${client.ota_share_percent}% of the net.`
                      : "This client's Airbnb / Booking.com terms: whatever clears the stack rate."}
                </p>
              )}
            </div>
          )}

          {rangeBlocked && (
            <p className={errorBanner}>
              Those nights are already taken on one of the selected units. Pick other dates, or drop the
              unit that clashes.
            </p>
          )}

          {badWindow && <p className={errorBanner}>The short stay has to end after it starts.</p>}

          {missingShortStayRate && (
            <p className={errorBanner}>
              No short-stay rate is set on{" "}
              {sortedProperties
                .filter((p) => selectedIds.includes(p.id))
                .map((p) => p.name)
                .join(", ")}
              . Set one on the property first, or this stay hands Hostello the whole net.
            </p>
          )}

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`w-full ${primaryButton}`}
            disabled={!checkIn || !checkOut || rangeBlocked || badWindow || missingShortStayRate}
            blocking
            busy="Saving the booking…"
            pendingLabel="Saving…"
            note="Any receipt or ID card you picked is uploading with it."
          >
            {submitLabel}
          </SubmitButton>
        </aside>
      </form>
    </div>
  );
}

/** One numbered question on the form. Its badge turns gold once it's answered. */
function Step({
  n,
  icon: Icon,
  title,
  done,
  aside,
  children,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  done: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={`shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              done
                ? "gradient-gold text-surface-0 shadow-[0_8px_22px_-8px_rgba(245,201,104,0.9)]"
                : "gradient-brand-subtle border border-hostello-purple-glow/25 text-hostello-gold-bright"
            }`}
          >
            {done ? (
              <Check key="done" size={17} strokeWidth={3} className="animate-receipt-pop" aria-label="Done" />
            ) : (
              <Icon size={16} aria-hidden />
            )}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Step {n}</span>
            <h2 className="text-sm">{title}</h2>
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
