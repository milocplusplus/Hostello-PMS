"use client";

import { useState } from "react";
import { Handshake, Home, MapPin, Tag } from "lucide-react";
import { PROVINCES, CITIES_BY_PROVINCE } from "@/lib/pakistan-locations";
import { PROPERTY_TYPES } from "@/lib/property-types";
import { formatPKR } from "@/lib/payout";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  errorBanner,
} from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";
import { ChoiceChips, FormStep, StepForm, SummaryCard } from "@/components/shared/FormStep";

type PropertyFormProps = {
  action: (formData: FormData) => void;
  clientId: string;
  propertyId?: string;
  defaultValues?: {
    name: string;
    location: string;
    province?: string | null;
    city?: string | null;
    type: string;
    status: string;
    stack_rate?: number | null;
    short_stay_stack_rate?: number | null;
    max_guests?: number | null;
    nightly_rate?: number | null;
    short_stay_rate?: number | null;
  };
  error?: string;
  submitLabel: string;
};

const STATUSES = [
  { value: "active", label: "Active", color: "var(--color-status-available)" },
  { value: "inactive", label: "Inactive", color: "var(--color-status-blocked)" },
] as const;

/** A figure typed into a box, or null while the box is blank. */
function figure(v: string) {
  return v.trim() === "" ? null : Number(v);
}

