# State — updated 2026-08-27

## Done
- Phase 0 audit of the whole codebase (architecture, schema, reusable pieces, risks)
  — captured in `context.md`.
- Phase 1 (design system + shell): tokens, grouped sidebar, top bar, global search
  wired to a real Server Action. Deployed to Vercel and verified.
- Source pushed to `github.com/milocplusplus/Hostello-PMS` (`main`, commit `2e0cc88`).
- **Phase 2 (Admin dashboard)** — `src/app/admin/page.tsx` rewritten; new
  `src/components/admin/{BookingActivity,Sparkline,RevenueChart,AddBookingMenu}.tsx`
  and `src/components/shared/{Avatar,StatusChip}.tsx`. Occupancy = occupied ÷ total
  property-nights this month; sparklines/revenue chart are real cumulative series,
  empty states when flat. Deployed 2026-08-25.
- **Phase 3 (Calendar)** — built and deployed 2026-08-25. `npm run build` and
  `npm run lint` clean (2 pre-existing unused-import warnings in untouched files).
  - `src/app/admin/calendar/page.tsx` rewritten as a CSS-grid timeline. Bars span
    their date range via `grid-column: start / span n`; day cells sit under them at
    `grid-row: 1 / -1`. Overlapping bars get their own lane (greedy assignment), so
    a block and a booking on the same nights stack instead of overlapping.
  - `src/components/admin/CalendarBoard.tsx` (client) — sticky property column with
    type · city subtext, client group headers with collapse chevrons, today column
    tinted + gold left rule across every row, weekend tint, empty cells link to
    `/admin/bookings/new?property=&date=`. Bars show channel badge + guest name,
    plus amount at span ≥ 3 and date range at span ≥ 6.
  - `src/components/admin/CalendarFilters.tsx` (client) — All properties (optgrouped
    by client) / All channels / All status, pushed into the URL; server does the
    filtering. Blocks drop out when a channel or status filter is on, since they
    carry neither.
  - Month · Week toggle, prev/next, and `Showing 1–7 of N properties` pagination
    (7 per page) all live in searchParams.
  - `src/app/admin/bookings/[id]/page.tsx` — new booking detail route (stay, units,
    payout breakdown from the snapshots, notes, mark received / cancel). This is
    what the calendar bars link to; it was the blocker listed last session.
  - `src/lib/calendar.ts` gained `weekdayShort`, `isWeekend`, `startOfWeekISO`,
    `daysFrom`, `formatRangeLabel`; `property-types.ts` gained `propertyTypeLabel`.
  - `sourceColor` in `block-sources.ts` now gives `client`/`offline`/`reference`
    distinct colors (the old default collided with the Blocked legend swatch).
    This also changes the dashboard's channel dots.
  - `markBookingSettled` / `cancelBooking` / `createBooking` now also
    `revalidatePath("/admin/bookings/[id]", "page")`.
- **Phase 3 refinements** (2026-08-25, after review). `npm run build` + `npm run lint`
  clean (same 2 pre-existing warnings).
  - Calendar pagination removed — every client and property renders in one board.
    Client group headers still collapse; the footer now reads "N properties across
    M clients". The `page` search param is gone.
  - Clicking an empty day no longer navigates: `CalendarBoard` opens a
    `QuickAddBooking` modal (same file) holding the shared `BookingForm`, prefilled
    with that property, check-in = the clicked day, check-out = the next day (one
    night). Esc or backdrop closes; success closes + `router.refresh()`.
  - `createBooking` was split: `saveBooking()` holds all validation/insert/notify
    logic and returns a result; `createBooking` redirects as before,
    `createBookingInline` returns `{ error }` for the modal. One write path.
  - `BookingForm` gained `initialCheckOut` and a `useFormStatus` submit button
    (disabled + "Saving…"), so the modal can't be double-submitted.
- **Admin-set client passwords** (2026-08-25). `set_client_password(client_id,
  password)` — SECURITY DEFINER, admin-only, bcrypts straight into `auth.users`
  and deletes that user's `auth.sessions` so the old password can't ride a live
  session; `revoke execute … from anon` like the other admin RPCs. Server Action
  `setClientPassword` in `admin/clients/actions.ts`; the Portal login card on
  `/admin/clients/[id]` now shows the email plus a "Set password" field.
  No service-role key involved — this follows the existing `create_client_login`
  RPC pattern instead. **Applied to the live DB** (migrations
  `add_set_client_password` + `restrict_set_client_password_to_authenticated`;
  the repo file folds both together). Verified: admin + client-without-login →
  "This client has no login yet", admin + 7-char password → refused, no session
  → "Only admins can set client passwords", and `anon` has no EXECUTE.
  - **Also fixes `create_client_login`, which was broken**: pgcrypto lives in the
    `extensions` schema, but the function pinned `search_path` to `public, auth`,
    so `crypt()`/`gen_salt()` could not resolve — every "Create login" would have
    failed with `function gen_salt(unknown) does not exist`. (Verified against the
    live DB with a throwaway probe function.) The migration adds `extensions` to
    its search_path. The 4 existing client logins predate this and are fine.
  - Deliberately NOT built: Maintenance bar type (needs a `calendar_block_type`
    enum migration), property thumbnails and "4BR · Max 10 guests" (no columns),
    Timeline view (deferred).

- **Phase 4 (Management pages + client portal parity)** — built 2026-08-25,
  deployed 2026-08-25 as `dpl_DoD7ZQprLYSxQBJFvTJhDSZkYWTF` (READY, production).
  `npm run build` and `npm run lint` both clean (the 2
  old unused-import warnings are gone — those files were rewritten).
  - `src/app/admin/bookings/page.tsx` — rows now link to `/admin/bookings/[id]`
    (the leading Guest cell is the anchor; Mark received / Cancel stay as forms
    in the last cell, so no nested-form-in-link). New `BookingFilters.tsx`
    (client) puts guest search + client / channel / status / settlement into the
    URL; the server filters. Status now includes "Cancelled only" — cancelled
    bookings had been invisible everywhere. A guest search drops the month window
    and looks across all dates (newest first), otherwise the month nav applies
    and carries the other filters. KPI totals reflect the filtered set and skip
    cancelled rows.
  - `src/app/admin/clients/page.tsx` — plain GET `<form>` search over name /
    email / phone (no client JS; commas and parens are stripped because
    PostgREST splits `or()` on them), `Avatar` instead of the local `initials()`,
    deal-model label, and per-client open-booking count + awaiting payout from
    one bounded query (`check_out >= today`).
  - `src/app/admin/clients/[id]/page.tsx` — `Avatar`, plus a Bookings section
    (6 most recent, linking to the booking detail) with the client's awaiting
    total and an "All bookings →" link to `/admin/bookings?client=<id>`.
  - `src/app/client/page.tsx` — rebuilt to Phase 2 standard: 4 `Kpi` cards with
    sparklines (properties / occupancy / revenue / your payout, the last two with
    `Delta`), cumulative payout `RevenueChart`, nights donut, `BookingActivity`
    tabs, quick actions. Occupancy uses the same property-nights math as the
    admin dashboard, scoped to the owner's active properties.
  - `Kpi`, `Delta`, `OccupancyDonut` moved out of `admin/page.tsx` into
    `src/components/shared/Kpi.tsx` — both dashboards import them now.
  - `src/app/client/calendar/page.tsx` — rebuilt on the shared `CalendarBoard`
    (the local `SOURCE_COLOR` map is gone). Month view only, no filters: one
    owner, few properties. Bars show the **client payout**, never Hostello's
    share, and link to the new `/client/bookings/[id]`.
  - `CalendarBoard` no longer imports the admin action. It takes
    `createAction` (typed `InlineCreate`) so each portal passes its own write,
    plus `groupHeaders` (false on the client side — one client, no point
    collapsing its own name).
  - `client/bookings/actions.ts` split the same way Phase 3 split the admin one:
    `saveClientBooking()` returns a result, `createClientBooking` redirects,
    `createClientBookingInline` feeds the calendar modal. One write path, and the
    ownership checks now cover the quick-add too.
  - `src/app/client/bookings/[id]/page.tsx` — new owner-facing booking detail
    (stay, units, payout breakdown without `hostello_share`, notes, cancel).
    Scoped by `client_id` on top of RLS. The bookings list rows link to it.
  - Checked: `bookings.settled` is `NOT NULL DEFAULT false`, so the settlement
    filter can use `.eq()`; and the `bookings` RLS policy is `ALL` scoped to
    `owner_user_id`, so `cancelClientBooking` can't touch another client's row
    even though it takes a bare id.

