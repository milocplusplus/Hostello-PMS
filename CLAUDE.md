@AGENTS.md

# Project Instructions

Read context.md first (what the project is), then STATE.md (where we are). Trust
them. Only open source files when the task actually needs the code, not to "get
oriented."

## How to work here
- Answer or act from context.md when you can. Don't re-read the codebase to
  re-learn what context.md already says.
- When you must read code, read the specific file the task touches, not its
  neighbors "for context."
- Smallest change that works. No new abstractions, no scaffolding for later,
  no dependency for what a few lines do.
- Match the existing style in the file you're editing.
- Bug fix = find the root cause, fix it once where all callers route through.
  Don't patch the same symptom in five places.
- After a change, run the closest check (`npm run build`, or `npm run lint` for a
  small edit). Say what you ran. Don't claim it works if you didn't run it.

## Project rules
- Server Components read, Server Actions write. No API route handlers.
- `src/lib/payout.ts` is the only revenue math. Never add a second one.
- Booking `check_out` is exclusive; `calendar_blocks.end_date` is inclusive.
- Reuse `src/components/admin/BookingForm.tsx`; don't duplicate it for the client side.
- Never ship dead nav links or fabricated data/trends. Empty states are honest.

## Output
- Lead with the result. Short. No recaps of what I asked, no feature tours.
- If the explanation is longer than the code, cut the explanation.

## Stack
Next.js 16.3.2 (App Router) / React 19 / TypeScript / Tailwind v4 / Supabase.
Run: `npm run dev` · Build: `npm run build` · Lint: `npm run lint` · No test suite.
