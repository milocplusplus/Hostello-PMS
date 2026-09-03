import { CalendarCog, Replace } from "lucide-react";
import { SubmitButton } from "@/components/shared/Busy";
import { fieldInput, fieldLabel } from "@/lib/form-styles";

type UnitOption = { id: string; name: string };

/**
 * The two changes people actually make to a live booking: it moved, or it has
 * to happen in a different unit.
 *
 * Both post to actions that rebuild the edit form and hand it to the ordinary
 * update path, so the clash check and the payout recalculation are the same
 * ones the full form runs — nights and stack rates both move when these fields
 * do, and a shortcut that skipped the recalculation would quietly leave the
 * split wrong.
 *
 * `<details>` rather than a modal: this is a Server Component, the forms are
 * plain forms, and nothing here needs to run in the browser.
 */
export function BookingQuickTools({
  bookingId,
  checkIn,
  checkOut,
  isShortStay,
  units,
  currentUnitIds,
  changeDatesAction,
  moveUnitsAction,
}: {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  /** A short stay's check-out is derived from its date, so it is not offered. */
  isShortStay: boolean;
  /** Every unit the booking could move to — the same client's, already scoped. */
  units: UnitOption[];
  currentUnitIds: string[];
  changeDatesAction: (formData: FormData) => void;
  moveUnitsAction: (formData: FormData) => void;
}) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <h2 className="eyebrow">Manage this booking</h2>

      <details className="group">
        <summary className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary cursor-pointer list-none transition-colors">
          <CalendarCog size={14} className="text-ink-muted" />
          {isShortStay ? "Move to another date" : "Change dates or extend"}
        </summary>

        <form action={changeDatesAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={bookingId} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="qt_check_in" className={fieldLabel}>
              {isShortStay ? "Date" : "Check-in"}
            </label>
            <input
              id="qt_check_in"
              name="check_in"
              type="date"
              defaultValue={checkIn}
              className={`${fieldInput} py-1.5 text-xs`}
            />
          </div>
          {!isShortStay && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qt_check_out" className={fieldLabel}>
                Check-out
              </label>
              <input
                id="qt_check_out"
                name="check_out"
                type="date"
                defaultValue={checkOut}
                className={`${fieldInput} py-1.5 text-xs`}
              />
            </div>
          )}
          <SubmitButton className="btn btn-ghost btn-sm" busy="Checking the new dates are free…">
            Save dates
          </SubmitButton>
        </form>
        <p className="text-[11px] text-ink-muted mt-2">
          The new dates are checked against every other booking and block first, and the payout is
          recalculated — nights change what the deal is worth.
        </p>
      </details>

      <details className="group border-t border-border-hairline pt-3">
        <summary className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary cursor-pointer list-none transition-colors">
          <Replace size={14} className="text-ink-muted" />
          Move to a different unit
        </summary>

        <form action={moveUnitsAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={bookingId} />
          <div className="flex flex-col gap-1.5 min-w-[220px] flex-1">
            <label htmlFor="qt_units" className={fieldLabel}>
              Unit
            </label>
            {/* Multiple, because a booking can already span units and moving it
                must not silently drop the others. */}
            <select
              id="qt_units"
              name="property_ids"
              multiple
              size={Math.min(5, Math.max(2, units.length))}
              defaultValue={currentUnitIds}
              className={`${fieldInput} py-1.5 text-xs`}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton className="btn btn-ghost btn-sm" busy="Checking the unit is free…">
            Move booking
          </SubmitButton>
        </form>
        <p className="text-[11px] text-ink-muted mt-2">
          Only units belonging to the same client can be chosen, and the stack rate behind the
          payout is recalculated from whatever you pick.
        </p>
      </details>
    </div>
  );
}
