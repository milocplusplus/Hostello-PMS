"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { startNavProgress } from "@/components/shared/NavProgress";
import { Search, X } from "lucide-react";
import { BOOKING_SOURCES } from "@/lib/block-sources";

const selectClass =
  "field pl-2.5 pr-7 py-1.5 text-xs text-ink-secondary appearance-none bg-[length:10px] bg-[right_0.5rem_center] bg-no-repeat";

const caret =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%237c7789' stroke-width='1.5'><path d='M1 1l4 4 4-4'/></svg>\")";

export type ClientOption = { id: string; name: string };

export function BookingFilters({
  clients,
  q,
  client,
  channel,
  status,
}: {
  clients: ClientOption[];
  q: string;
  client: string;
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
    startNavProgress();
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = (new FormData(e.currentTarget).get("q") as string) ?? "";
          update("q", value.trim());
        }}
        className="relative w-full sm:w-auto"
      >
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        {/* Uncontrolled, keyed on the URL value so back/clear resets it. */}
        <input
          key={q}
          name="q"
          defaultValue={q}
          placeholder="Search guest name…"
          aria-label="Search bookings by guest name"
          className="field pl-7 pr-7 py-1.5 text-xs w-full sm:w-52"
        />
        {q && (
          <button
            type="button"
            onClick={() => update("q", "")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </form>

      <select
        aria-label="Filter by client"
        value={client}
        onChange={(e) => update("client", e.target.value)}
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
        <option value="">Confirmed &amp; tentative</option>
        <option value="confirmed">Confirmed only</option>
        <option value="tentative">Tentative only</option>
        <option value="cancelled">Cancelled only</option>
      </select>

      {/* No settlement filter here any more. Filtering a list of stays by whether
          a payment cleared it belongs with the payments — /admin/settlements. */}
    </div>
  );
}
