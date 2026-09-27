"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { startNavProgress } from "@/components/shared/NavProgress";
import { AUDIT_CATEGORIES } from "@/lib/audit";

const selectClass =
  "field h-10 md:h-auto w-full md:w-auto rounded-xl pl-3 pr-7 py-1.5 text-xs text-ink-secondary truncate appearance-none bg-[length:10px] bg-[right_0.6rem_center] bg-no-repeat";

const caret =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%237c7789' stroke-width='1.5'><path d='M1 1l4 4 4-4'/></svg>\")";

type Option = { id: string; name: string };

export function AuditFilters({
  people,
  clients,
  units,
  actor,
  client,
  property,
  category,
  from,
  to,
}: {
  people: Option[];
  clients: Option[];
  units: Option[];
  actor: string;
  client: string;
  property: string;
  category: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    // Any new filter starts again from the newest entry.
    params.delete("before");
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startNavProgress();
    router.push(`${pathname}?${params.toString()}`);
  }

  const active = actor || client || property || category || from || to;

  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:flex-wrap">
      <select
        aria-label="Filter by person"
        value={actor}
        onChange={(e) => update({ actor: e.target.value })}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        <option value="">Everyone</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by type of change"
        value={category}
        onChange={(e) => update({ type: e.target.value })}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        <option value="">All changes</option>
        {AUDIT_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by client"
        value={client}
        // A unit belongs to one client; changing client drops it.
        onChange={(e) => update({ client: e.target.value, property: "" })}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by unit"
        value={property}
        disabled={!client}
        onChange={(e) => update({ property: e.target.value })}
        className={`${selectClass} disabled:opacity-50`}
        style={{ backgroundImage: caret }}
      >
        <option value="">{client ? "All units" : "Pick a client first"}</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        From
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => update({ from: e.target.value })}
          className="field h-10 md:h-auto rounded-xl px-3 py-1.5 text-xs w-full md:w-auto"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        To
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => update({ to: e.target.value })}
          className="field h-10 md:h-auto rounded-xl px-3 py-1.5 text-xs w-full md:w-auto"
        />
      </label>

      {active && (
        <button
          type="button"
          onClick={() => update({ actor: "", client: "", property: "", type: "", from: "", to: "" })}
          className="col-span-2 md:col-span-1 text-xs font-bold text-hostello-purple-light hover:underline justify-self-start"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
