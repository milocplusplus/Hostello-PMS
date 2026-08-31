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
  `calendar/feeds/**` is both directions of channel sync. **In:** connect a
  channel's iCal export (Airbnb, Booking.com) and import its dates as blocks.
  **Out:** publish a property's occupied nights at
  `https://<ref>.supabase.co/functions/v1/ical/<token>` — the `ical` Edge
  Function over the `ical_export_document()` SQL function. Airbnb has no API for
  ordinary hosts; iCal is the only route, and it carries dates but no guest name
  and no price, so an imported night is a block, never a booking.
- `supabase/functions/ical-sync/` — **the only code that reads a channel
  calendar.** It is an edge function and not app code because pg_cron has to run
  the same sync every minute and nothing external can call a Server Action.
  `src/lib/ical-sync.ts` is only a caller: it forwards the admin's own session
  token, so no service-role key is needed in Vercel. The *rules* (booked vs
  blocked, what is stale, when to raise a clash) live in
  `sync_calendar_feed_apply()` in SQL, next to the data where cron can reach
  them; the function only fetches and parses.
- `src/app/admin/clients/**` — client CRUD, and nested property CRUD under
  `clients/[id]/properties/**`
- `src/app/admin/bookings/**` — booking list + create + `actions.ts`
- `src/app/admin/search/actions.ts` — global search Server Action (Phase 1)
- `src/app/client/**` — client portal mirror: `page.tsx`, `calendar/`, `bookings/`,
  `notifications/`, `payouts/`
- `src/app/{admin,client}/payouts/**` + `src/lib/owed.ts` — **Owed to Hostello.**
  The owner's page shows the balance, the bookings behind it, a form to record a
  payment (online needs a screenshot, cash does not) and their history; the
  admin's is the review queue, the per-client balances and the reviewed log.
  `owed.ts` is settlement only — it adds up shares and subtracts payments, and
  never re-derives a split. `src/components/client/RecordPayoutForm.tsx` (client
  component: the screenshot field follows the method) and
  `src/components/shared/PayoutHistory.tsx` (shared by both portals).
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
- **Notifications** — `src/lib/notify.ts` (the only writer), `notifications.ts`
  (kind → icon, categories), `notification-feed.ts` (the only reader),
  `notification-sounds.ts` (Web Audio tones), `push.ts` (Web Push sender),
  `block-events.ts` (what a calendar block announces);
  `src/components/shared/{NotificationBell,NotificationFeed,NotificationLive,
  NotificationSettings}.tsx`; `src/app/notifications/actions.ts` — shared read /
  preference / subscription actions, a folder with no `page.tsx` so it is no route
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
- `android/` + `public/app/hostello.apk` + `public/.well-known/assetlinks.json`
  — the Android app. A Trusted Web Activity (`pk.hostello.pms`) wrapping this
  same site, so it carries no copy of the app and a Vercel deploy updates it.
  `android/build-apk.mjs` rebuilds and re-signs it; the keystore is not in git.
  Its `DelegationService` is what turns a web push into an app notification —
  the high-importance channel and `ic_notification_icon` (a transparent white
  silhouette, never the colour icon) live there, not in `sw.js`.
  "Get the app" hands Android this file and everyone else an instruction.
- `src/lib/payout.ts` — `calculatePayout`, `nightsBetween`, `usesStackRate`,
  `isOtaSource`, `isPassThroughSource`, `DEAL_MODELS`, `formatPKR`. **The only
  correct revenue math.** Currency is PKR.
- `src/lib/short-stay.ts` — everything short stays (hours, not nights) mean:
  `readShortStay` (the form contract), `rowShortStay` (a DB row’s window),
  `shortStayCheckOut`, `departureDate`, `formatShortStayWindow`.
- `src/lib/calendar.ts` — `getMonthGrid`, `formatMonthLabel`, `parseMonthParam`,
  `formatMonthParam`, `addMonths`, `todayISO`, `addDaysISO`, `formatDayMonth`
