# Host mode — self-serve subscription plan

Status: **plan only, nothing built.** Decisions below are the owner's answers (2026-10-18).

## Decisions
- **Market:** Pakistan first, PKR only; international later.
- **Same app, same database.** New account type `host` beside managed `client`. Hostello brand and look unchanged. English only. One login per host.
- **Plans (listing count only):** Starter 1–3 (Rs 1,500–2,500/mo), Growth 4–10, Pro 11–30. Pro adds AI audits on request (owner runs Listing Coach by hand). Monthly or annual (≈2 months free).
- **Trial:** 14 days, no card. Lapse → read-only 14 days → paused (data kept). Over the limit → can't add listings, nothing deleted.
- **Launch scope:** sign-up, trial, units, iCal sync, calendar, bookings, manual plan activation. Then: gateway (local, e.g. Safepay/PayFast), email forwarding (one shared address, routed by the host's Airbnb email), expenses/stats, annual billing.
- **Hosts keep 100%** of a booking's price: price + advance, no Hostello split, no Money/settlements/deal models. They don't see Channel inbox, Find dates or Rates tools.
- **Guest ID scans stay** (host's own data). Self-serve account deletion with typed confirmation.
- **iCal links:** airbnb.com / booking.com only, one per unit.
- **Emails:** verification + welcome, trial-ending and payment reminders.
- **Admin (owner):** hosts list (plan, status, trial end), extend trial / comp a plan, mark a manual payment received, view-as-host (reuse view-as-owner).
- **Support:** WhatsApp button + Help page. **Legal:** placeholder Terms/Privacy accepted at sign-up; owner gets them reviewed.
- **Landing page** at the root URL (pricing + Sign up). **Beta:** 3–10 friendly hosts free, then billing on.

## Phases
1. **Data model + isolation.** `plans`, `subscriptions` (status: trial / active / read_only / paused, trial_end, period_end), `clients.account_type` (`managed` | `host`). Limit check on adding a unit. Review every RLS policy and every page that leans on session scope — strangers share these tables now. Advisors run.
2. **Sign-up + onboarding.** Public sign-up creating profile + host client + trial; email verification; terms acceptance; guided checklist (add unit → paste iCal → first booking).
3. **Host mode UI.** Hide Money/settlements/deal fields and staff tools for `host`; booking form without the split card; Help page + WhatsApp.
4. **Sync safeguards.** iCal URL allow-list (airbnb/booking only), no internal addresses; sync skips paused hosts.
5. **Admin: Hosts.** List, extend trial, comp, mark payment received, view-as-host.
6. **Lifecycle.** Cron: trial → read-only → paused; reminder emails; over-limit blocking; account deletion + export.
7. **Landing + legal pages.** Root page, pricing, placeholder Terms/Privacy.
8. **Beta** with 3–10 hosts, fix, then switch billing on.
9. **Later:** gateway webhook (needs a documented exception to "no route handlers"), email forwarding for hosts, expenses/stats parity check, annual billing, Pro audit-request button.

## Open items for the owner
- Choose the gateway and confirm it supports recurring billing for a Pakistan business.
- Final plan prices for Growth and Pro.
- Terms/Privacy text reviewed by someone qualified.
- Supabase plan: fine under 50 hosts; revisit before growth.
