"use client";

import { useState } from "react";

export type UnitGroup = { clientName: string; units: { id: string; name: string }[] };

/**
 * Tick one unit or many, grouped by client, with a whole-client tick for
 * blocking a building at once. Posts `property_ids`, once per ticked unit.
 */
export function UnitPicker({ groups, name = "property_ids" }: { groups: UnitGroup[]; name?: string }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(ids: string[], on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-border-hairline p-3 text-sm text-ink-muted">
        No active units yet. Add a client and their units first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-72 overflow-y-auto rounded-xl border border-border-hairline p-3">
      {groups.map((g) => {
        const ids = g.units.map((u) => u.id);
        const all = ids.every((id) => picked.has(id));
        return (
          <fieldset key={g.clientName} className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs font-bold text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => toggle(ids, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-hostello-purple)]"
              />
              {g.clientName} <span className="font-normal text-ink-muted">· all {ids.length}</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-6">
              {g.units.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    name={name}
                    value={u.id}
                    checked={picked.has(u.id)}
                    onChange={(e) => toggle([u.id], e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-hostello-purple)]"
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      <p className="text-[11px] text-ink-muted">{picked.size} selected</p>
    </div>
  );
}