- **Per-client OTA terms** (2026-08-25). Airbnb / Booking.com bookings now settle
  on their own per-client rule instead of the base deal model: `none` (Hostello
  earns nothing, the whole net goes to the owner), `percent` (its own
  `ota_share_percent`), or `stack` (whatever clears the property's stack rate).
  Everything else — Hostello, offline, reference, client — still follows
  `deal_model`, and self-sourced / tentative still earn zero first.
  - Migration `20260825210000_add_client_ota_terms.sql`, **applied to the live DB**:
    `client_ota_model` enum, `clients.ota_model` / `ota_share_percent`, and
    nullable `bookings.ota_model_snapshot` / `ota_share_percent_snapshot`.
    Existing clients were backfilled from their deal model (percent / fixed_percent
    → percent at the same %, ads / fixed_stack → stack, fixed → none), so nobody's
    numbers moved. Pre-migration bookings have a null OTA snapshot by design.
  - `payout.ts` stays the only revenue math: new `OtaModel`, `OTA_MODELS`,
    `isOtaSource()`, and two required `PayoutInput` fields, so every call site has
    to pass the terms.
  - Set on `ClientForm` (new *and* edit, so existing clients too); shown on
    `/admin/clients/[id]`, in the `BookingForm` live preview once an OTA channel is
    picked, and as the "terms as of booking" line on `/admin/bookings/[id]`.
  - `npm run build` and `npm run lint` clean. Payout branches spot-checked at
    runtime (OTA none / percent / stack, tentative, self-sourced, non-OTA).
  - Deployed 2026-08-25 as `dpl_4j9uo1PSPn9Bubh76czhM5stgVSw` (READY, production,
    commit `2ebdf04`).

- **Installable app (PWA)** — built and deployed 2026-08-25 as
  `dpl_EUiAFffsPJxnQ196unpi5JnJrf65` (READY, production, commit `29dc00a`).
  Verified live on `hostello-pms.vercel.app`: service worker registers and
  activates, `/manifest.webmanifest` serves, all four manifest icons and the
  apple-touch icon return 200 `image/png`, `/offline` precaches, no console
  errors. The app installs to an Android or iOS home screen from the browser and
  runs standalone (no address bar). No rewrite — the same server-rendered app,
  wrapped.
  `npm run build` and `npm run lint` clean.
  - `src/app/manifest.ts` — Next metadata route, served at `/manifest.webmanifest`.
    `display: standalone`, theme + background `#0a0910`, `start_url: "/"` so the
    installed icon lands each role on its own dashboard through the existing
    redirect. Icons in `public/icons/` (192/512 `any` + 192/512 `maskable` +
    a 180 `apple-touch-icon`) — purple→gold gradient with a white H monogram,
    generated with GDI+ (`System.Drawing`), no image dependency added.
  - `public/sw.js` — deliberately narrow. Every page here is per-user HTML, so
    **nothing personalized is ever cached**: content-hashed `/_next/static/` and
    `/icons/` are cache-first, navigations are network-only falling back to a
    precached `/offline`, and everything else (Server Actions, RSC payloads,
    Supabase) passes straight through. Bump `CACHE_VERSION` to evict.
  - `src/app/offline/page.tsx` — the fallback. Verified for real: with the server
    stopped, a navigation to `/admin/bookings` rendered it instead of a browser
    error page.
  - `src/components/shared/PwaSetup.tsx` (in the root layout) — registers the SW
    **in production only** (in dev, cache-first hands back stale Turbopack chunks
    and looks like a phantom bug) and shows the install banner: one-tap Install on
    Android via `beforeinstallprompt`, and the Share → Add to Home Screen
    instruction on iOS, which fires no such event. Dismissal sticks in
    localStorage. Install eligibility is read through `useSyncExternalStore`, not
    an effect — React 19's `set-state-in-effect` lint rule rejects the effect
    version, and this keeps SSR rendering nothing so there is no hydration gap.
  - Mobile fixes in `globals.css`: `.safe-topbar` / `.safe-panel` / `.safe-main`
    pay back `env(safe-area-inset-*)` (both shells use them; they resolve to the
    exact old padding on a phone with no notch), `min-h-screen` → `100dvh`, and
    inputs are forced to 16px under 768px — below that iOS zooms the page in on
    focus, and every form here is `text-sm`. That last one needs `!important` to
    outrank the Tailwind class; it is one rule instead of ~20 edited inputs.
  - `src/middleware.ts` matcher now also skips `sw.js`, `manifest.webmanifest`
    and `icons/` — all public, and they were costing a session lookup each.
  - Not built: native Play Store / App Store packages. That is a Capacitor shell
    around the deployed URL and is the agreed next step, not a rewrite. **iOS
    cannot be built on this machine** (Windows) — it needs a Mac or a cloud
    builder. Also skipped: push notifications, and a bottom tab bar for phones
    (the drawer nav in both shells is what mobile still uses).

- **Token receipts** (2026-08-25). A booking can now carry the screenshot that
  proves the advance token moved — either direction: received from the guest by
  Hostello, or paid on to the client. `npm run build` and `npm run lint` clean.
  Deployed 2026-08-25 as `dpl_71Bb8M1LxqB5V7KEyLS53HfrFmca` (READY, production,
  commit `2b64f93`); `/login` 200 and the gated routes still 307 on
  `hostello-pms.vercel.app`.
  - Migrations `add_booking_token_receipts` +
    `fix_booking_receipt_storage_policy_name_capture`, **applied to the live DB**
    (the repo holds one corrected file, `20260825230000_add_booking_token_receipts.sql`,
    so a fresh DB gets the fixed version in one step). New
    `booking_receipt_kind` enum and `booking_receipts` table, plus a **private**
    `booking-receipts` storage bucket capped at 8 MB and limited to
    png/jpeg/webp/heic/pdf.
  - `src/lib/receipts.ts` is the only code that touches the bucket:
    `validateReceipt` (size + type, run *before* the booking is written so a bad
    file can't strand a saved booking), `attachReceipt` (upload then insert;
    removes the file if the row fails), `listReceipts` (rows + 1-hour signed URLs).
  - `src/components/shared/BookingReceipts.tsx` — thumbnail grid + upload form,
    shared by both portals. The client portal passes no `uploadAction`/`deleteAction`,
    so it renders read-only, and only when there is something to show.
  - `BookingForm` gained an optional file input + "receipt is for" select under
    **More details**, next to Advance received — so the screenshot can go on at
    creation time, which is when the token actually arrives. Both `saveBooking`
    and `saveClientBooking` attach it after the insert, best-effort like `notify.ts`.
  - `uploadBookingReceipt` / `deleteBookingReceipt` in
    `admin/bookings/actions.ts` handle after-the-fact attachments from
    `/admin/bookings/[id]`; errors come back through `?receipt_error=`.
  - `next.config.ts` sets `experimental.serverActions.bodySizeLimit: "10mb"` —
    the 1 MB default rejects an ordinary phone screenshot.
  - RLS verified by probing as each role: a client can attach to their own
    booking and read only their own objects; a spoofed `uploaded_by`, a foreign
    booking id and a foreign storage folder are all denied; admins see and write
    everything. **A real bug surfaced and was fixed here** — the first version of
    the storage policies used a bare `name`, which bound to `clients.name` instead
    of the object path and denied every client upload. See the gotcha in
    `context.md`.
  - **Not verified in a browser**: the upload round-trip (Server Action → Storage
    API → signed-URL render) needs a signed-in session, and there are no
    credentials on this machine. Worth doing on first login.

- **Token receipts are Hostello's to upload** (2026-08-25, after the above went
  out). The first cut let a client attach one to their own booking; the intended
  flow is staff-uploads / client-reads, so the write path is gone on the client
  side. `npm run build` and `npm run lint` clean.
  - Migration `restrict_booking_receipt_uploads_to_admins`, **applied to the live
    DB**: drops `booking_receipts: client attaches to own bookings` and
    `booking receipts: client uploads to own booking`. Each side is now one
    admin-all policy plus one client-select policy.
  - `BookingForm` takes `allowReceipt` (default true); the client portal's
    `bookings/new` and `CalendarBoard` (which threads it to the quick-add modal)
    pass `false`, so the field isn't shown where it wouldn't work.
  - `saveClientBooking` no longer touches receipts at all.
  - `notifyBookingCreated` gained an optional `advanceReceived` and appends
    "Token received: Rs X" to the body when there is one — so the booking
    notification itself tells the client the token landed, and the receipt is on
    the booking it links to.
  - Re-probed per role: admin upload OK; the client sees the row and the file
    (1 each) but is DENIED on both the table insert and the storage insert.
  - Deployed 2026-08-25 as `dpl_6udvjNvVe1WeAbpRC6JPeq69R5EF` (READY, production,
    commit `9d13783`).

