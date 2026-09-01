"use client";

import { useState } from "react";
import { PROVINCES, CITIES_BY_PROVINCE } from "@/lib/pakistan-locations";
import { PROPERTY_TYPES } from "@/lib/property-types";
import {
  fieldLabel,
  fieldInput,
  primaryButton,
  primaryButtonStyle,
  errorBanner,
} from "@/lib/form-styles";

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

  return (
    <form action={action} className="card p-6 flex flex-col gap-4">
      <input type="hidden" name="client_id" value={clientId} />
      {propertyId && <input type="hidden" name="id" value={propertyId} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={fieldLabel}>
          Property name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Blue Area Studio 4B"
          defaultValue={defaultValues?.name}
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="location" className={fieldLabel}>
          Address / street
        </label>
        <input
          id="location"
          name="location"
          required
          placeholder="e.g. F-7 Markaz, near..."
          defaultValue={defaultValues?.location}
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="type" className={fieldLabel}>
          Property type
        </label>
        <select id="type" name="type" defaultValue={defaultValues?.type ?? "studio"} className={fieldInput}>
          {PROPERTY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className={fieldLabel}>
          Status
        </label>
        <select id="status" name="status" defaultValue={defaultValues?.status ?? "active"} className={fieldInput}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* What a guest is told, and what the availability finder searches on.
          Kept apart from the stack rates below, which are deal terms and are
          hidden from ops — confusing the two is the easy mistake here. */}
      <div className="border-t border-border-hairline pt-4 mt-1">
        <p className="eyebrow">WHAT WE QUOTE</p>
        <p className="text-xs text-ink-muted mt-1">
          Used by the availability finder. Leave blank if you don&apos;t know yet — the unit
          still shows up, flagged as missing the figure.
        </p>
      </div>

      <div className="flex flex-col gap-4">
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
            defaultValue={defaultValues?.max_guests ?? ""}
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
            defaultValue={defaultValues?.nightly_rate ?? ""}
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
            defaultValue={defaultValues?.short_stay_rate ?? ""}
            className={fieldInput}
          />
        </div>
      </div>

      <div className="border-t border-border-hairline pt-4 mt-1">
        <p className="eyebrow">DEAL TERMS</p>
      </div>

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
          defaultValue={defaultValues?.stack_rate ?? 0}
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
          defaultValue={defaultValues?.short_stay_stack_rate ?? 0}
          className={fieldInput}
        />
      </div>

      {error && <p className={errorBanner}>{error}</p>}

      <button type="submit" className={`mt-2 ${primaryButton}`} style={primaryButtonStyle}>
        {submitLabel}
      </button>
    </form>
  );
}
