"use client";

import { useMemo, useState } from "react";
import {
  calculatePayout,
  isOtaSource,
  isPassThroughSource,
  usesStackRate,
  type DealModel,
  type OtaModel,
} from "@/lib/payout";
import { BOOKING_SOURCES, sourceLabel } from "@/lib/block-sources";
import { RECEIPT_ACCEPT, RECEIPT_KINDS } from "@/lib/receipts";
import { GUEST_ID_ACCEPT } from "@/lib/guest-ids";
import { StayDates } from "@/components/shared/StayDates";
import type { UnavailableRange } from "@/lib/availability";
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
  salePrice: number;
  advance: number;
  source: string;
  status: "confirmed" | "tentative";
  notes: string | null;
  extraUnitIds: string[];
  /** Set only when the booking is hours rather than nights. */
  shortStay: { start: string; end: string } | null;
};

export function BookingForm({
  action,
  properties,
  clients,
  initialPropertyId,
  initialDate,
  initialCheckOut,
  values,
  unavailable = [],
  submitLabel = "Save booking",
  allowReceipt = true,
  showPayoutPreview = true,
  error,
}: {
  action: (formData: FormData) => void;
  properties: PropertyOption[];
  clients: ClientTerms[];
  initialPropertyId?: string;
  initialDate?: string;
  initialCheckOut?: string;
  /** Present only when an existing booking is being edited. */
  values?: BookingFormValues;
  /** Occupied nights across every selectable unit — the picker greys them out. */
  unavailable?: UnavailableRange[];
  submitLabel?: string;
  /** Token receipts are Hostello's to upload — off in the client portal. */
  allowReceipt?: boolean;
  /** The live split. Off for ops, who fill the same form without seeing it. */
  showPayoutPreview?: boolean;
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
  const [stayStart, setStayStart] = useState(values?.shortStay?.start ?? DEFAULT_SHORT_STAY.start);
  const [stayEnd, setStayEnd] = useState(values?.shortStay?.end ?? DEFAULT_SHORT_STAY.end);
  const [salePrice, setSalePrice] = useState(values ? String(values.salePrice) : "");
  const [source, setSource] = useState(values?.source ?? "hostello");
  // An edit reopens with everything visible — those fields already have values,
  // and hiding them behind a toggle reads as if the booking has none.
  const [showMore, setShowMore] = useState(Boolean(values));
  const [status, setStatus] = useState<"confirmed" | "tentative" | "cancelled">(
    values?.status ?? "confirmed"
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

  const preview = useMemo(() => {
    if (!checkIn || !checkOut || !salePrice || !client) return null;
    return calculatePayout({
      salePrice: Number(salePrice) || 0,
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
  }, [checkIn, checkOut, salePrice, client, stackRateTotal, source, status]);

  const stackBased = client
    ? usesStackRate({ dealModel: client.deal_model, otaModel: client.ota_model, source })
    : false;
  // Without a rate the stack maths hands Hostello the entire net, which is
  // never what "we also do short stays" means.
  const missingShortStayRate = shortStay && stackBased && stackRateTotal === 0;
  const badWindow = shortStay && stayEnd <= stayStart;

  return (
    <form action={action} className="card p-6 flex flex-col gap-4">
      {client && <input type="hidden" name="client_id" value={client.id} />}
      <input type="hidden" name="property_ids" value={propertyId} />
      {extraUnitIds.map((id) => (
        <input key={id} type="hidden" name="property_ids" value={id} />
      ))}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="property" className={fieldLabel}>
          Property
        </label>
        <select
          id="property"
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
      </div>

      {sameClientUnits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className={fieldLabel}>Group with other units? (same guest, same stay)</label>
          <div className="flex flex-wrap gap-2">
            {sameClientUnits.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border cursor-pointer transition-colors ${
                  extraUnitIds.includes(p.id)
                    ? "border-hostello-gold bg-hostello-gold/10 text-ink-primary"
                    : "border-border-hairline text-ink-secondary hover:border-border-strong"
                }`}
              >
                <input
                  type="checkbox"
                  checked={extraUnitIds.includes(p.id)}
                  onChange={() => toggleExtraUnit(p.id)}
                  className="accent-[var(--color-hostello-gold)]"
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <input type="hidden" name="is_short_stay" value={shortStay ? "1" : ""} />
      {shortStay && (
        <>
          <input type="hidden" name="short_stay_start" value={stayStart} />
          <input type="hidden" name="short_stay_end" value={stayEnd} />
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className={fieldLabel}>{shortStay ? "Day" : "Dates"}</label>
          <label className="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
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
              className="accent-[var(--color-hostello-gold)]"
            />
            Short stay (hours, not a night)
          </label>
        </div>
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
      </div>

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sale_price" className={fieldLabel}>
            Sale price (PKR, gross)
          </label>
          <input
            id="sale_price"
            name="sale_price"
            type="number"
            min="0"
            step="1"
            required
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            className={fieldInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="source" className={fieldLabel}>
            Source
          </label>
          <select id="source" name="source" value={source} onChange={(e) => setSource(e.target.value)} className={fieldInput}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="guest_name" className={fieldLabel}>
          Guest name (optional)
        </label>
        <input
          id="guest_name"
          name="guest_name"
          placeholder="Optional"
          defaultValue={values?.guestName ?? ""}
          className={fieldInput}
        />
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
          className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink-secondary`}
        />
        <p className="text-[11px] text-ink-muted">
          CNIC or passport scans — pick several at once. More can be attached later from the
          booking.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-xs text-ink-muted hover:text-ink-primary text-left transition-colors"
      >
        {showMore ? "− Fewer details" : "+ More details (phone, advance, status, notes)"}
      </button>

      {showMore && (
        <div className="flex flex-col gap-3 border-t border-border-hairline pt-3">
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
                className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink-secondary`}
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
            <label htmlFor="status" className={fieldLabel}>
              Status
            </label>
            <select
              id="status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className={fieldInput}
            >
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative (earns nothing yet)</option>
            </select>
          </div>

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

      {preview && showPayoutPreview && (
        <div className="rounded-md border border-hostello-gold/40 bg-hostello-gold/5 p-4 flex flex-col gap-1.5 text-sm">
          <p className="text-ink-secondary">
            {shortStay
              ? `Short stay · ${shortStayHours(stayStart, stayEnd)} hours`
              : `${preview.nights} night${preview.nights === 1 ? "" : "s"}`}{" "}
            · Net after deduction:{" "}
            <span className="text-ink-primary">Rs {preview.netSale.toLocaleString("en-PK")}</span>
          </p>
          <p className="text-ink-secondary">
            Hostello earns:{" "}
            <span className="text-financial font-medium">Rs {preview.hostelloShare.toLocaleString("en-PK")}</span>
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
          <p className="text-ink-secondary">
            Client payout:{" "}
            <span className="text-ink-primary font-medium">Rs {preview.clientPayout.toLocaleString("en-PK")}</span>
          </p>
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
        className={`mt-2 ${primaryButton}`}
        disabled={!checkIn || !checkOut || rangeBlocked || badWindow || missingShortStayRate}
        blocking
        busy="Saving the booking…"
        pendingLabel="Saving…"
        note="Any receipt or ID card you picked is uploading with it."
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