## Deployment
Vercel project `hostello-pms` (`prj_HRnVSD9I0OnA2oINYxplGp9KRYsM`, team
`team_mSNnhApqjbhfTQv1bDziZKMp`) is now **connected to
`milocplusplus/Hostello-PMS`, production branch `main`** — pushing to main deploys.
Phase 2 + 3 shipped as `dpl_7JfmujCpqA8LueTG5gujr3VhiucB` (READY, production) on
`hostello-pms.vercel.app`.

**The Supabase URL and anon key now live in `src/lib/supabase/config.ts`**, not in
env vars. `server.ts`, `client.ts` and `middleware.ts` all read from there. An env
var overrides the default only when set *and* made entirely of printable ASCII —
because the Vercel env var was once saved as Supabase's **masked** key display
(`eyJhbGci` + ~400 `U+2022` bullets), and `fetch` refuses to put a non-Latin-1
character in an HTTP header, so every auth call died with "Cannot convert argument
to a ByteString" and the login form reported it as a wrong password. Both values
are public by design (`NEXT_PUBLIC_*` is inlined into the client bundle, so the
anon key is already downloadable); RLS protects the data. To verify what is
actually deployed, download `/_next/static/immutable/chunks/*.js` and grep.

**Env vars (legacy):** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are set on the Vercel project as **Config** (not Secret) across all environments.
The anon key one still holds the corrupted bulleted value; it is now ignored. They
were missing when Git deploys started — the earlier uploads had the values baked
in, so the first Git build shipped without them and every route 500'd with
`MIDDLEWARE_INVOCATION_FAILED` ("Your project's URL and Key are required to create
a Supabase client"). Two things to remember: `NEXT_PUBLIC_*` is inlined at **build**
time, so changing a value needs a rebuild, not a restart; and Vercel's "Secret"
type does not work for these — `NEXT_PUBLIC_*` must be Config to reach the browser.

Connecting Git does **not** itself trigger a build; it took a push. There is no
Vercel CLI auth and no `.vercel/` link on this machine, so `git push` is the
deploy mechanism. Do not use the Vercel MCP `deploy_to_vercel` file-tree upload —
the tree is ~290 KB and does not fit in one tool call; an attempt on 2026-08-25
went out two-thirds complete and failed to build
(`dpl_3yoDuQWkADtrPfj6AnYdrAQ1e8xG`, ERROR). A failed production build does not
reassign the alias, so nothing broke.

- **Real logo on the app and the icons** (2026-08-25, deployed as
  `dpl_BCzXuRfMx1n8HVWTmcMToDQGZaqU`, READY, production). `npm run build` and
  `npm run lint` clean.
  - `src/components/shared/HostelloMark.tsx` — the mark traced off the supplied
    logo files: two front panels shearing down to the right, each with its side
    face folded back and shearing up. viewBox `0 0 100 117`, so `size` is the
    height and the artwork is narrower than it is tall. Front faces white, side
    faces purple (the logo itself is mono silver — flip the two gradient stops
    if that is ever wanted).
  - It replaces the `Building2`-in-a-gradient-square placeholder in `AdminShell`
    and `ClientShell`, and the plain purple square on the login,
    forgot-password and reset-password pages. Sidebar "PMS" is purple now, not gold.
  - Every icon in `public/icons` and `src/app/favicon.ico` regenerated from the
    same geometry with GDI+ (there is no `sharp` here). The generator lives in
    the session scratchpad, not the repo — the polygon table in `HostelloMark.tsx`
    is the source of truth; redraw from it if the icons ever need regenerating.
  - **Icon URLs carry `?v=2` and `sw.js` `CACHE_VERSION` is now `v2`.** `/icons/`
    is cached cache-first by the service worker, so without both an already
    installed app keeps serving the old artwork forever. Any future icon change
    needs the same pair of bumps.

- **Calendar rebuilt as two levels** (2026-08-25, deployed as
  `dpl_9PWgQtbq26GHGynpnCFpoZcHfxp6`, READY, production, commit `6e7dd71`).
  Every client and every property in one board was unnavigable — that was the
  brief. `npm run build` and `npm run lint` clean.
  - `/admin/calendar` with no `?client=` is now the **portfolio overview**:
    `src/components/admin/CalendarOverview.tsx`, one row per client, one cell per
    day, shaded by `occupied ÷ that client's property count`, plus `N properties ·
    P% booked · A arriving`. The strip is a fluid `repeat(N, minmax(0,1fr))` grid,
    so it never scrolls sideways at any width. Click a row → `?client=<id>`.
  - `?client=<id>` is the old timeline, scoped. Breadcrumb back, a client `<select>`
    to hop sideways, property/channel/status filters scoped to that client. A bare
    `?property=` (the link on `/admin/clients/[id]`) resolves to its owning client,
    so old links still land.
  - **The all-clients-in-one board is deliberately gone.** The heat strip answers
    "who has space" and the click-through gives the detail. If it is ever wanted
    back, it belongs behind an explicit toggle, not as the default.
  - `CalendarBoard` takes flat `rows` now, not `groups` — the group-header /
    collapse machinery went with the portfolio board. Its name column is
    `[--cal-name:124px] md:[--cal-name:200px]`.
  - New third view **Agenda** (`src/components/shared/CalendarAgenda.tsx`), on both
    portals: per day, departures then arrivals then `X of Y units occupied`; quiet
    days skipped; today always shown. Reads the same `rows`. This is the phone
    answer — the month timeline is ~1180px wide inside a 327px card, measured.
  - `CalendarSegment` gained `startDate` / `endDate` (inclusive last night) so the
    agenda can show the true, unclipped range and night count; `calendar.ts` gained
    `daysBetweenISO`.
  - The client portal renders the identical scoped screen — same board, same
    Month · Week · Agenda toggle, same agenda component. Week view and the "Today"
    jump are new on that side.
  - **Verified by rendering, not by signing in.** There are still no credentials on
    this machine, so the real pages could not be opened. Instead the three
    components were rendered with sample data on a throwaway route and checked in a
    browser: nights/occupancy counts correct, no console errors, page body never
    scrolls sideways at 375px, overview strips align with their header at 1280px.
    The route was deleted before committing. Production smoke test after deploy:
    `/login` 200, `/admin/calendar` and `/client/calendar` 307.

- **Dashboard build-out from the design inspo** (2026-08-25, deployed as
  `dpl_7M9vya9UmAwB8GpG7k4NC9KtpMoG`, READY, production, commit `21e4687`).
  Five features, both portals, all backed by real tables — nothing invented.
  `npm run build` and `npm run lint` clean. Production smoke test after deploy:
  `/login` and `/manifest.webmanifest` 200; `/admin`, `/admin/today`,
  `/admin/notifications`, `/admin/calendar`, `/client`, `/client/today`,
  `/client/notifications` all 307 to login.
  - **Notification bell in both top bars** (`src/components/shared/NotificationBell.tsx`):
    unread badge, last 8 items, Mark all read, "View all". Fed from the layouts,
    so it is on every page of both portals.
  - **Admin activity feed** at `/admin/notifications` — the recorded debt. Admins
    already had `notifications: admin full access`; what was missing was their own
    read state. Migration `add_notification_admin_read_state`, **applied to the
    live DB** and committed: `notifications.admin_read_at`, a partial index, and a
    `before update` trigger that reverts the column unless `is_admin()` — RLS
    cannot scope a single column and the client UPDATE policy covers every column
    of their own rows. All / Unread filter, per-row and bulk mark-read.
    `notify.ts` now writes "Payout: Rs X" instead of "Your payout: Rs X", since
    both audiences read the same row.
  - **Client portal desktop top bar** — search + Add booking + bell + user menu,
    matching admin. `GlobalSearch` took a `searchAction` prop instead of importing
    the admin action; new `src/app/client/search/actions.ts` searches the owner's
    own properties and bookings (RLS scopes it; the hrefs are what differ).
    `UserMenu` moved out of `AdminShell` into `src/components/shared/`.
  - **Day sheet** at `/admin/today` and `/client/today`, shared
    `src/components/shared/TodayBoard.tsx`: arriving / departing / staying tonight
    with guest, unit, channel, nights, amount and a `tel:` link, plus payments
    pending (admin, same definition as the dashboard tile) and blocks covering
    today. Both dashboards' Today tiles now link into it; the client dashboard
    gained the whole Today's summary panel it never had.
  - **Revenue period selector** on both dashboards (`?period=`, `src/lib/period.ts`):
    this month / last month / last 3 months / this year, each compared with the
    same span one period back. KPI cards stay on the current month, as in the
    inspo. `Delta` no longer says "last month" when the window is not a month.
  - Verified by rendering, not by signing in — still no credentials on this
    machine. The bell, day sheet, period select and user menu were rendered with
    sample data on a throwaway route: dropdown opens with the right counts, no
    console errors, no sideways scroll at 375px. The bell panel was hanging 60px
    off-screen left on a phone (right-anchored to a button that is not at the
    right edge) — its width is now `min(22rem, 100vw-6rem)`. Route deleted.
  - Not built: nav for Channels / Pricing / Expenses / Payouts / Reports (no
    tables), property thumbnails and "4BR · Max 10 guests" (no columns), the
    Maintenance bar type (needs an enum migration).


- **Latency pass — the app was slow because the server was on the wrong
  continent** (2026-08-25). `npm run build` and `npm run lint` clean. **Not yet
  deployed.**
  - **The cause.** Supabase lives in `ap-southeast-2` (Sydney). Vercel was
    running the functions in `iad1` (Washington DC) — the default — so every
    single query crossed the Pacific and back at roughly 220 ms a go, and a page
    load makes four to seven of them one after another. Measured from Karachi:
    `x-vercel-id: bom1::iad1::…`, `/login` 520 ms with no session and no
    database work at all.
  - **`vercel.json` pins the functions to `syd1`**, next to the database. That
    turns each of those round trips from ~220 ms into single-digit
    milliseconds. It is one line and it is the whole fix; everything below is
    the same problem attacked from the other side, by making fewer trips.
    Confirm it took after the next deploy: `x-vercel-id` should read
    `bom1::syd1::…`. Middleware still runs at the edge near the user, which is
    where it belongs.
  - **`src/lib/auth.ts`** — `currentUser()`, `currentProfile()`,
    `currentClient()`, each wrapped in React's `cache()`. Every page was
    re-running the exact lookups its own layout had just done: `getUser()` was
    called in the middleware, the layout *and* the page, and all eight client
    portal pages re-fetched the `clients` row the client layout already had.
    Now it is one call per request no matter how many callers ask. `currentClient()`
    selects the superset of columns the portal uses, so one cached row serves
    every page.
  - **Waterfalls flattened.** The admin layout fires the profile and both
    notification queries together instead of chaining them. Both calendars send
    the block lookup alongside the booking-link lookup rather than behind it,
    and the admin calendar's property and client-terms queries now go out
    together. On a client calendar load that is 11 database calls down to 8, and
    the longest chain 7 deep down to 6.
  - **`loading.tsx` in both portals** (`src/components/shared/PageSkeleton.tsx`,
    plus a `.skeleton` utility and a `prefers-reduced-motion` block in
    `globals.css`). There was no loading boundary anywhere in the app, so every
    navigation sat on the previous screen until the server answered — which is
    what "unresponsive" actually looked like. The skeleton paints instantly and
    the real page streams in behind it. It also switches Next's `<Link>`
    prefetching on for these dynamic routes, which is why the nav now feels
    instant rather than merely fast.
  - **Middleware matcher narrowed** to `/`, `/login`, `/admin/*`, `/client/*`.
    It was an exclude-list, so `/offline`, `/auth/forgot-password` and
    `/auth/reset-password` were each paying for a Supabase session lookup they
    had no use for.
  - **`supabase/migrations/20260825233000_rls_initplan_and_fk_indexes.sql` is
    written but NOT APPLIED** — the tool call was blocked. It does two things
    Supabase's performance linter asks for: rewrites 13 policies so `auth.uid()`
    is `(select auth.uid())` (bare, it is re-evaluated once per row; wrapped, it
    is an InitPlan evaluated once per statement — same rows either way), and
    adds covering indexes for five unindexed foreign keys. It uses `ALTER POLICY`,
    not drop-and-recreate, so no policy is ever briefly missing. Worth applying,
    but note it changes **nothing** at today's data volumes — the database was
    never the bottleneck.
  - Verified: build and lint clean; `PageSkeleton` rendered on a throwaway route
    and checked in a browser (53 blocks, `surface-2`, pulse running, no sideways
    scroll at 375 px or 1280 px, no console errors — route deleted); and against
    the dev server, `/`, `/admin`, `/admin/bookings`, `/client`,
    `/client/calendar` all still 307 to `/login` while `/login`, `/offline`,
    `/manifest.webmanifest`, `/sw.js` and `/icons/*` all 200 — the narrowed
    matcher did not open a hole.
  - **Not verified: the signed-in pages.** Still no credentials on this machine.
    The round-trip reduction is structural and readable in the diff, but the
    before/after timings can only be taken with a real session.
  - Deployed 2026-08-25 as `dpl_384kwQMRXUujSE9cS3QitDx4rxqh` (READY, production,
    commit `e1745bb`). Vercel reports `regions: ["syd1"]` and the response header
    now reads `x-vercel-id: bom1::syd1::…` — the pin took. Smoke test after deploy:
    `/login`, `/offline`, `/sw.js`, `/manifest.webmanifest`, `/icons/*` and
    `/favicon.ico` all 200; `/`, `/admin`, `/admin/bookings`, `/admin/calendar`,
    `/admin/today`, `/admin/notifications`, `/client`, `/client/calendar`,
    `/client/today`, `/client/notifications` all 307 to login. The public routes
    time the same as before, as they should — they make no database calls, so
    they were never what was slow. **The gain is on the signed-in pages and has
    not been measured.**
  - **Left alone on purpose.** `next build` warns that the `middleware` file
    convention is deprecated in favour of `proxy` — the app's entire auth gate
    lives in that file, `node_modules/next/dist/docs/` is unreadable in this
    session, and a deprecation warning is not worth guessing at the migration
    for. Also left: the two "unused index" lint hits, which mean nothing on a
    database with no traffic yet.

- **Phone layout pass** (2026-08-27). The screens that still did not fit a phone
  now fit one. `npm run build` and `npm run lint` clean. **Not yet deployed.**
  - **The three tables were the whole complaint.** `/admin/bookings`,
    `/client/bookings` and the dashboard's Recent bookings each sat in a
    `min-w-[720px]` (640 for the client one) box inside a ~343px card, so a phone
    got a sideways-scrolling strip. They now drop their secondary columns under
    `md:` (`hidden md:table-cell`) and fold that content — channel dot, dates +
    nights, amount, status — into a wrapped line under the guest/unit name.
  - **`table-fixed md:table-auto` is the part that actually makes them fit.**
    Hiding the columns alone was not enough: `truncate` sets `white-space: nowrap`,
    and in an auto-layout table the cell's min-content width is then the whole
    untruncated string, so the row still overflowed (measured: 454px in a 342px
    box). Fixed layout ignores content min-widths, and the last column carries an
    explicit `w-[104px]`/`w-[76px]`/`w-[92px]` (`md:w-auto`) so the name column
    gets the rest. Verified at 375px: table 342px, no overflow, name ellipsised;
    at 1280px the layout is byte-for-byte the old desktop one.
  - **The calendar picks its own view on a phone.** A month of 34px cells is
    ~1180px wide. With no `?view=` in the URL, `autoAgenda` renders the agenda
    inside `md:hidden` and the board inside `hidden md:block` — phone gets the
    agenda, desktop the month board, no client JS and no viewport sniffing.
    Asking for `?view=month` explicitly still gets the (scrollable) board on both.
    The Month/Week/Agenda pills highlight per width to match, and the board legend
    is hidden on the phone when the board is. Both portals.
  - Smaller: KPI cards `p-4 md:p-6` with the figure `text-lg md:text-xl truncate`,
    empty states `p-8 md:p-10`, the bookings search box full-width below `sm:`,
    and the two portal-login forms on `/admin/clients/[id]` stack instead of
    running a 192px input and a button off the card edge.
  - **Verified by measuring, not by signing in** — still no credentials on this
    machine. The exact post-fix class strings were rendered at 375px and 1280px in
    a browser and measured (`scrollWidth` vs `clientWidth` on the card, cell
    widths, ellipsis state, computed `table-layout`). `/login` has no overflowing
    element at 375px.

- **Notification system, rebuilt around recipients** (2026-08-27). `npm run build`
  and `npm run lint` clean. Migrations **applied to the live DB** and committed.
  **Not yet deployed.**
  - **The model changed.** `notifications` was one row per client-event with two
    read marks bolted on (`read_at`, `admin_read_at`) — which meant one admin
    marking something read marked it read for every admin, and there was nowhere
    to hang a per-user preference or device. Now: `notifications` is one row per
    **event**, `notification_recipients` is one row per **person**, and the
    recipient row is simultaneously the permission (RLS: `user_id = auth.uid()`),
    the read state and the realtime channel. Both old columns are gone, backfilled
    into recipient rows first. `kind` is text now, not an enum — a new event type
    was a migration before.
  - **Routing lives in the database.** `audience` (`admin|client|both`) plus
    `client_id` go in; an `after insert` trigger fans out to every admin and to
    the owning client's portal user, and **never to `actor_user_id`** — you are
    not told about your own action. Anything that can insert a row gets this for
    free, which is what lets the cron job and (later) a mobile backend reuse it.
  - **`emit_notification` is the only door.** Clients have no INSERT policy on
    `notifications` and must not get one, but a client session still has to be
    able to tell the admins it just booked something. The RPC is SECURITY DEFINER
    and checks `is_admin() or owns(p_client_id)`. Verified by impersonating real
    users in SQL: a client emitting for their own client → 1 recipient, the admin,
    and not themselves; the same client naming *another* client → refused, 0 rows;
    an admin emitting for a client → the owner only; a second client sees none of
    it. Execute is granted to `authenticated` and revoked from `public, anon`.
  - **Duplicates die on `event_key`.** Every emitter names its event
    (`booking_created:<id>`, `checkin:<id>:<date>`, `client_terms_updated:<id>:<day>`)
    behind a partial unique index, and `on conflict do nothing` returns null, which
    also skips the push. Verified: the second insert of a key wrote nothing.
  - **Events wired, all from things that actually happen here:** booking created
    (both portals — the client-entered one notified nobody before), booking
    cancelled (ditto), payout settled, **token/payout receipt uploaded**, dates
    blocked, **dates unblocked** (the `dates_unblocked` kind existed and nothing
    ever emitted it), **block written over an existing booking** (critical — the
    app rejects block-on-block overlaps but never checked bookings, so this was
    silent), property added/removed, payout terms changed (only when the numbers
    really changed, at most once a day), and **today's arrivals/departures** from
    pg_cron at 07:00 Karachi.
  - **No notifications were invented for modules that do not exist.** Guest
    messaging, housekeeping, maintenance, staff assignment and OTA sync have no
    tables, no UI and no data — so they have no events. That was a deliberate
    call, not an oversight.
  - **Realtime** is a subscription to `notification_recipients` filtered by
    `user_id`; the handler calls `router.refresh()` so the server-rendered bell
    and counts stay the single source of truth, then plays the tone and shows a
    toast. `notification_recipients` is in the `supabase_realtime` publication.
  - **Push** is `web-push` from the Server Action that caused the event, reading
    subscriptions with the service-role key (no session may read another user's
    devices). Missing keys = push silently off, everything else unaffected. Dead
    endpoints (404/410) are marked `failed_at` and skipped. `sw.js` gained `push`
    and `notificationclick` (focus an existing tab, else open one); CACHE_VERSION
    is `v3`.
  - **Sounds are synthesised** (`notification-sounds.ts`), not files: a rising
    two-note for bookings, a three-note climb for money, one soft note for the
    calendar, a nagging pair for critical. Silent rather than throwing when the
    browser has not had a user gesture yet.
  - **Preferences** (`notification_preferences`) are per user, not per client:
    push on/off, sound on/off, and per-category mutes. Muting silences the sound
    and the push — the row still lands in the feed, so a preference can never lose
    a notification.
  - Both notification pages now share `NotificationFeed` (All / Unread + category
    filters, per-row and bulk mark-read) and `NotificationSettings`. The client
    portal's page was the last one on its original design; it isn't now.
  - **Verified without signing in** — still no credentials on this machine. The
    authorisation, fan-out, actor-exclusion, dedupe and read-isolation claims above
    were each tested against the live database by setting `request.jwt.claims` to a
    real user and running as `authenticated`; all probe rows were deleted (back to
    7 notifications / 14 recipient rows). The new UI was rendered with sample data
    on a throwaway route: filters, rows, mute round-trip (`category_system=false`
    for a muted category), no console errors, no sideways scroll at 375px or 1280px.
    What could *not* be tested here: an actual Realtime message and an actual push
    arriving, both of which need a signed-in browser and the env vars below.
  - **Before push works, three env vars are needed in Vercel and `.env.local`:**
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generated 2026-08-27, in
    the handover message) and `SUPABASE_SERVICE_ROLE_KEY`. `.env.local.example`
    still needs those three lines — this session had no write access to it.

