"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PERIODS, type PeriodKey } from "@/lib/period";

const selectClass =
  "field pl-2.5 pr-7 py-1.5 text-xs text-ink-secondary appearance-none bg-[length:10px] bg-[right_0.5rem_center] bg-no-repeat";

const caret =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%237c7789' stroke-width='1.5'><path d='M1 1l4 4 4-4'/></svg>\")";

/** Puts the revenue window in the URL; the server does the querying. */
export function PeriodSelect({ value }: { value: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      aria-label="Revenue period"
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value === "this_month") params.delete("period");
        else params.set("period", e.target.value);
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      className={selectClass}
      style={{ backgroundImage: caret }}
    >
      {PERIODS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
