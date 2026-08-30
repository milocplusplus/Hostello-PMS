"use client";

import { useState } from "react";
import { DEAL_MODELS, OTA_MODELS, type DealModel, type OtaModel } from "@/lib/payout";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  primaryButtonStyle,
  errorBanner,
} from "@/lib/form-styles";

type ClientFormProps = {
  action: (formData: FormData) => void;
  clientId?: string;
  defaultValues?: {
    name: string;
    contact_email?: string | null;
    contact_phone?: string | null;
    deal_model?: DealModel;
    monthly_fee?: number | null;
    share_percent?: number | null;
    deduct_percent?: number | null;
    ota_model?: OtaModel;
    ota_share_percent?: number | null;
  };
  error?: string;
  submitLabel: string;
};

export function ClientForm({ action, clientId, defaultValues, error, submitLabel }: ClientFormProps) {
  const [model, setModel] = useState<DealModel>(defaultValues?.deal_model ?? "percent");
  const [otaModel, setOtaModel] = useState<OtaModel>(defaultValues?.ota_model ?? "percent");

  const showMonthlyFee = model === "fixed" || model === "fixed_stack" || model === "fixed_percent";
  const showSharePercent = model === "percent" || model === "fixed_percent";
  const showStackNote = model === "ads" || model === "fixed_stack";

  return (
    <form action={action} className="card p-6 flex flex-col gap-4">
      {clientId && <input type="hidden" name="id" value={clientId} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={fieldLabel}>
          Client / owner name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Murree Spring Apartments"
          defaultValue={defaultValues?.name}
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact_email" className={fieldLabel}>
          Contact email
        </label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          placeholder="owner@example.com"
          defaultValue={defaultValues?.contact_email ?? ""}
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact_phone" className={fieldLabel}>
          Contact phone
        </label>
        <input
          id="contact_phone"
          name="contact_phone"
          type="tel"
          placeholder="+92 3xx xxxxxxx"
          defaultValue={defaultValues?.contact_phone ?? ""}
          className={fieldInput}
        />
      </div>

      <div className="border-t border-border-hairline pt-4 flex flex-col gap-4">
        <p className="text-xs text-ink-secondary font-medium">Deal terms</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="deal_model" className={fieldLabel}>
            Deal model
          </label>
          <select
            id="deal_model"
            name="deal_model"
            value={model}
            onChange={(e) => setModel(e.target.value as DealModel)}
            className={fieldInput}
          >
            {DEAL_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {showMonthlyFee && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="monthly_fee" className={fieldLabel}>
              Monthly retainer (PKR)
            </label>
            <input
              id="monthly_fee"
              name="monthly_fee"
              type="number"
              min="0"
              step="500"
              defaultValue={defaultValues?.monthly_fee ?? 0}
              className={fieldInput}
            />
          </div>
        )}

        {showSharePercent && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="share_percent" className={fieldLabel}>
              Hostello&apos;s share of each booking (%)
            </label>
            <input
              id="share_percent"
              name="share_percent"
              type="number"
              min="0"
              max="100"
              step="0.5"
              defaultValue={defaultValues?.share_percent ?? 20}
              className={fieldInput}
            />
          </div>
        )}

        {showStackNote && (
          <p className="text-xs text-ink-muted">
            Each property under this client has its own stack rate — per night,
            plus a flat one for short stays. Set both on the property itself.
          </p>
        )}

        <div className="border-t border-border-hairline pt-4 flex flex-col gap-1.5">
          <label htmlFor="ota_model" className={fieldLabel}>
            On Airbnb / Booking.com bookings, Hostello earns
          </label>
          <select
            id="ota_model"
            name="ota_model"
            value={otaModel}
            onChange={(e) => setOtaModel(e.target.value as OtaModel)}
            className={fieldInput}
          >
            {OTA_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-muted">
            Bookings from those two channels use this instead of the deal model above.
            Everything else — Hostello, offline, reference — still follows the deal model.
          </p>
        </div>

        {otaModel === "percent" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ota_share_percent" className={fieldLabel}>
              Hostello&apos;s share of each Airbnb / Booking.com booking (%)
            </label>
            <input
              id="ota_share_percent"
              name="ota_share_percent"
              type="number"
              min="0"
              max="100"
              step="0.5"
              defaultValue={defaultValues?.ota_share_percent ?? 20}
              className={fieldInput}
            />
          </div>
        )}

        {otaModel === "stack" && (
          <p className="text-xs text-ink-muted">
            Hostello keeps whatever the booking makes above the property&apos;s stack rate ×
            nights — set that rate on the property itself.
          </p>
        )}

        <div className="border-t border-border-hairline pt-4 flex flex-col gap-1.5">
          <label htmlFor="deduct_percent" className={fieldLabel}>
            Deduction taken off gross before any split (%)
          </label>
          <input
            id="deduct_percent"
            name="deduct_percent"
            type="number"
            min="0"
            max="100"
            step="0.5"
            defaultValue={defaultValues?.deduct_percent ?? 0}
            className={fieldInput}
          />
          <p className="text-xs text-ink-muted">
            Platform fees or similar. Applied first — everything else is
            calculated on what&apos;s left.
          </p>
        </div>
      </div>

      {!showMonthlyFee && <input type="hidden" name="monthly_fee" value={0} />}
      {!showSharePercent && <input type="hidden" name="share_percent" value={0} />}
      {otaModel !== "percent" && <input type="hidden" name="ota_share_percent" value={0} />}

      {!clientId && (
        <div className="border-t border-border-hairline pt-4 flex flex-col gap-4">
          <div>
            <p className="text-xs text-ink-secondary font-medium">Portal login (optional)</p>
            <p className="text-xs text-ink-muted mt-1">
              Give this client access to their own dashboard now, or skip and add it later from
              their page.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login_email" className={fieldLabel}>
              Login email
            </label>
            <input
              id="login_email"
              name="login_email"
              type="email"
              placeholder="owner@example.com"
              className={fieldInput}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login_password" className={fieldLabel}>
              Temporary password
            </label>
            <input
              id="login_password"
              name="login_password"
              type="text"
              placeholder="At least 8 characters"
              className={fieldInput}
            />
          </div>
        </div>
      )}

      {error && <p className={errorBanner}>{error}</p>}

      <button type="submit" className={`mt-2 ${primaryButton}`} style={primaryButtonStyle}>
        {submitLabel}
      </button>
    </form>
  );
}
