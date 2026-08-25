"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { calculatePayout, isOtaSource, type DealModel, type OtaModel } from "@/lib/payout";
import { BOOKING_SOURCES } from "@/lib/block-sources";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  primaryButtonStyle,
  errorBanner,
} from "@/lib/form-styles";

type PropertyOption = {
  id: string;
  name: string;
  stack_rate: number;
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

export function BookingForm({
  action,
  properties,
  clients,
  initialPropertyId,
  initialDate,
  initialCheckOut,
  error,
}: {
  action: (formData: FormData) => void;
  properties: PropertyOption[];
  clients: ClientTerms[];
  initialPropertyId?: string;
  initialDate?: string;
  initialCheckOut?: string;
  error?: string;
}) {
  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.client_name.localeCompare(b.client_name) || a.name.localeCompare(b.name)),
    [properties]
  );

  const [propertyId, setPropertyId] = useState(initialPropertyId ?? sortedProperties[0]?.id ?? "");
  const [extraUnitIds, setExtraUnitIds] = useState<string[]>([]);
  const [checkIn, setCheckIn] = useState(initialDate ?? "");
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? "");
  const [salePrice, setSalePrice] = useState("");
  const [source, setSource] = useState("hostello");
  const [showMore, setShowMore] = useState(false);
  const [status, setStatus] = useState<"confirmed" | "tentative" | "cancelled">("confirmed");

  const selectedProperty = sortedProperties.find((p) => p.id === propertyId);
  const client = clients.find((c) => c.id === selectedProperty?.client_id);

  // Only units belonging to the same client can be added to one booking.
  const sameClientUnits = sortedProperties.filter(
    (p) => p.client_id === selectedProperty?.client_id && p.id !== propertyId
  );

  function toggleExtraUnit(id: string) {
    setExtraUnitIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  }

  const stackRateTotal = useMemo(() => {
    const ids = [propertyId, ...extraUnitIds];
    return sortedProperties.filter((p) => ids.includes(p.id)).reduce((sum, p) => sum + Number(p.stack_rate ?? 0), 0);
  }, [sortedProperties, propertyId, extraUnitIds]);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="check_in" className={fieldLabel}>
            Check-in
          </label>
          <input
            id="check_in"
            name="check_in"
            type="date"
            required
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className={fieldInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="check_out" className={fieldLabel}>
            Check-out
          </label>
          <input
            id="check_out"
            name="check_out"
            type="date"
            required
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className={fieldInput}
          />
        </div>
      </div>

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
        <input id="guest_name" name="guest_name" placeholder="Optional" className={fieldInput} />
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
              <input id="guest_phone" name="guest_phone" placeholder="Optional" className={fieldInput} />
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
                defaultValue={0}
                className={fieldInput}
              />
            </div>
          </div>

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
            <input id="notes" name="notes" placeholder="Anything worth remembering" className={fieldInput} />
          </div>
        </div>
      )}

      {preview && (
        <div className="rounded-md border border-hostello-gold/40 bg-hostello-gold/5 p-4 flex flex-col gap-1.5 text-sm">
          <p className="text-ink-secondary">
            {preview.nights} night{preview.nights === 1 ? "" : "s"} · Net after deduction:{" "}
            <span className="text-ink-primary">Rs {preview.netSale.toLocaleString("en-PK")}</span>
          </p>
          <p className="text-ink-secondary">
            Hostello earns:{" "}
            <span className="text-financial font-medium">Rs {preview.hostelloShare.toLocaleString("en-PK")}</span>
          </p>
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

      {error && <p className={errorBanner}>{error}</p>}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`mt-2 ${primaryButton} disabled:opacity-60`}
      style={primaryButtonStyle}
    >
      {pending ? "Saving…" : "Save booking"}
    </button>
  );
}
