"use client";

import { EmptyState } from "@/components/shared/PageHeader";
import { useMemo, useState } from "react";
import { Building2, CalendarDays, Check, Lock, Plus } from "lucide-react";
import { MANUAL_BLOCK_TYPES, blockTypeColor, blockTypeLabel } from "@/lib/block-sources";
import { formatDayMonth } from "@/lib/calendar";
import type { UnavailableRange } from "@/lib/availability";
import { fieldInput, fieldLabel, primaryButton, errorBanner } from "@/lib/form-styles";
import { StayDates } from "@/components/shared/StayDates";
import { FormGlow, FormStep } from "@/components/shared/FormStep";
import { SubmitButton } from "@/components/shared/Busy";

export type UnitGroup = { clientName: string; units: { id: string; name: string }[] };

/**
 * Block dates, as steps with a live card beside them — the same shape as the
 * booking form. Staff tick one unit or many (`multiple`, posts `property_ids`,
 * with a whole-client tick for a building); an owner picks one of theirs
 * (posts `property_id`).
 *
 * Taken nights are greyed out only while one unit is picked. With several, the
 * server blocks the free ones and names the ones it skipped, so a clash on one
 * unit must not stop the rest.
 */
export function BlockDatesForm({
  action,
  groups,
  multiple,
  month,
  unavailable,
}: {
  action: (formData: FormData) => void;
  groups: UnitGroup[];
  multiple: boolean;
  month: string;
  unavailable: UnavailableRange[];
}) {
  const allUnits = useMemo(() => groups.flatMap((g) => g.units), [groups]);
  const [picked, setPicked] = useState<string[]>(() =>
    !multiple && allUnits.length > 0 ? [allUnits[0].id] : []
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [blockType, setBlockType] = useState<string>("blocked");
  const [note, setNote] = useState("");

  function toggle(ids: string[], on: boolean) {
    if (!multiple) {
      setPicked(ids.slice(0, 1));
      return;
    }
    setPicked((prev) => (on ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id))));
  }

  const busy = useMemo(
    () => (picked.length === 1 ? unavailable.filter((r) => r.propertyId === picked[0]) : []),
    [unavailable, picked]
  );
  // Picking the unit after the dates can land on a clash the grid never showed.
  const rangeBlocked = Boolean(start && end && busy.some((r) => r.start <= end && r.end >= start));

  const steps = {
    units: picked.length > 0,
    dates: Boolean(start && end) && !rangeBlocked,
    why: true,
  };
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 0;
  const pickedNames = allUnits.filter((u) => picked.includes(u.id)).map((u) => u.name);
  const tint = blockTypeColor(blockType);

  if (allUnits.length === 0) {
    return <EmptyState icon={Building2} title={<>No active units yet.</>} />;
  }

  return (
    <div className="@container relative isolate">
      <FormGlow />

      <form action={action} className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_320px] @3xl:items-start">
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="block_type" value={blockType} />
        {picked.map((id) => (
          <input key={id} type="hidden" name={multiple ? "property_ids" : "property_id"} value={id} />
        ))}

        <div className="stagger flex flex-col gap-4 min-w-0">
          <FormStep n={1} icon={Building2} title={multiple ? "Which units?" : "Which property?"} done={steps.units}>
            <div className="flex flex-col gap-4 max-h-80 overflow-y-auto -mr-2 pr-2">
              {groups.map((g) => {
                const ids = g.units.map((u) => u.id);
                const all = ids.every((id) => picked.includes(id));
                return (
                  <div key={g.clientName} className="flex flex-col gap-2">
                    {(multiple || groups.length > 1) && (
                      <div className="flex items-center justify-between gap-3">
                        <p className={fieldLabel}>{g.clientName}</p>
                        {multiple && ids.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggle(ids, !all)}
                            aria-pressed={all}
                            className={`text-[11px] rounded-full border px-2.5 py-1 transition-colors ${
                              all
                                ? "border-hostello-gold text-ink-primary bg-hostello-gold/10"
                                : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                            }`}
                          >
                            {all ? "All picked" : `All ${ids.length}`}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {g.units.map((u) => {
                        const on = picked.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            role={multiple ? "checkbox" : "radio"}
                            aria-checked={on}
                            onClick={() => toggle([u.id], !on)}
                            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                              on
                                ? "border-hostello-gold bg-hostello-gold/15 text-ink-primary font-semibold shadow-[0_6px_18px_-10px_rgba(245,201,104,0.9)]"
                                : "border-border-hairline text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                            }`}
                          >
                            {on ? (
                              <Check size={12} strokeWidth={3} className="text-hostello-gold" />
                            ) : (
                              <Plus size={12} />
                            )}
                            {u.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </FormStep>

          <FormStep n={2} icon={CalendarDays} title="Which days?" done={steps.dates}>
            <StayDates
              checkIn={start}
              checkOut={end}
              onChange={(from, to) => {
                setStart(from);
                setEnd(to);
              }}
              busy={busy}
              mode="days"
            />
            {picked.length > 1 && (
              <p className="text-[11px] text-ink-muted">
                With several units picked, any already taken on these days are skipped and named after you
                save — the rest are blocked.
              </p>
            )}
          </FormStep>

          <FormStep n={3} icon={Lock} title="Why?" done={steps.why}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Why">
              {/* `booked` is not offered: that is what a channel sync writes for
                  an imported reservation, not something anyone picks here. */}
              {MANUAL_BLOCK_TYPES.map((t) => {
                const on = blockType === t.value;
                const color = blockTypeColor(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setBlockType(t.value)}
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
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reason" className={fieldLabel}>
                Note (optional)
              </label>
              <input
                id="reason"
                name="reason"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Owner personal use, boiler replacement"
                className={fieldInput}
              />
            </div>
          </FormStep>
        </div>

        <aside className="animate-in flex flex-col gap-3 @3xl:sticky @3xl:top-20">
          <div className="card-hero p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold opacity-90">
                <Lock size={13} aria-hidden />
                New block
              </span>
              <span className="text-[10px] rounded-full bg-white/15 px-2 py-0.5">
                {Object.values(steps).filter(Boolean).length} of 3 set
              </span>
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
                {picked.length === 0
                  ? "Pick a unit"
                  : picked.length === 1
                    ? pickedNames[0]
                    : `${picked.length} units`}
              </p>
              {picked.length > 1 && <p className="text-xs opacity-75 line-clamp-2">{pickedNames.join(", ")}</p>}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-white/10 border border-white/15 p-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider opacity-70">From</p>
                <p className="text-sm font-semibold">{start ? formatDayMonth(start) : "—"}</p>
              </div>
              <div className="flex flex-col items-center px-2">
                <span key={days} className="animate-receipt-pop text-2xl font-extrabold leading-none num">
                  {days || "·"}
                </span>
                <span className="text-[10px] opacity-70">{days === 1 ? "day" : "days"}</span>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] uppercase tracking-wider opacity-70">To</p>
                <p className="text-sm font-semibold">{end ? formatDayMonth(end) : "—"}</p>
              </div>
            </div>

            <dl className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="opacity-70">Why</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2 h-2 rounded-full ring-2 ring-white/40" style={{ backgroundColor: tint }} />
                  {blockTypeLabel(blockType)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="opacity-70">Note</dt>
                <dd className={`truncate ${note.trim() ? "font-semibold" : "opacity-60"}`}>
                  {note.trim() || "None"}
                </dd>
              </div>
            </dl>
          </div>

          {rangeBlocked && (
            <p className={errorBanner}>
              Some of those days are already taken on this unit. Pick other days.
            </p>
          )}

          <SubmitButton
            className={`w-full ${primaryButton}`}
            disabled={!steps.units || !steps.dates}
            busy="Blocking the dates…"
          >
            Block these dates
          </SubmitButton>
        </aside>
      </form>
    </div>
  );
}
