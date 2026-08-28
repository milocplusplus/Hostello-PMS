"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const selectClass =
  "bg-surface-2 border border-border-hairline rounded-md pl-2.5 pr-7 py-1.5 text-xs text-ink-secondary outline-none focus:border-hostello-purple-mid hover:border-border-strong transition-colors appearance-none bg-[length:10px] bg-[right_0.5rem_center] bg-no-repeat";

const caret =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%237c7789' stroke-width='1.5'><path d='M1 1l4 4 4-4'/></svg>\")";

/** Whole portfolio, or one client on its own. The server does the filtering. */
export function StatsClientSelect({
  clients,
  value,
}: {
  clients: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      aria-label="Client"
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set("client", e.target.value);
        else params.delete("client");
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
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
  );
}