- **"Get the app" button, and the Glass alert tone** (2026-08-27). `npm run build`
  and `npm run lint` clean.
  - **Install button in both sidebars**, above the account row, so it is on every
    page rather than only in the banner that gets dismissed once. Gold button on
    Android/Chrome/desktop; on iPhone it opens the Share → Add to Home Screen
    instruction, since Safari has no install API; **renders nothing once installed**
    — an install control inside the installed app is a dead control.
  - **`src/lib/pwa-install.ts` is new, and fixes a real bug.**
    `beforeinstallprompt` fires once and early — routinely before React hydrates —
    so `PwaSetup`'s effect-registered listener could miss it outright and then
    silently never offer to install. The listener now registers at *module* scope,
    as the bundle loads, and both the banner and the sidebar button read that one
    store through `useSyncExternalStore` instead of racing for the same event.
  - **The button hid itself from most people, and was fixed the same day.** It
    only rendered when the browser had handed over a one-tap install prompt —
    which Chrome does not always do, and Safari and Firefox never do — so on a
    normal desktop it showed nothing at all. It now always renders (except when
    already installed) and opens the instruction for that browser: address-bar
    install icon on Chromium, File → Add to Dock on Safari, Share → Add to Home
    Screen on iOS, ⋮ → Add to Home screen on Android, "pin the tab" on Firefox.
    Verified in a browser at both widths: 231px button above Sign out in the
    desktop sidebar, and the same button inside the phone drawer.
  - **Sound changed from the first-pass tones to "Glass"**, chosen from five
    candidates auditioned on a published artifact (Ripple / Glass / Marimba /
    Pulse / Halo). Glass is a struck bell: the timbre is in the *inharmonic*
    partials (2.76× and 5.4×), which is what stops it sounding like a beep.
    Same motif-per-category idea as before — money climbs three notes, a booking
    is two, a clash nags in pairs.
  - Verified by instrumenting `AudioContext.createOscillator` in the browser and
    clicking "Hear it": 6 voices, two strikes at 1046 and 1568 Hz each carrying
    both partials (2887/5648 and 4328/8467 Hz). The tone that shipped is the tone
    that was picked.
  - Push notifications keep the **OS** sound, not this one. A web push banner's
    sound is a system setting no app can override; these tones play in-app only.