- `src/lib/notify.ts` — `notifyBookingCreated/Cancelled/DatesBlocked/PayoutSettled`
  A booking event writes **two rows**, one per audience (`emitBookingEvent`):
  the admin's body leads with the client's name, the owner's does not.
- `src/lib/guest-ids.ts` — guest ID cards (CNIC / passport scans) on a booking:
  `guestIdFiles`, `validateGuestIds`, `attachGuestIds`, `listGuestIds`. The only
  code that touches the `guest-ids` bucket; it borrows the file rules from
  `receipts.ts`. `src/components/shared/GuestIdCards.tsx` renders the card on
  both booking detail pages, and `BookingForm` carries a multiple file input so
  IDs can be attached at booking time. **Unlike receipts, both sides upload.**
- `src/lib/receipts.ts` — token-receipt upload/list helpers (`attachReceipt`,
  `listReceipts`, `validateReceipt`, `RECEIPT_KINDS`). The only code that touches
  the `booking-receipts` storage bucket. `src/components/shared/BookingReceipts.tsx`
  renders the card on both booking detail pages (upload controls only when an
  action is passed in).
- `src/lib/{block-sources,property-types,pakistan-locations,form-styles}.ts` — enum
  label maps + shared input class tokens. Use these instead of hardcoding options.
- `src/lib/auth.ts` — `currentUser`, `currentProfile`, `currentClient`, all
  `cache()`-wrapped so a layout and the page inside it share one lookup instead
  of each paying its own round trip. **Read identity through these, never with a
  fresh `supabase.auth.getUser()` in a page.**
- `src/app/{admin,client}/loading.tsx` + `src/components/shared/PageSkeleton.tsx`
  — the loading boundary for every route in both portals. It is also what makes
  `<Link>` prefetch work on these dynamic routes.
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
  status enum(`active|inactive`), stack_rate, short_stay_stack_rate.
  **No image_url, no bedrooms, no max_guests columns.**
- `bookings` — client_id, guest_name, guest_phone, guests_count, check_in, check_out,
  is_short_stay, short_stay_start, short_stay_end,
  source enum(`airbnb|booking_com|hostello|client|offline|reference|other`),
  status enum(`confirmed|tentative|cancelled`), sale_price, advance_received,
  deal_model_snapshot, share_percent_snapshot, deduct_percent_snapshot,
  stack_rate_snapshot, net_sale, hostello_share, client_payout, settled,
  settled_date, share_received, share_received_date, notes, entered_by, timestamps.
  **Two settlements, not one**: `share_received` = Hostello has its `hostello_share`,
  `settled` = the owner has their `client_payout`. They run in opposite directions
  and are independent. Only `share_received` feeds "Owed to Hostello".
- `client_payouts` — client_id, amount, method(`online|cash`), reference,
  receipt_path, status(`pending|received|rejected`), admin_note, submitted_by,
  reviewed_by/at. What an owner says they sent. A `pending` row changes no
  balance; only an admin confirming it does. RLS lets an owner file, edit and
  withdraw their own **pending or rejected** entries and never set `received`.
- `client_payout_allocations` — payout_id, booking_id, client_id, amount. Which
  bookings a confirmed payment cleared. Written only by `apply_client_payout`.
- `booking_properties` — booking_id, property_id (many-to-many; multi-unit bookings)
- `calendar_blocks` — start_date/end_date (**inclusive**), block_type enum(`blocked|booked`);
  `total_amount/owner_payout/hostello_payout` are **dead columns** from an older design.
  `feed_id` + `external_uid` mark a row an imported channel date owns; both null
  on a block a person made, and a sync only ever touches its own rows.
- `calendar_feeds` — property_id, url, source(`booking_source`), label, active,
  last_synced_at, last_error, last_event_count. One channel iCal link per
  property. Deleting it cascades away the blocks it imported.
