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
  empty states when flat. Local only — never deployed.
- **Phase 3 (Calendar)** — built, `npm run build` and `npm run lint` clean
  (2 pre-existing unused-import warnings in untouched files). Local only.
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

## Blocked — deployment
Phase 2 + 3 are **not deployed**. The Vercel project `hostello-pms`
(`prj_HRnVSD9I0OnA2oINYxplGp9KRYsM`, team `team_mSNnhApqjbhfTQv1bDziZKMp`) has **no
Git integration**, and there is no `.vercel/` link or Vercel CLI auth on this
machine, so the only route available was uploading the whole file tree through the
Vercel MCP `deploy_to_vercel` tool. The tree (~290 KB) does not fit in one tool
call — deployment `dpl_3yoDuQWkADtrPfj6AnYdrAQ1e8xG` went out with roughly two
thirds of the files and will fail to build on missing modules. A failed production
build does not reassign the production alias, so `hostello-pms.vercel.app` stays on
the Phase 1 deploy.

Do **not** retry `deploy_to_vercel` for this repo — it cannot carry the tree.
Fix it once, at the source:
1. Vercel → project `hostello-pms` → Settings → Git → connect
   `milocplusplus/Hostello-PMS`, production branch `main`. Then `git push` deploys.
2. Or locally: `npx vercel login` then `npx vercel --prod` (this also writes
   `.vercel/project.json`, after which the CLI works unattended).

## Next
1. Get Phase 2 + 3 deployed via one of the two routes above, then verify
   `/admin`, `/admin/calendar`, and a booking detail page against real data.
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
- The deploy that went out omitted `src/app/favicon.ico` (binary, doesn't survive
  the MCP text upload). Irrelevant once deploys come from Git.

## Notes for next session
- Data is thin because the app is pre-launch, not because something is broken.
  Do not fabricate trend data to make the UI look good.
- Dashboard revenue uses the same overlap window as the Bookings & Payouts page
  (`check_in ≤ monthEnd AND check_out ≥ monthStart`). Change one, change both.
- Booking `check_out` is exclusive; `calendar_blocks.end_date` is inclusive. The
  calendar's `place()` helper converts check_out to an inclusive last night before
  clipping — keep it that way.
- Don't build Channels / Pricing / Expenses / Payouts / Reports — no tables back them.