- **The Android app is a real APK** (2026-08-27, deployed as
  `dpl_8e4NQm4wF7unW8LK1QdcwzM43YbN`, READY, production). `npm run build` and
  `npm run lint` clean.
  - **"Get the app" on Android now downloads `/app/hostello.apk`** instead of
    explaining Chrome's ⋮ menu. Same icon as the PWA — Bubblewrap generated the
    launcher and adaptive icons from `icon-512.png` / `icon-maskable-512.png`
    in the live manifest, so there is one icon, not a second lookalike.
  - **What the APK is:** a Trusted Web Activity — an Android shell that opens
    hostello-pms.vercel.app fullscreen through Chrome's engine. It holds no copy
    of the site, so **shipping to Vercel ships to the app**; rebuild only when
    the icon, name or version change. `pk.hostello.pms`, versionName 1.0.0,
    versionCode 1, minSdk 21, notification delegation on (POST_NOTIFICATIONS),
    so the existing web push arrives as app notifications.
  - **`public/.well-known/assetlinks.json`** carries the signing certificate's
    SHA-256 (`DF:0C:29:…:AF:28`). Chrome checks it on launch: match and the app
    has no address bar, mismatch and it looks like a browser in a costume. It is
    public — the middleware matcher is an allow-list and never sees that path.
  - **`next.config.ts` sets two headers**: the APK as
    `application/vnd.android.package-archive` (Android won't offer to install an
    octet-stream) and assetlinks as `application/json`.
  - **Rebuild:** `HOSTELLO_KEYSTORE_PASSWORD=… node android/build-apk.mjs` —
    gradle, then zipalign -c, then apksigner, output straight to
    `public/app/hostello.apk`. Needs only the JDK 17 + Android SDK paths in
    `~/.bubblewrap/config.json` (both installed on this machine, build-tools
    36.1.0); Bubblewrap itself is not needed again unless twa-manifest.json is
    regenerated. Two Windows quirks are handled in the script and worth knowing:
    a shell can leave both `PATH` and `Path` in the environment and the child
    gets the wrong one, and Node will not spawn a `.bat` without a shell.
  - **`android/android.keystore` is gitignored and must be backed up.** Lose it
    and no future APK can update an installed one — users would have to uninstall
    first. The password is not in the repo either; it was handed over in the
    session message.
  - **Verified:** apksigner reports one signer whose SHA-256 matches
    assetlinks.json; aapt2 confirms package, labels ("Hostello" in the launcher)
    and the notification permission; the generated launcher icon is the Hostello
    mark; both new paths serve locally with the right Content-Type; and on an
    Android user agent the sidebar renders a 232×36 gold anchor to the APK that
    reveals the install instruction on tap, while a desktop agent still gets the
    address-bar instruction. **Not verified: installing it on a phone.** No
    Android device here. Both paths are live now and verified in production:
    the APK serves 1,274,310 bytes as `application/vnd.android.package-archive`
    and assetlinks.json as `application/json`.
  - **"Get the app" no longer hides once installed.** It used to render nothing
    when Hostello was already running standalone — which is when someone looks
    for it to install on a second device or pull a fresh APK. It renders in
    every state now; running installed only changes the panel text, so nobody
    is told to click an install icon in an address bar they do not have.

