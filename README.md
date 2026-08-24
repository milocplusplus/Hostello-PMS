# Hostello PMS

Property management system for Hostello's multi-client short-term-rental
co-hosting business.

## Milestone 1 — what's in this scaffold

- Next.js 15 (App Router) + TypeScript + Tailwind v4
- Hostello brand theme wired into `src/app/globals.css` (dark surfaces,
  purple, gold, status colors for booking states)
- Supabase client setup: browser client, server client, and middleware
  for session refresh
- Initial database schema with row-level security:
  `profiles`, `clients`, `properties`, `payout_rules`
- A home page that checks the Supabase connection

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Connect Supabase

Copy the env template and fill in your project's keys
(Supabase dashboard -> Project Settings -> API):

```bash
cp .env.local.example .env.local
```

### 3. Run the database migration

In the Supabase dashboard, open the SQL Editor and run the contents of
`supabase/migrations/0001_init_core_schema.sql`.

This creates:
- `profiles` — extends Supabase auth with a role (`admin` or `client`)
- `clients` — a Hostello customer, optionally linked to a login
- `properties` — belongs to a client, has type/location/status
- `payout_rules` — the configurable revenue split per property (never
  hard-coded, per the product principles)

Row-level security is enabled on every table: admins see everything,
clients only ever see rows tied to their own `client_id`.

### 4. Create your first admin user

Once the schema is applied:
1. In Supabase, go to Authentication -> Users -> Add user, and create
   yourself an account.
2. In the SQL Editor, run:
   ```sql
   insert into profiles (id, role, full_name)
   values ('<the user id from step 1>', 'admin', 'Your Name');
   ```

### 5. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` — you should see a "Connected to Supabase"
indicator once your `.env.local` keys are correct.

## Deploying

Push this repo to GitHub, then import it in Vercel. Add the same
environment variables from `.env.local` in the Vercel project settings
(Settings -> Environment Variables) before deploying.

## What's next (Milestone 2)

- Auth pages (login, role-based redirect)
- Admin dashboard shell
- Client dashboard shell
