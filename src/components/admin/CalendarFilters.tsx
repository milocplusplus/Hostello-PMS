"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BOOKING_SOURCES } from "@/lib/block-sources";

const selectClass =
  "bg-surface-2 border border-border-hairline rounded-md pl-2.5 pr-7 py-1.5 text-xs text-ink-secondary outline-none focus:border-hostello-purple-mid hover:border-border-strong transition-colors appearance-none bg-[length:10px] bg-[right_0.5rem_center] bg-no-repeat";

const caret =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%237c7789' stroke-width='1.5'><path d='M1 1l4 4 4-4'/></svg>\")";

/** Properties of the client currently in scope — not the whole portfolio. */
export type PropertyOption = { id: string; name: string };

export function CalendarFilters({
  clients,
  client,
  properties,
  property,
  channel,
  status,
}: {
  clients: { id: string; name: string }[];
  client: string;
  properties: PropertyOption[];
  property: string;
  channel: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // A different client has different properties; the old pick can't survive.
    if (key === "client") params.delete("property");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        aria-label="Client"
        value={client}
        onChange={(e) => update("client", e.target.value)}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by property"
        value={property}
        onChange={(e) => update("property", e.target.value)}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        <option value="">All properties</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by channel"
        value={channel}
        onChange={(e) => update("channel", e.target.value)}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        <option value="">All channels</option>
        {BOOKING_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by status"
        value={status}
        onChange={(e) => update("status", e.target.value)}
        className={selectClass}
        style={{ backgroundImage: caret }}
      >
        <option value="">All status</option>
        <option value="confirmed">Confirmed</option>
        <option value="tentative">Tentative</option>
      </select>
    </div>
  );
}
