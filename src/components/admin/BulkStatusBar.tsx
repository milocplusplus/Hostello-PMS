"use client";

import { useEffect, useState } from "react";
import { fieldInput, primaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";

/** The tick boxes on the booking cards name this form (`form="bulk-status"`). */
const BULK_STATUS_FORM = "bulk-status";

/**
 * The bar that appears once bookings are ticked on the list. The tick boxes
 * live on the cards and join this form through `form="bulk-status"`, so the
 * cards stay server-rendered; this only counts them.
 */
export function BulkStatusBar({
  action,
  month,
}: {
  action: (formData: FormData) => void;
  month: string;
}) {
  const [count, setCount] = useState(0);
  const [to, setTo] = useState("confirmed");

  useEffect(() => {
    const boxes = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_STATUS_FORM}"][name="ids"]`));
    const recount = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", recount);
    recount();
    return () => document.removeEventListener("change", recount);
  }, []);

  // Always in the page, so the tick boxes always have a form to belong to.
  return (
    <form
      id={BULK_STATUS_FORM}
      action={action}
      className={`sticky bottom-[calc(var(--tabbar-space,0px)+0.75rem)] z-30 card p-3 flex-wrap items-center gap-2 border border-hostello-purple/40 ${count === 0 ? "hidden" : "flex"}`}
    >
      <input type="hidden" name="month" value={month} />
      <p className="text-sm font-bold mr-auto">{count} selected</p>
      <select
        name="to"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className={`${fieldInput} w-auto`}
        aria-label="Change the selected bookings to"
      >
        <option value="confirmed">Mark confirmed</option>
        <option value="tentative">Put on hold (tentative)</option>
        <option value="cancelled">Cancel them</option>
      </select>
      {to === "cancelled" && (
        <input
          name="confirm_count"
          inputMode="numeric"
          required
          placeholder={`Type ${count} to confirm`}
          className={`${fieldInput} w-40`}
          aria-label={`Type ${count} to confirm cancelling`}
        />
      )}
      <SubmitButton className={primaryButton} blocking busy="Updating the bookings…">
        Apply
      </SubmitButton>
    </form>
  );
}