- **Push notifications now behave like app notifications** (2026-08-27).
  They already arrived; they arrived *as Chrome*, silently, in the shade. Three
  separate causes, all in the Android app — the web push path itself was fine.
  `npm run lint` clean. **APK rebuilt and re-signed**: versionCode 2, versionName
  1.1.0, POST_NOTIFICATIONS present, and the signer SHA-256 is still
  `DF:0C:29:…:AF:28` — the certificate assetlinks.json already carries, so it
  installs over v1 and still verifies as a TWA.
  - **Chrome's icon instead of Hostello's** — `LauncherActivity` now asks for
    `POST_NOTIFICATIONS` on Android 13+. Chrome only prompts for the Android
    permission when the *site* asks for its own, and by then the site was
    usually granted permission in the browser already, so the app was never
    asked. Without that permission `DelegationService` reports notifications as
    disabled and **Chrome silently shows the banner itself** — its icon, its
    name. The launch is held back (`shouldLaunchImmediately()` → false) so the
    dialog gets a screen to itself, and `launchTwa()` runs from
    `onRequestPermissionsResult` whichever way it is answered. Verified against
    the library bytecode that `shouldLaunchImmediately` is called from inside
    `super.onCreate()`, so the flag is set before it is read.
    **Existing installs can also just switch notifications on for Hostello in
    Android settings** — same effect, no new APK.
  - **No pop-up, no sound, no lit screen** — `TrustedWebActivityService` creates
    its channel at `IMPORTANCE_DEFAULT`, which posts straight into the shade with
    no banner. `DelegationService.onNotifyNotificationWithChannel` is overridden
    to post on our own `hostello_alerts_v1` channel at `IMPORTANCE_HIGH`, vibration
    and lights on, `VISIBILITY_PUBLIC` so the text survives the lock screen. That
    is what makes it peek like an Instagram DM and wake the screen. **Importance
    is frozen when a channel is first created and belongs to the user after that
    — changing this default again means a new CHANNEL_ID**, not an edit.
  - **The status-bar icon was a white blob** — `ic_notification_icon.png` was the
    full-colour app icon at all five densities (95% opaque, 70% coloured). Android
    masks a small icon down to its alpha, so an opaque square renders as a solid
    white square. Redrawn as a transparent white silhouette of the Hostello mark
    (24/36/48/72/96 px, ~27% opaque, 0% coloured), from the same polygon table in
    `HostelloMark.tsx` that the PWA icons come from. The generator is in the
    session scratchpad, not the repo — the polygon table is the source of truth.
  - `public/sw.js` adds `vibrate: [200, 100, 200]`. The high-importance channel
    already vibrates on Android 8+; this is what covers everything else.
  - versionCode 1 → **2**, versionName 1.0.0 → **1.1.0**, in `app/build.gradle`
    and `twa-manifest.json` both, so an installed v1 upgrades rather than
    refusing to install.
  - **Verified on a real Android phone (2026-08-27) — it works.** Notifications
    now arrive as Hostello, with the mark as the small icon, and land while the
    app is closed. Two things had to be true on the device and neither is
    something a deploy can set:
    - **The Android app's own notification permission must be on.** The site
      permission (granted in Chrome) only makes the push arrive; posting it to
      the screen is a per-app right, and the app is what posts it. With it off,
      delegation fails silently and Chrome shows the banner under its own name —
      which is exactly what the symptom looked like.
    - **The app has to be opened once after installing**, which is when Chrome
      hands the site's notification permission across to it.
  - **Pushes now go out at `urgency: "high"`** (`src/lib/push.ts`). At the default
    ("normal") Android's Doze sat on them until the phone woke for its own
    reasons, so they only appeared when the app was opened. Aggressive OEM
    battery managers (this was a Xiaomi-style ROM) need Chrome set to
    Unrestricted on top of that — urgency alone does not beat them.
  - **Not verifiable here:** there is still no Android device on this machine.
    What was checked is the bytecode — both overrides compile with the exact
    signatures the library declares (`onNotifyNotificationWithChannel(String,
    int, Notification, String)`, `shouldLaunchImmediately()`) — and the icon
    pixels. The banner, the sound and the lock screen need a phone.


