# State — updated 2026-08-25

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

## Next
1. Verify the deployed calendar and dashboard against real data once signed in.
2. Client portal (`src/app/client/page.tsx`, `src/app/client/calendar/page.tsx`)
   has had neither the Phase 2 nor the Phase 3 treatment. The client calendar is
   still the old `w-6 h-6` cell grid with its own local `SOURCE_COLOR` map — decide
   whether it gets a mirrored `CalendarBoard`.
3. `src/app/admin/bookings/page.tsx` rows still aren't clickable even though
   `/admin/bookings/[id]` now exists — one anchor away.

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
- Admin-facing notifications need a role-aware query; `notifications` RLS is scoped
  to `owner_user_id` (clients only).

## Notes for next session
- Data is thin because the app is pre-launch, not because something is broken.
  Do not fabricate trend data to make the UI look good.
- Dashboard revenue uses the same overlap window as the Bookings & Payouts page
  (`check_in ≤ monthEnd AND check_out ≥ monthStart`). Change one, change both.
- Booking `check_out` is exclusive; `calendar_blocks.end_date` is inclusive. The
  calendar's `place()` helper converts check_out to an inclusive last night before
  clipping — keep it that way.
- Don't build Channels / Pricing / Expenses / Payouts / Reports — no tables back them.
