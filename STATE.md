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
  - Deliberately NOT built: Maintenance bar type (needs a `calendar_block_type`
    enum migration), property thumbnails and "4BR · Max 10 guests" (no columns),
    Timeline view (deferred).

## Deployment
Vercel project `hostello-pms` (`prj_HRnVSD9I0OnA2oINYxplGp9KRYsM`, team
`team_mSNnhApqjbhfTQv1bDziZKMp`) is now **connected to
`milocplusplus/Hostello-PMS`, production branch `main`** — pushing to main deploys.
Phase 2 + 3 shipped as `dpl_7JfmujCpqA8LueTG5gujr3VhiucB` (READY, production) on
`hostello-pms.vercel.app`.

**Env vars:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are now
set on the Vercel project as **Config** (not Secret) across all environments. They
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
