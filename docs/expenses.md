# Owner expenses — spec

Agreed 2026-09-26. Owners keep their own books in the portal: what their units
cost, next to what they earned, so they can see real profit per unit and where
money goes.

## Decisions
- **Tracking only.** The owner pays, the owner logs. An expense never touches
  Settlements, `owed.ts`, or any booking column. Hostello-paid deductions are
  out of scope; if they ever come, they are a separate feature on the
  settlement side, not a flag on this table.
- **Unit is optional.** An expense is on one unit, or on "All units / general".
  Unit expenses count against that unit's profit; general ones only against the
  owner's overall total. Nothing is split automatically.
- **Categories:** Utilities, Repairs & maintenance, Fixed charges, Supplies &
  furnishing, Other — shared defaults — plus any the owner adds for themselves.
  An owner's category can be removed only while no expense uses it.
- **Fields:** amount (PKR), bill date, category, unit, vendor / paid to,
  payment method (cash, bank, JazzCash, Easypaisa, card), paid / unpaid with an
  optional due date, note, optional bill photo or PDF.
- **Receipts** live in a private `expense-receipts` bucket at
  `<client_id>/<uuid>.<ext>` and reach a browser only through a signed URL.
- **Visibility:** the owner reads and writes their own. The Hostello admin
  reads only (a tab on the client's admin page). Ops never sees expenses.
- **Owners may delete** an expense; nothing else depends on it.
- **Unpaid bills count** in the month of their bill date; the page also shows
  "still to pay" on its own.

## Phase 1 — core (built)
- Tables `expense_categories`, `expenses`; RLS as above; the bucket.
- `/client/expenses`: month view, filters (unit, category, paid/unpaid), month
  total and still-to-pay, add / edit / delete, custom categories.
- `/admin/clients/<id>/expenses`: the same list, read-only.

## Phase 2 — recurring
- `recurring_expenses` templates: unit, category, vendor, method, expected
  amount, day of month, active.
- A daily pg_cron job writes a **due** expense for each template that comes due
  (keyed so a re-run is a no-op) and a notification. Due rows are excluded from
  every total until the owner confirms the real amount. Cron cannot call
  `emit_notification`; it inserts directly, as `notify_daily_stays()` does.

## Phase 3 — profit and insights
- Income is `client_payout` from `bookings_v`, **confirmed stays only**,
  attributed to the **check-in month**. Profit = income − expenses, per unit and
  overall, in one helper — never a second copy of the split (`payout.ts` stays
  the only revenue math).
- Cost per night: a unit's expenses ÷ its booked nights (`nightsBetween`);
  "—" when there were none.
- Breakdowns by category, unit and vendor, against previous months.
- The monthly statement CSV / PDF gains an expenses section and a profit line.
- **Separate decision, own change:** Stats (and with it the dashboards and the
  revenue period, which share the overlap window) moves to check-in month so
  every page agrees. Not done as part of this feature.

## Phase 4 — budgets and alerts
- `expense_budgets`: monthly limit per category, unit optional.
- Alert when a budget is crossed; where no budget is set, alert when a
  category runs well above its 3-month average — only once three months of
  history exist. Both via the daily cron, keyed per client/category/month.
