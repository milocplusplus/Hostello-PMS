# Project Context

## What this is
Hostello PMS — a property management system for a short-term-rental management
company. Two audiences: **admins** (Hostello staff — manage clients, properties,
bookings, calendar blocks, payouts) and **clients** (property owners — view their
own calendar, bookings, blocks, notifications). Brand colors: purple, gold, black,
white; dark-only theme. Pre-launch: real data has not been entered yet.

## Stack
- Next.js 16.3.2 (App Router), React 19.2.8, TypeScript
- Tailwind v4 via `@tailwindcss/postcss`; tokens live in `src/app/globals.css`
  (`surface-0..3`, `hostello-purple`, `hostello-gold`,
  `status-available/booked/blocked/pending`)
- `lucide-react` for icons
- Supabase: `@supabase/supabase-js` + `@supabase/ssr`, project `vucfpfqcankyztzvmyht`
- Auth: Supabase email/password. `profiles` extends `auth.users` with role enum
  (`admin` | `client`). `src/middleware.ts` gates `/admin` and `/client`.
- **No REST/GraphQL layer and no route handlers.** Server Components read,
  Server Actions (`actions.ts`, `"use server"`) write. The only client-side
  Supabase use is auth (`src/lib/supabase/client.ts`).
- npm. Run: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`
  (`eslint`). **No test suite** — `npm run build` is the closest check.
- Deploy: Vercel, team `hostello`, project `hostello-pms`, prod
  `hostello-pms.vercel.app`. GitHub: `milocplusplus/Hostello-PMS` (branch `main`).

## Layout
- `src/app/admin/page.tsx` — admin dashboard: greeting, 4 KPIs (properties / bookings /
  occupancy / revenue with period-over-period), booking-activity tabs, occupancy donut,
  Today panel, quick actions, recently-added table. Occupancy math lives here.
- `src/app/admin/calendar/page.tsx` — **two levels.** No `?client=` renders the
  portfolio overview (`CalendarOverview`: one row per client, one heat cell per
  day); `?client=<id>` renders that one client's property timeline. A bare
  `?property=` resolves to its owning client. Holds `place()` / `buildRow()`, the
  availability math. `calendar/block/page.tsx` + `calendar/actions.ts` handle blocking.
- `src/app/admin/clients/**` — client CRUD, and nested property CRUD under
  `clients/[id]/properties/**`
- `src/app/admin/bookings/**` — booking list + create + `actions.ts`
- `src/app/admin/search/actions.ts` — global search Server Action (Phase 1)
- `src/app/client/**` — client portal mirror: `page.tsx`, `calendar/`, `bookings/`,
  `notifications/`
- `src/components/admin/AdminShell.tsx`, `src/components/client/ClientShell.tsx` — nav shells
- `src/components/admin/BookingForm.tsx` — **shared by admin AND client**
  (`client/bookings/new/page.tsx` imports it from `@/components/admin/`), live payout preview
- `src/components/admin/{ClientForm,PropertyForm,ConfirmDeleteButton}.tsx`
- `src/components/admin/BookingActivity.tsx` — dashboard Upcoming/Check-ins/Check-outs
  pill tabs (server passes all three lists in); also exports `ChannelBadge`
- `src/components/admin/{Sparkline,RevenueChart,AddBookingMenu}.tsx` — KPI trend line
  (renders nothing when the series is flat), cumulative revenue area chart with hover
  tooltip, and the split "Add booking ▾" CTA that holds the quick actions
- `src/components/admin/{CalendarBoard,CalendarOverview,CalendarFilters}.tsx` +
  `src/components/shared/CalendarAgenda.tsx` — the calendar's three views, all four
  **shared by admin AND client**. `CalendarBoard` takes flat `rows` and is always
  one client's properties; `CalendarOverview` is the admin-only portfolio heat map;
  `CalendarAgenda` renders the same `rows` as a day sheet. `CalendarSegment` /
  `CalendarRow` are exported from `CalendarBoard`.
- `src/components/shared/{Avatar,StatusChip}.tsx` — initials avatar (no photo columns
  exist) and the confirmed/tentative/cancelled chip
- `src/components/shared/GlobalSearch.tsx` — top-bar search input. Takes a
  `searchAction` prop; admin passes `admin/search/actions.ts`, the client portal
  `client/search/actions.ts`. `SearchResult` lives in `src/lib/search.ts`.
- `src/components/shared/{NotificationBell,UserMenu}.tsx` — top-bar bell (unread
  badge + recent panel + Mark all read) and avatar/sign-out menu, both shells.
- `src/app/admin/notifications/**` — the admin activity feed (every client's
  notifications, admin unread state). `src/app/client/notifications/**` is the
  owner's own. Both bells are fed from the layouts.
- `src/app/{admin,client}/today/page.tsx` + `src/components/shared/TodayBoard.tsx`
  — the day sheet: arrivals / departures / staying tonight, plus payments pending
  (admin) and blocks today. The dashboards' "Today's summary" tiles link here.
- `src/lib/period.ts` + `src/components/shared/PeriodSelect.tsx` — the revenue
  window (`?period=`) on both dashboards: this month / last month / last 3 months
  / this year, each compared with the same span one period back. KPI cards stay
  on the current month.
- `src/app/manifest.ts` + `public/sw.js` + `public/icons/` + `src/app/offline/page.tsx`
  + `src/components/shared/PwaSetup.tsx` — the installable-app (PWA) layer. The SW
  caches **only** hashed `/_next/static/` and `/icons/`; navigations are
  network-only with `/offline` as the fallback, because every page is per-user
  HTML. `PwaSetup` sits in the root layout, registers the SW in production only,
  and offers the install banner.
- `src/lib/payout.ts` — `calculatePayout`, `nightsBetween`, `DEAL_MODELS`, `formatPKR`.
  **The only correct revenue math.** Currency is PKR.
- `src/lib/calendar.ts` — `getMonthGrid`, `formatMonthLabel`, `parseMonthParam`,
  `formatMonthParam`, `addMonths`, `todayISO`, `addDaysISO`, `formatDayMonth`
- `src/lib/notify.ts` — `notifyBookingCreated/Cancelled/DatesBlocked/PayoutSettled`
- `src/lib/receipts.ts` — token-receipt upload/list helpers (`attachReceipt`,
  `listReceipts`, `validateReceipt`, `RECEIPT_KINDS`). The only code that touches
  the `booking-receipts` storage bucket. `src/components/shared/BookingReceipts.tsx`
  renders the card on both booking detail pages (upload controls only when an
  action is passed in).
- `src/lib/{block-sources,property-types,pakistan-locations,form-styles}.ts` — enum
  label maps + shared input class tokens. Use these instead of hardcoding options.
- `src/lib/supabase/{server,client}.ts` — the two Supabase client factories
- `supabase/migrations/` — the live DB tracks 13 migrations; the repo only holds
  `0001_init_core_schema.sql` (profiles / clients / properties / payout_rules) and
  `20260825062223_restrict_security_definer_function_grants.sql`. The 11 in between
  (bookings, booking_properties, calendar_blocks, notifications, the extra
  `properties` columns) were applied straight to Supabase and never committed.
  Read the live schema, not these files. `list_migrations` shows the real list.
- `AGENTS.md` — Next.js-generated agent rules, auto-re-added by `next dev`.
  `CLAUDE.md` imports it with `@AGENTS.md`; don't delete either.

## Data model (`supabase/migrations/0001_init_core_schema.sql`)
- `clients` — name, contact_email, contact_phone, owner_user_id → profiles,
  deal_model enum(`percent|fixed|ads|fixed_stack|fixed_percent`), monthly_fee,
  share_percent, deduct_percent
- `properties` — client_id, name, location, city, province,
  type enum(`studio|1bhk|2bhk|3bhk|2_plus_kids|farmhouse|penthouse|villa|cottage`),
  status enum(`active|inactive`), stack_rate.
  **No image_url, no bedrooms, no max_guests columns.**
- `bookings` — client_id, guest_name, guest_phone, guests_count, check_in, check_out,
  source enum(`airbnb|booking_com|hostello|client|offline|reference|other`),
  status enum(`confirmed|tentative|cancelled`), sale_price, advance_received,
  deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot,
  stack_rate_snapshot, net_sale, hostello_share, client_payout, settled,
  settled_date, notes, entered_by, timestamps
- `booking_properties` — booking_id, property_id (many-to-many; multi-unit bookings)
- `calendar_blocks` — start_date/end_date (**inclusive**), block_type enum(`blocked|booked`);
  `total_amount/owner_payout/hostello_payout` are **dead columns** from an older design
- `notifications` — client_id, kind enum(`booking_created|booking_cancelled|
  dates_blocked|dates_unblocked|payout_settled`), title, body, booking_id,
  property_id, read_at, admin_read_at. Read by **both** roles: `read_at` is the
  owner's mark (RLS scoped to owner_user_id), `admin_read_at` is Hostello's, and
  a `before update` trigger stops a client from touching the admin one. Admins
  read every row through `notifications: admin full access`.
- `booking_receipts` — booking_id, kind enum(`guest_to_hostello|hostello_to_client`),
  storage_path, amount, uploaded_by, created_at. The screenshot proving the advance
  token moved. Bytes live in the **private** `booking-receipts` storage bucket at
  `<booking_id>/<uuid>.<ext>` — that first path segment is what the storage RLS
  policies key on. **Hostello uploads, the client only reads.** Clients have no
  insert policy on either the table or the bucket, and `BookingForm` takes
  `allowReceipt={false}` in the client portal so no dead control is shown.

## Key flows
1. **Booking create** — `components/admin/BookingForm.tsx` → `app/{admin,client}/bookings/actions.ts`
   → `calculatePayout()` snapshots deal terms onto the row → insert `bookings` +
   `booking_properties` → `notify.ts` writes a `notifications` row.
2. **Availability** — a date's status per property comes from *two* independent tables:
   `bookings` via `booking_properties` (half-open: `check_in ≤ date < check_out`) and
   `calendar_blocks` (inclusive `start_date`..`end_date`). See `buildRow()` /
   `place()` in `app/admin/calendar/page.tsx` — `place()` converts `check_out` to
   an inclusive last night before clipping to the window.
3. **Revenue** — no ledger table. Computed live from
   `bookings.sale_price / net_sale / hostello_share / client_payout`. Deduction comes
   off gross first; `hostello_share` depends on deal_model (0 for fixed/self-sourced/tentative).
4. **Auth/role routing** — Supabase Auth (`app/login/actions.ts`) → `profiles.role` →
   `src/middleware.ts` gates `/admin` vs `/client`.

## Conventions
- Server Components read, Server Actions write. Never add API route handlers.
- Dark-only theme via CSS custom properties in `globals.css` — use tokens, not raw hex.
- Enum labels come from `block-sources.ts` / `property-types.ts` / `pakistan-locations.ts`.
  Channel color + initial also live in `block-sources.ts` (`sourceColor`, `sourceInitial`).
- Form inputs use the class tokens in `form-styles.ts`.
- Extend `notify.ts` with new kinds rather than replacing it.
- Reuse `BookingForm.tsx` for any "add booking" entry point — do not duplicate it.
- Never introduce a second revenue system. `payout.ts` is authoritative.
- Receipt files are never served publicly. Sign a short-lived URL on the server
  (`listReceipts`) and render that; do not make the bucket public.
- Never let the service worker cache HTML, RSC payloads or Supabase responses —
  it would serve one signed-in account's pages to another. Static assets only.
- Phone padding goes through `.safe-topbar` / `.safe-panel` / `.safe-main` in
  `globals.css`, not hardcoded `env(safe-area-inset-*)` in a component.
- Never ship dead nav links or broken routes.

## Gotchas
- **Live data is nearly empty** (1 cancelled booking, 1 calendar block, no revenue
  history) — pre-launch, not broken. Trend/sparkline/"% vs last month" UI must render
  honest empty states, never fabricated history.
- `calendar_blocks.end_date` is **inclusive**; booking `check_out` is **exclusive**.
  Easiest off-by-one bug in this codebase.
- No "maintenance" block type (`blocked|booked` only) — adding one needs a migration.
- In a `storage.objects` policy, write `objects.name`, never bare `name`. `clients`
  has a `name` column, so an unqualified `name` inside a subquery that joins
  `clients` silently binds to *that* column and the policy denies everything.
  This bit the receipt policies once already.
- Channels / Pricing / Expenses / Payouts / Reports have **zero backing tables** —
  out of scope, no nav for them.
- Vercel is git-connected to `milocplusplus/Hostello-PMS`, production branch
  `main` — **pushing to main is the deploy**. There is no Vercel CLI auth and no
  `.vercel/` link on this machine, so `git push` is the only mechanism.
- `AGENTS.md` is regenerated by `next dev`; edits there get overwritten.
- Env: copy `.env.local.example` → `.env.local` before `npm run dev`.
