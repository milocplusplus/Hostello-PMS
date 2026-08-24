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

      {error && <p className={errorBanner}>{error}</p>}

      <button type="submit" className={`mt-2 ${primaryButton}`} style={primaryButtonStyle}>
        {submitLabel}
      </button>
    </form>
  );
}
