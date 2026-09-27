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

## Phase 2 — recurring (built)
- `recurring_expenses` templates: unit, category, vendor, method, expected
  amount, day of month (29–31 fall back to a short month's last day), active.
- `generate_due_expenses()` on pg_cron `hostello-expenses-due`, 02:05 UTC
  (07:05 Karachi), writes this month's **due** expense (`expenses.confirmed =
  false`, `paid = false`, amount = the template's) for each active bill whose
  day has come, then one `expense_due` notification per owner. Cron cannot
  call `emit_notification`, so it inserts directly, as `notify_daily_stays()`
  does — bell and Realtime, no push.
- **`last_generated_month` is the key.** It makes a re-run a no-op, and it is
  why skipping (deleting) a due expense does not bring it back next morning.
  Setting a bill up, moving its day or resuming it on a day already past this
  month marks this month done (`generatedMarker()` in `src/lib/expenses.ts`) —
  the first one is next month's. The app and the job agree on the Karachi date.
- Due expenses are in **no total** (`listExpenses` and `unpaidTotal` read
  `confirmed = true` only). They sit in a "bills are due" card on
  `/client/expenses` whatever month they are from, with Confirm (the edit form;
  any save confirms) and Skip (delete).
- Deleting a bill keeps the expenses it produced that were confirmed (the link
  is set null) and removes the ones still due. Templates live at
  `/client/expenses/recurring` (+ `[id]`); the admin does not see them.

## Phase 3 — profit and insights (built)
Built as a **Profit tab** on `/client/expenses` (`?view=profit`,
`components/client/ProfitBoard.tsx`), all figures from `loadProfit()` in
`src/lib/profit.ts`. The multi-unit split is `unitShares()`, exported from
`statement-report.ts` so the statement's unit bars and profit per unit are one
rule. A month before the owner's first recorded expense shows no expense
figure and no profit ("not recorded"), never a profit of everything. The
statement CSV and PDF (owner's and admin's alike) gain an expenses section and
a profit summary only when `profit.recorded`, and a month with expenses but no
stays can now be exported. The admin's read-only expense view has no Profit
tab.

The plan as agreed:
- Income is `client_payout` from `bookings_v`, **confirmed stays only**,
  attributed to the **check-in month**. Profit = income − expenses, per unit and
  overall, in one helper — never a second copy of the split (`payout.ts` stays
  the only revenue math).
- Cost per night: a unit's expenses ÷ its booked nights (`nightsBetween`);
  "—" when there were none.
- Breakdowns by category, unit and vendor, against previous months.
- The monthly statement CSV / PDF gains an expenses section and a profit line.
- **Separate decision, own change:** Stats moves to check-in month so it
  agrees with Profit — **done 2026-09-27**. The dashboards (KPI row, revenue
  period chart) and the Bookings page stay on the overlap window: the KPI row
  shares its query with occupancy, which is per night by nature.

## Phase 4 — budgets and alerts (built)
- `expense_budgets`: monthly limit per category, unit optional. **No unit is
  the whole category** — every unit and the general bills together; a unit's
  budget counts that unit only. One per category per unit, plus one for the
  whole category (`nulls not distinct`). Unlike expenses, budgets cascade when
  their unit or category goes: a limit on nothing is no record.
- Set, re-limit and remove at `/client/expenses/budgets` (month nav; spent vs
  limit per budget). Changing the category or unit is a new budget. The admin
  can read them by RLS but has no page for them.
- `notify_expense_alerts()` on pg_cron `hostello-expense-alerts`, 02:10 UTC
  (07:10 Karachi), over **this month and last** — a bill logged on the 30th's
  evening is only seen on the 1st. Confirmed expenses by bill date, as
  everywhere; `budgetSpent()` in `src/lib/expenses.ts` is the page's copy of
  the rule.
  - **Crossed** is spent *above* the limit, not at it →
    `expense_budget_crossed`, links to Budgets.
  - **Running high**, only for a category with no budget at any level: the
    month above **1.5×** the average of the three months before it, once the
    category's first expense is in or before the third month back and that
    average is above zero → `expense_running_high`, links to the Profit tab.
- `event_key` is per client / category / unit (`all` for none) / month, so
  each is told once a month. Inserted directly like `expense_due`: bell and
  Realtime, no push.