- `calendar_exports` — property_id (**unique**), token, active, last_fetched_at,
  fetch_count. The link a channel subscribes to. `ical_export_document(token)`
  builds the document; it is SECURITY DEFINER and `execute` is granted **only to
  `service_role`**, because the only caller is the `ical` Edge Function.
  The import side's `sync_calendar_feed_apply()` / `sync_calendar_feed_failed()`
  / `is_ical_sync_secret()` are locked down the same way. The sync's shared
  secret lives in **Vault** (`ical_sync_secret`), never in a table or the repo.
- `notifications` — **one row per event**: kind (text), category
  (`booking|payment|calendar|system|critical`), audience (`admin|client|both`),
  title, body, client_id (nullable), booking_id, property_id, actor_user_id,
  event_key, created_at. Nothing inserts here directly — see `emit_notification`.
- `notification_recipients` — **one row per person per event**: notification_id,
  user_id, read_at, pushed_at, created_at. This is both the permission (RLS is
  `user_id = auth.uid()`) and the read state, so every admin has their own. The
  `notifications_fan_out` trigger writes these from `audience` + `client_id`, and
  never to `actor_user_id` — nobody is notified of their own action.
- `push_subscriptions` — user_id, platform(`web|android|ios`), endpoint (unique),
  p256dh, auth, user_agent, failed_at. A web row holds the push endpoint and its
  two keys; a native row would hold an FCM/APNs token in `endpoint`.
- `notification_preferences` — user_id, push_enabled, sound_enabled,
  muted_categories. Absent row = defaults (everything on).
- `booking_receipts` — booking_id, kind enum(`guest_to_hostello|hostello_to_client`),
  storage_path, amount, uploaded_by, created_at. The screenshot proving the advance
  token moved. Bytes live in the **private** `booking-receipts` storage bucket at
  `<booking_id>/<uuid>.<ext>` — that first path segment is what the storage RLS
  policies key on. **Hostello uploads, the client only reads.** Clients have no
  insert policy on either the table or the bucket, and `BookingForm` takes
  `allowReceipt={false}` in the client portal so no dead control is shown.
- `booking_guest_ids` — booking_id, storage_path, uploaded_by, created_at. Many
  per booking. Bytes live in the **private** `guest-ids` bucket at
  `<booking_id>/<uuid>.<ext>`, same as receipts. **Both Hostello and the owner
  upload here** — whoever met the guest took the ID — but an owner may only
  delete rows they uploaded themselves, which is why `listGuestIds` returns
  `uploadedBy` and the client portal passes `viewerId`.

## Key flows
1. **Booking create** — `components/admin/BookingForm.tsx` → `app/{admin,client}/bookings/actions.ts`
   → `calculatePayout()` snapshots deal terms onto the row → insert `bookings` +
   `booking_properties` → `notify.ts` writes a `notifications` row.
