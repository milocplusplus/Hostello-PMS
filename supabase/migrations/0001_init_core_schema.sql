-- Hostello PMS — Milestone 1 schema
-- Users, clients, properties, and the role foundation everything else builds on.

-- ─────────────────────────────────────────────
-- Profiles (extends Supabase auth.users with app-specific fields)
-- ─────────────────────────────────────────────
create type user_role as enum ('admin', 'client');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'client',
  full_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Everyone can read their own profile. Admins can read all profiles.
create policy "profiles: read own or admin reads all"
  on profiles for select
  using (
    auth.uid() = id
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ─────────────────────────────────────────────
-- Clients (a Hostello customer who owns one or more properties)
-- ─────────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  owner_user_id uuid references profiles(id), -- the client's login, if they have portal access
  created_at timestamptz not null default now()
);

alter table clients enable row level security;

create policy "clients: admin full access"
  on clients for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "clients: owner reads own record"
  on clients for select
  using (owner_user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Properties
-- ─────────────────────────────────────────────
create type property_type as enum ('studio', '1br', '2br', 'penthouse', 'other');
create type property_status as enum ('active', 'inactive');

create table properties (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  location text not null,
  city text, -- Islamabad, Murree, Wah Cantt, etc.
  type property_type not null default 'other',
  status property_status not null default 'active',
  created_at timestamptz not null default now()
);

alter table properties enable row level security;

create policy "properties: admin full access"
  on properties for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "properties: client reads own properties"
  on properties for select
  using (
    exists (
      select 1 from clients c
      where c.id = properties.client_id
      and c.owner_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Payout rules (configurable revenue split — never hard-coded)
-- ─────────────────────────────────────────────
create type split_type as enum ('percentage', 'fixed');

create table payout_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  split_type split_type not null default 'percentage',
  hostello_share numeric(10,2) not null, -- e.g. 20.00 for 20%, or a fixed amount
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

alter table payout_rules enable row level security;

create policy "payout_rules: admin full access"
  on payout_rules for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "payout_rules: client reads own property rules"
  on payout_rules for select
  using (
    exists (
      select 1 from properties pr
      join clients c on c.id = pr.client_id
      where pr.id = payout_rules.property_id
      and c.owner_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Indexes for common lookups
-- ─────────────────────────────────────────────
create index idx_properties_client_id on properties(client_id);
create index idx_payout_rules_property_id on payout_rules(property_id);
create index idx_clients_owner_user_id on clients(owner_user_id);