export function PropertyForm({
  action,
  clientId,
  propertyId,
  defaultValues,
  error,
  submitLabel,
}: PropertyFormProps) {
  const [province, setProvince] = useState(
    defaultValues?.province && PROVINCES.includes(defaultValues.province as (typeof PROVINCES)[number])
      ? defaultValues.province
      : "Punjab"
  );
  const cities = CITIES_BY_PROVINCE[province] ?? [];
  const [city, setCity] = useState(
    defaultValues?.city && cities.includes(defaultValues.city) ? defaultValues.city : cities[0] ?? ""
  );
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [location, setLocation] = useState(defaultValues?.location ?? "");
  const [type, setType] = useState<string>(defaultValues?.type ?? "studio");
  const [status, setStatus] = useState<string>(defaultValues?.status === "inactive" ? "inactive" : "active");
  const [sleeps, setSleeps] = useState(String(defaultValues?.max_guests ?? ""));
  const [nightly, setNightly] = useState(String(defaultValues?.nightly_rate ?? ""));
  const [shortRate, setShortRate] = useState(String(defaultValues?.short_stay_rate ?? ""));
  const [stack, setStack] = useState(String(defaultValues?.stack_rate ?? 0));
  const [shortStack, setShortStack] = useState(String(defaultValues?.short_stay_stack_rate ?? 0));

  const done = [
    Boolean(name.trim()),
    Boolean(location.trim() && city),
    figure(sleeps) != null && figure(nightly) != null,
    true,
  ];

  return (
    <StepForm
      action={action}
      aside={
        <>
          <SummaryCard
            icon={Home}
            label={propertyId ? "This unit" : "New unit"}
            done={done}
            title={name.trim() || "Name the unit"}
            sub={[city, province].filter(Boolean).join(", ")}
            rows={[
              { label: "Type", value: PROPERTY_TYPES.find((t) => t.value === type)?.label },
              { label: "Status", value: status === "active" ? "Active" : "Inactive" },
              {
                label: "Sleeps",
                value: figure(sleeps) != null ? `${figure(sleeps)} guests` : "Not set",
                set: figure(sleeps) != null,
              },
              {
                label: "Short stay",
                value: figure(shortRate) != null ? formatPKR(figure(shortRate)) : "Not set",
                set: figure(shortRate) != null,
              },
              {
                label: "Stack / night",
                value: formatPKR(Number(stack) || 0),
                set: Number(stack) > 0,
              },
              {
                label: "Asking / night",
                value: figure(nightly) != null ? formatPKR(figure(nightly)) : "Not set",
                set: figure(nightly) != null,
                big: true,
              },
            ]}
          />

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`w-full ${primaryButton}`}
            blocking
            busy="Saving the property…"
            pendingLabel="Saving…"
          >
            {submitLabel}
          </SubmitButton>
        </>
      }
    >
      <input type="hidden" name="client_id" value={clientId} />
      {propertyId && <input type="hidden" name="id" value={propertyId} />}

      <FormStep n={1} icon={Home} title="The unit" done={done[0]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={fieldLabel}>
            Property name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="e.g. Blue Area Studio 4B"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>Property type</p>
          <ChoiceChips name="type" label="Property type" value={type} onChange={setType} options={PROPERTY_TYPES} />
        </div>

        <div className="flex flex-col gap-2">
          <p className={fieldLabel}>Status</p>
          <ChoiceChips name="status" label="Status" value={status} onChange={setStatus} options={STATUSES} />
        </div>
      </FormStep>

      <FormStep n={2} icon={MapPin} title="Where is it?" done={done[1]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="location" className={fieldLabel}>
            Address / street
          </label>
          <input
            id="location"
            name="location"
            required
            placeholder="e.g. F-7 Markaz, near..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="province" className={fieldLabel}>
              Province
            </label>
            <select
              id="province"
              name="province"
              value={province}
              onChange={(e) => {
                const nextProvince = e.target.value;
                setProvince(nextProvince);
                setCity(CITIES_BY_PROVINCE[nextProvince]?.[0] ?? "");
              }}
              className={fieldInput}
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="city" className={fieldLabel}>
              City
            </label>
            <select
              id="city"
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={fieldInput}
            >
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormStep>

      {/* What a guest is told, and what the availability finder searches on.
          Kept apart from the stack rates below, which are deal terms and are
          hidden from ops — confusing the two is the easy mistake here. */}
      <FormStep n={3} icon={Tag} title="What we quote" done={done[2]}>
        <p className="text-xs text-ink-muted -mt-1">
          Used by the availability finder. Leave blank if you don&apos;t know yet — the unit
          still shows up, flagged as missing the figure.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="max_guests" className={fieldLabel}>
              Sleeps (guests)
            </label>
            <input
              id="max_guests"
              name="max_guests"
              type="number"
              min="1"
              placeholder="—"
              value={sleeps}
              onChange={(e) => setSleeps(e.target.value)}
              className={fieldInput}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nightly_rate" className={fieldLabel}>
              Asking rate / night (PKR)
            </label>
            <input
              id="nightly_rate"
              name="nightly_rate"
              type="number"
              min="0"
              step="500"
              placeholder="—"
              value={nightly}
              onChange={(e) => setNightly(e.target.value)}
              className={fieldInput}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="short_stay_rate" className={fieldLabel}>
              Short stay (PKR, flat)
            </label>
            <input
              id="short_stay_rate"
              name="short_stay_rate"
              type="number"
              min="0"
              step="500"
              placeholder="—"
              value={shortRate}
              onChange={(e) => setShortRate(e.target.value)}
              className={fieldInput}
            />
          </div>
        </div>
      </FormStep>

      <FormStep n={4} icon={Handshake} title="Deal terms" done={done[3]}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="stack_rate" className={fieldLabel}>
            Stack rate per night (PKR) — only used for stack-rate deal models
          </label>
          <input
            id="stack_rate"
            name="stack_rate"
            type="number"
            min="0"
            step="500"
            value={stack}
            onChange={(e) => setStack(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="short_stay_stack_rate" className={fieldLabel}>
            Short-stay stack rate (PKR, flat per stay) — leave 0 if this unit takes no short stays
          </label>
          <input
            id="short_stay_stack_rate"
            name="short_stay_stack_rate"
            type="number"
            min="0"
            step="500"
            value={shortStack}
            onChange={(e) => setShortStack(e.target.value)}
            className={fieldInput}
          />
        </div>
      </FormStep>
    </StepForm>
  );
}