1b. **Notifications** — a Server Action calls a `notify*()` helper in
   `src/lib/notify.ts` → the `emit_notification` RPC (SECURITY DEFINER: it is how
   a *client* session is allowed to tell the admins something, and it checks the
   caller owns the client it names) → one `notifications` row → the fan-out
   trigger writes `notification_recipients` → Supabase Realtime pushes the
   recipient row to that user's browser (`NotificationLive`), which refreshes the
   server-rendered bell and plays the category's tone → `deliverPush()` sends Web
   Push to their other devices. `event_key` is the anti-duplicate: same key, no
   second row. Time-based events (today's arrivals/departures) come from the
   `notify_daily_stays()` pg_cron job, which inserts the same rows.
2. **Availability** — a date's status per property comes from *two* independent tables:
   `bookings` via `booking_properties` (half-open: `check_in ≤ date < check_out`) and
   `calendar_blocks` (inclusive `start_date`..`end_date`). See `buildRow()` /
   `place()` in `app/admin/calendar/page.tsx` — `place()` converts `check_out` to
   an inclusive last night before clipping to the window.
2b. **Owed to Hostello** — the owner files a `client_payouts` row (`pending`) →
   admin reviews on `/admin/payouts` → **confirm** calls the `apply_client_payout`
   RPC, which marks it received and allocates it across that client's open
   bookings **oldest check-in first**, closing each booking (`share_received`)
   as it is fully covered and returning any overpayment as unallocated credit;
   **reject** leaves the balance untouched and the row visible as rejected with
   the admin's reason, which the owner can correct and resubmit. Admin can also
   close one booking outright (`markShareReceived`) for the case where Hostello
   kept its share out of money it already held. `revoke_client_payout` undoes a
   confirmation, reopening only the bookings the remaining money no longer covers.
3. **Revenue** — no ledger table. Computed live from
   `bookings.sale_price / net_sale / hostello_share / client_payout`. Deduction comes
   off gross first; `hostello_share` depends on deal_model (0 for fixed/tentative).
   **Hostello earns nothing on a stay it did not sell**: `client` (owner
   self-sourced), `offline` (walk-in), `reference` (referral) and `other` are
   pass-through — the whole net goes to the owner whatever the deal model says.
   `isPassThroughSource()` in `payout.ts` is the one list; never re-spell it.
4. **Auth/role routing** — Supabase Auth (`app/login/actions.ts`) → `profiles.role` →
   `src/middleware.ts` gates `/admin` vs `/client`.

## Conventions
- Server Components read, Server Actions write. Never add API route handlers.
- Dark-only theme via CSS custom properties in `globals.css` — use tokens, not raw hex.
- Enum labels come from `block-sources.ts` / `property-types.ts` / `pakistan-locations.ts`.
  Channel color + initial also live in `block-sources.ts` (`sourceColor`, `sourceInitial`).
- Form inputs use the class tokens in `form-styles.ts`.
- Extend `notify.ts` with new kinds rather than replacing it. **Never insert into
  `notifications` from application code** — go through a `notify*()` helper, which
  goes through the `emit_notification` RPC. Every new event needs an `event_key`
  or it can be delivered twice, and one line in `KIND_ICON` in `notifications.ts`.
- Notification *routing* is `audience` + `client_id`, decided in the emitter and
  applied by the database trigger. Do not filter recipients in a page query.
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
- **The database is in Sydney (`ap-southeast-2`) and `vercel.json` pins the
  functions to `syd1` to sit next to it.** Do not remove that file or let the
  region drift back to the `iad1` default — it puts a ~220 ms Pacific crossing on
  every query, and a page makes several of them in a row. Latency, not SQL, is
  what makes this app feel slow, so the thing to minimise is the number of
  *sequential* Supabase calls per render: batch independent ones into a
  `Promise.all`, and take identity from `src/lib/auth.ts` rather than re-fetching it.
- **Live data is nearly empty** (1 cancelled booking, 1 calendar block, no revenue
  history) — pre-launch, not broken. Trend/sparkline/"% vs last month" UI must render
  honest empty states, never fabricated history.
- **`settled` and `share_received` are opposite directions.** `settled` is money
  Hostello owes the owner; `share_received` is money the owner owes Hostello.
  Before 2026-08-29 a single `settled` was labelled "Mark received" on admin and
  "Paid out" on the owner's portal — the same tick telling two stories. Never
  sum one of them and label it as the other.
- Payment screenshots live in the **`payout-receipts`** bucket at
  `<client_id>/<uuid>.<ext>` — a different bucket from `booking-receipts`, whose
  policies key on the *booking* id. Owners may write into their own folder here,
  which they may not do on `booking-receipts`.
- **A short stay is stored as one night.** `is_short_stay` bookings are hours on
  a single date, written with `check_out = check_in + 1` so every night-based
  query keeps working and the stack deduction lands as the flat
  `short_stay_stack_rate × 1`. Two things must not read `check_out` literally:
  the departure day (it is `check_in` — use `departureDate()`), and availability
  — once a short stay is ticked out (`checked_out_at`) its date is sellable
  again, which `findStayClash` / `listUnavailable` already allow for.
- `calendar_blocks.end_date` is **inclusive**; booking `check_out` is **exclusive**.
  Easiest off-by-one bug in this codebase.
- No "maintenance" block type (`blocked|booked` only) — adding one needs a migration.
- In a `storage.objects` policy, write `objects.name`, never bare `name`. `clients`
  has a `name` column, so an unqualified `name` inside a subquery that joins
  `clients` silently binds to *that* column and the policy denies everything.
  This bit the receipt policies once already.
- Pricing / Expenses / Reports have **zero backing tables** — out of scope, no
  nav for them. Neither do guest messaging, housekeeping, maintenance or staff
  assignment, so there are no notifications for them either. Do not invent one;
  add the table first. OTA sync is the one exception and is now fully built:
  `calendar_feeds` in, `calendar_exports` out, a `calendar_conflict`
  notification when they disagree, and a 5-minute schedule.
- **`pg_safeupdate` is on for this database**: an UPDATE or DELETE with no
  WHERE clause fails with `21000: DELETE requires a WHERE clause`, *including*
  against a temporary table inside a function. This is why
  `sync_calendar_feed_apply()` re-derives its event set from the jsonb argument
  instead of staging it in a temp table.
- **A cron cannot call `emit_notification`** — it raises on a null `auth.uid()`.
  System-generated notifications insert into `notifications` directly from a
  SECURITY DEFINER function with no `actor_user_id`; `notify_daily_stays()` and
  `sync_calendar_feed_apply()` both do this. Application code still goes
  through `notify.ts`.
- **`findStayClash()` now makes a network call.** After the local checks pass it
  asks the connected channels directly, to cover the minutes between two
  scheduled syncs. It short-circuits on one indexed query when the property has
  no feed, and **returns null when a channel is unreachable** — never fail a
  booking because an OTA was down.
- **`ical_export_document()` is a second copy of `listUnavailable()`'s rules**
  (src/lib/availability.ts), in SQL, because a Deno edge function cannot import
  the app's TypeScript. Cancelled frees its nights, a ticked-out short stay
  frees its date, a block is inclusive. Change one, change the other.
- **A published export URL is a credential.** It is fetched anonymously, so
  anyone holding it sees those dates. That is why the document carries dates and
  nothing else — never add a guest name, phone or price to it.
- **OTA sync is asymmetric and only half of it can be fast.** Reading Airbnb's
  `.ics` is on our schedule, so it can be near-live. Airbnb re-reads *our* feed
  on its own schedule (~2h) and nothing can hurry it — so never describe the
  app→channel direction as real-time, and close the gap by checking the feed at
  booking-save time instead.
- **Browser push needs three env vars** — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (the sender has to read
  other users' subscriptions, which no session may do). Without them `push.ts`
  does nothing and the settings panel says push is not configured — the bell,
  the feed and the realtime updates are unaffected. `VAPID_SUBJECT` is optional.
- **`notify_daily_stays()` runs on pg_cron at 02:00 UTC = 07:00 Karachi**
  (`cron.job`, name `hostello-daily-stays`). It writes today's arrival/departure
  notifications; the `event_key` makes a re-run a no-op. It cannot send push —
  push is sent from the Next server, and nothing external can call a Server
  Action — so cron-born notifications reach the bell and Realtime only.
- Vercel is git-connected to `milocplusplus/Hostello-PMS`, production branch
  `main` — **pushing to main is the deploy**. There is no Vercel CLI auth and no
  `.vercel/` link on this machine, so `git push` is the only mechanism.
- `AGENTS.md` is regenerated by `next dev`; edits there get overwritten.
- Env: copy `.env.local.example` → `.env.local` before `npm run dev`.