- **Booking notifications say who, what, when, where** (2026-08-27). The banner
  used to read "New booki…" plus raw ISO dates and a payout figure, which said
  nothing useful on a phone. `npm run build` and `npm run lint` clean.
  - **A booking event is now two rows, one per audience.** The client's reads
    `property · dates · channel`; the admin's puts the client's name in front,
    because an admin is reading across the whole portfolio and an owner is not.
    Both portals already read the feed through `notification_recipients`, so
    each side sees only its own row — no filtering was needed anywhere else.
  - `emitBookingEvent` in `notify.ts` composes both and is the only place the
    wording lives; `notifyBookingCreated` / `notifyBookingCancelled` just name
    the kind and the title. Titles are short now ("New booking", "Tentative
    booking held", "Booking cancelled") because an OS banner truncates them.
  - `dateRange` switched from raw ISO to `formatDayMonth` — "Aug 27 → Aug 28".
    That is shared, so blocked/unblocked/conflict notifications read properly too.
  - The client name is looked up inside `notify.ts` rather than threaded through
    four call sites; `source` had to come from the call sites, so both cancel
    paths now select it.
  - **Payout and "Token received" are gone from the banner** — that was the
    stated spec. Both are still on the booking detail page.
  - Event keys are `<kind>:<audience>:<bookingId>`, so the two rows do not
    collide and old rows are unaffected.

- **Stats — revenue by source** (2026-08-29). A "Stats" page in both portals,
  reachable from the sidebar. `src/lib/stats.ts` (`statsBySource`) sums the
  columns `payout.ts` already wrote — it never recalculates a split — and
  `src/components/shared/StatsBoard.tsx` renders total revenue, the portal's own
  cut (Hostello share / owner payout), bookings, nights, and a per-channel bar
  list. Hostello / Airbnb / Booking.com / Client self-sourced are always listed
  even at zero; offline / reference / other appear only once they have a booking.
  `npm run build` and `npm run lint` clean.
  - `src/app/admin/stats/page.tsx` — whole portfolio by default;
    `StatsClientSelect` puts one client in `?client=` and the server filters.
  - `src/app/client/stats/page.tsx` — the owner's own bookings only.
  - Both reuse `PeriodSelect` / `periodRange` (`?period=`) and the same overlap
    window as the dashboards (`check_in ≤ end AND check_out ≥ start`) — but
    **confirmed only**, where the dashboards count everything non-cancelled. A
    tentative stay is not money made. That is a deliberate difference and the
    page says so in a footnote, so it does not read as a bug.
  - **Hostello earns nothing on owner self-sourced stays** (`payout.ts` has always
    zeroed `hostello_share` for `source = 'client'`). Its gross still counts in the
    admin's Total revenue, but the row says "Hostello earns nothing on these"
    rather than printing Rs 0, and a footnote gives the pass-through amount.
    A second footnote says Hostello share is per-booking only — fixed monthly
    fees are not counted, and no table records them.
  - **Not verified against a running app** — no `.env.local` on this machine, so
    the pages have never been rendered signed in.


- **Bookings can be edited, and blocked nights are visible before you pick them**
  (2026-08-29). `npm run build` and `npm run lint` clean.
  - **`src/lib/availability.ts` is new and is now the only answer to "is this
    night free".** `findStayClash()` checks bookings *and* `calendar_blocks`;
    `listUnavailable()` returns the same two tables as occupied-night ranges for
    the picker. The exclusive-`check_out` / inclusive-`end_date` conversion
    happens once, in there.
  - **Fixed: a booking could be written straight over blocked dates.** Both
    `saveBooking` and `saveClientBooking` only ever queried `bookings`, so an
    owner blocking their own house and a booking landing on it was silent. Both
    now call `findStayClash`, which replaced the duplicated clash block in each.
    The reverse direction is unchanged on purpose — blocking over a live booking
    still writes `notifyCalendarConflict` rather than refusing, because sometimes
    you do mean to.
  - **`src/components/shared/StayDates.tsx` replaces the two native date inputs**
    in `BookingForm`. A month grid: taken nights are struck through and
    unclickable, and once check-in is picked you cannot reach past the next taken
    night, so a clashing range can't be composed. `check_in` / `check_out` are
    submitted as hidden inputs, so the server contract is untouched. Pages pass
    `unavailable` (both new-booking pages, both calendars via `CalendarBoard` →
    `QuickAddBooking`, both edit pages).
  - **Edit a booking** — `/admin/bookings/[id]/edit` and
    `/client/bookings/[id]/edit`, reusing `BookingForm` with a new `values` prop.
    `updateBooking` / `updateClientBooking` take the id via `.bind(null, id)`
    rather than a hidden field. **The split is recomputed from the booking's own
    snapshots, never the client's current terms** — fixing a phone number must
    not re-price a stay agreed months ago. The stack rate is the exception: it
    belongs to the units, so it moves when the units do. Cancelled bookings
    can't be edited (that would resurrect them on the calendar), and a retired
    unit stays selectable when the booking already sits on one.
  - **`notifyBookingUpdated`** in `notify.ts`, `booking_updated` in `KIND_ICON`.
    Body reads `unit · dates · channel · "Dates and price changed"`;
    `describeBookingChanges` in `src/lib/booking-changes.ts` writes that phrase
    so both portals word it identically. A save that moved nothing sends nothing.
    The event key carries the save's timestamp (`booking_updated:<id>:<ts>`)
    because unlike create and cancel this fires repeatedly on one booking — a
    double-submit still collapses. Existing keys keep their documented
    `<kind>:<audience>:<bookingId>` shape.
  - **Not verified against a running app** — still no `.env.local` on this
    machine, so nothing here has been rendered signed in.


- **Check-in / check-out ticks** (2026-08-29). `npm run build` and `npm run lint`
  clean. Migration `20260829120000_add_booking_checkin_checkout_timestamps.sql`
  — `bookings.checked_in_at` / `checked_out_at`, both nullable timestamptz —
  **applied to the live DB and committed** (unlike most of the earlier ones).
  - They record that the arrival was *handled*, not when the stay is booked for;
    `check_in` / `check_out` already say that. Null = still outstanding.
  - No RLS change needed: both `bookings` policies are already `ALL`-scoped
    (`bookings: admin full access`, `bookings: client reads and writes own
    bookings`), so each portal writes only rows it could already write.
  - `src/components/shared/StayProgress.tsx` — `StayTick` (the round tick) and
    `StayProgressCard` (the same two ticks on a booking). A form, not a
    checkbox, because it is a write and a checkbox needing a Save button is
    worse than a thing you press once. Both directions toggle, so a mis-tap
    undoes the same way.
  - `TodayBoard` puts a tick on every arrival and departure row — ticked rows
    fade, and the section header counts "2 of 5" once one is done, "All done"
    when they all are. Staying-tonight has no tick; they were ticked on arrival.
  - **The card is on both booking detail pages too, and that is not decoration**
    — the day sheet only ever shows today, so an arrival nobody ticked on the
    day could otherwise never be ticked at all.
  - `markStayProgress` / `markClientStayProgress` mirror each other the way the
    two portals' other writes do. **No notification** — one per arrival would
    roughly double notification volume, and the 07:00 daily-stays job already
    announces the day's arrivals. Worth revisiting if owners ask to be told.
  - **Not verified against a running app** — still no `.env.local` here.


- **Check-in notifications, and a board to manage them** (2026-08-29).
  `npm run build` and `npm run lint` clean. No migration — this rides on the
  two columns added earlier today.
  - **`notifyStayProgress`** in `notify.ts`, kinds `guest_checked_in` /
    `guest_checked_out` (both in `KIND_ICON`). Two rows like the other booking
    events, for the same reason: the admin's body leads with the client's name,
    the owner's does not. Body is `guest · unit` — dates and channel are left
    out because for this event the useful facts are who and where.
    **Only the doing is announced, never the undoing** — un-ticking is a
    correction, the same call `markBookingSettled` makes about un-settling.
    Event key `<kind>:<audience>:<bookingId>`, so untick-then-retick does not
    fire a second time.
  - **`/admin/checkins` + `/client/checkins`** — "Check-ins & check-outs".
    Sections: arriving today, departing today, then **never marked arrived /
    never marked departed** over the last 30 days, then arriving / departing in
    the next 7. The middle pair is the reason the page exists: the day sheet
    only ever shows today, so from the day after, a missed tick was invisible.
    Empty sections past today's two don't render at all.
  - `Section` in `TodayBoard.tsx` is now exported as `StaySection` (plus an
    optional `note` line) and the new pages build their own set from it, so the
    day sheet and the board share one row and one section implementation.
  - **A gold "Manage check-ins" button** sits next to "Open day sheet" on both
    dashboards, and the dashboard's Check-ins / Check-outs tiles now point at
    the board rather than the day sheet — they are jobs, not just counts.
    Also a "Check-ins" nav item under Overview in both sidebars, since a real
    page reachable only from one button is a page people lose.
  - **Not verified against a running app** — still no `.env.local` here. The
    notification path in particular is unproven: it has never been fired.

## Next
0. **Deploy, then install the APK on a real Android phone.** Nothing about the
   app can be trusted until that round trip works: the download, the "allow from
   this source" prompt, and — the one that silently fails — whether the app opens
   with no address bar, which only proves out once assetlinks.json is live.
1. Verify Phase 4 against real data once signed in (both portals), then deploy.
   Same login: attach a real screenshot to a booking and confirm it renders back.
2. Open the new calendar once signed in with real clients. Two things only real
   data can answer: whether the overview needs a client search box (fine at ~6
   rows, unknown at 40), and whether the heat shading reads at a glance.
3. **Set the three push env vars, then test push for real**: sign in on two
   devices/browsers, turn push on in Notification preferences on both, and have
   one make a booking — the other should get an OS banner that opens the booking.
   Until the vars are set the toggle says push is not configured.
4. **Watch the first `hostello-daily-stays` run** (07:00 Karachi). `select * from
   cron.job_run_details order by start_time desc limit 5;` — and check that a day
   with several arrivals does not feel like spam. If it does, the change is a
   digest row per client instead of one per booking, keyed the same way.
5. Open the bell and both day sheets once signed in — like everything since
   Phase 4 they were verified by rendering, not against real data.

## Open questions / debt
- **Client password reset is undeliverable with fake emails.** `requestPasswordReset`
  hands the address to Supabase, which mails the recovery link (landing on
  `/auth/reset-password`). Client logins are `<slug>@hostello-clients.pk`
  placeholders, so the mail bounces — nobody gets the link, and the form still
  says "sent" by design (no enumeration). Answer for now: the admin sets the
  password (see `set_client_password` below) and hands it over. Real emails +
  custom SMTP are still needed before self-service reset can work at all —
  Supabase's built-in SMTP is test-grade (a couple of mails/hour).
- Note for future RPCs: `revoke execute … from anon` does **not** close the door
  on its own — a fresh function keeps its default PUBLIC grant, which anon
  inherits. Revoke `public, anon` and grant `authenticated` explicitly, then
  check with `has_function_privilege('anon', oid, 'EXECUTE')`.
- `supabase/migrations/0001_init_core_schema.sql` covers only profiles / clients /
  properties / payout_rules. `bookings`, `booking_properties`, `calendar_blocks`,
  `notifications` and the extra `properties` columns were applied straight to the
  live DB. Worth backfilling a `0002_*.sql` from the live schema.
- "Maintenance" block type needs a `calendar_block_type` enum migration if wanted.
- Property thumbnails / bedrooms / max_guests need columns that don't exist.
  Current call: type · city subtext and initials avatars, real images later.
- `.env.local` is not present locally — copy `.env.local.example` and fill in the
  Supabase keys before `npm run dev`. (`node_modules` is installed.)

## Notes for next session
- Data is thin because the app is pre-launch, not because something is broken.
  Do not fabricate trend data to make the UI look good.
- Dashboard revenue uses the same overlap window as the Bookings & Payouts page
  (`check_in ≤ monthEnd AND check_out ≥ monthStart`). Change one, change both.
- Booking `check_out` is exclusive; `calendar_blocks.end_date` is inclusive. The
  calendar's `place()` helper converts check_out to an inclusive last night before
  clipping — keep it that way.
- Don't build Channels / Pricing / Expenses / Payouts / Reports — no tables back them.
