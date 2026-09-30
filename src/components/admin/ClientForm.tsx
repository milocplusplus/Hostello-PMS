"use client";

import { useState } from "react";
import { Globe, Handshake, KeyRound, UserRound } from "lucide-react";
import { DEAL_MODELS, OTA_MODELS, formatPKR, type DealModel, type OtaModel } from "@/lib/payout";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  errorBanner,
} from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ChoiceChips, FormStep, StepForm, SummaryCard } from "@/components/shared/FormStep";

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
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [email, setEmail] = useState(defaultValues?.contact_email ?? "");
  const [phone, setPhone] = useState(defaultValues?.contact_phone ?? "");
  const [model, setModel] = useState<DealModel>(defaultValues?.deal_model ?? "percent");
  const [otaModel, setOtaModel] = useState<OtaModel>(defaultValues?.ota_model ?? "percent");
  const [fee, setFee] = useState(String(defaultValues?.monthly_fee ?? 0));
  const [share, setShare] = useState(String(defaultValues?.share_percent ?? 20));
  const [otaShare, setOtaShare] = useState(String(defaultValues?.ota_share_percent ?? 20));
  const [deduct, setDeduct] = useState(String(defaultValues?.deduct_percent ?? 0));
  const [loginEmail, setLoginEmail] = useState("");

  const showMonthlyFee = model === "fixed" || model === "fixed_stack" || model === "fixed_percent";
  const showSharePercent = model === "percent" || model === "fixed_percent";
  const showStackNote = model === "ads" || model === "fixed_stack";

  // The deal in one line, from exactly what is in the boxes.
  const dealLine = [
    showMonthlyFee && `${formatPKR(Number(fee) || 0)}/month`,
    showSharePercent && `${Number(share) || 0}% per booking`,
    showStackNote && "stack rate",
  ]
    .filter(Boolean)
    .join(" + ");
  const otaLine =
    otaModel === "percent" ? `${Number(otaShare) || 0}%` : otaModel === "stack" ? "Stack rate" : "Nothing";

  const done = [Boolean(name.trim()), true, true, ...(clientId ? [] : [Boolean(loginEmail.trim())])];

  return (
    <StepForm
      action={action}
      aside={
        <>
          <SummaryCard
            icon={UserRound}
            label={clientId ? "This client" : "New client"}
            done={done}
            title={name.trim() || "Name the owner"}
            sub={[email, phone].filter((v) => v.trim()).join(" · ") || undefined}
            rows={[
              { label: "Deal", value: DEAL_MODELS.find((m) => m.value === model)?.label },
              { label: "Terms", value: dealLine },
              { label: "Airbnb / Booking.com", value: otaLine },
              { label: "Deduction", value: `${Number(deduct) || 0}%`, set: Number(deduct) > 0 },
              ...(clientId
                ? []
                : [
                    {
                      label: "Portal login",
                      value: loginEmail.trim() || "Add later",
                      set: Boolean(loginEmail.trim()),
                    },
                  ]),
            ]}
          />

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`w-full ${primaryButton}`}
            blocking
            busy="Saving the client…"
            pendingLabel="Saving…"
          >
            {submitLabel}
          </SubmitButton>
        </>
      }
    >
      {clientId && <input type="hidden" name="id" value={clientId} />}
      {!showMonthlyFee && <input type="hidden" name="monthly_fee" value={0} />}
      {!showSharePercent && <input type="hidden" name="share_percent" value={0} />}
      {otaModel !== "percent" && <input type="hidden" name="ota_share_percent" value={0} />}

      <FormStep n={1} icon={UserRound} title="Who's the owner?" done={done[0]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={fieldLabel}>
            Client / owner name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="e.g. Murree Spring Apartments"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact_email" className={fieldLabel}>
              Contact email
            </label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              placeholder="owner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldInput}
            />
          </div>
        </div>
      </FormStep>

      <FormStep n={2} icon={Handshake} title="Deal terms" done={done[1]}>
        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>Deal model</p>
          <ChoiceChips name="deal_model" label="Deal model" value={model} onChange={setModel} options={DEAL_MODELS} />
        </div>

        {(showMonthlyFee || showSharePercent) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
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
                  value={share}
                  onChange={(e) => setShare(e.target.value)}
                  className={fieldInput}
                />
              </div>
            )}
          </div>
        )}

        {showStackNote && (
          <p className="text-xs text-ink-muted">
            Each property under this client has its own stack rate — per night,
            plus a flat one for short stays. Set both on the property itself.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
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
            value={deduct}
            onChange={(e) => setDeduct(e.target.value)}
            className={fieldInput}
          />
          <p className="text-xs text-ink-muted">
            Platform fees or similar. Applied first — everything else is
            calculated on what&apos;s left.
          </p>
        </div>
      </FormStep>

      <FormStep n={3} icon={Globe} title="Airbnb & Booking.com bookings" done={done[2]}>
        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>On these, Hostello earns</p>
          <ChoiceChips
            name="ota_model"
            label="On Airbnb / Booking.com bookings, Hostello earns"
            value={otaModel}
            onChange={setOtaModel}
            options={OTA_MODELS}
          />
          <p className="text-xs text-ink-muted">
            Bookings from those two channels use this instead of the deal model.
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
              value={otaShare}
              onChange={(e) => setOtaShare(e.target.value)}
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
      </FormStep>

      {!clientId && (
        <FormStep n={4} icon={KeyRound} title="Portal login (optional)" done={done[3]}>
          <p className="text-xs text-ink-muted -mt-1">
            Give this client access to their own dashboard now, or skip and add it later from
            their page.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login_email" className={fieldLabel}>
                Login email
              </label>
              <input
                id="login_email"
                name="login_email"
                type="email"
                placeholder="owner@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
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
        </FormStep>
      )}
    </StepForm>
  );
}
