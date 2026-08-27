-- ─── Fan-out, the authorised emitter, push subscriptions, preferences ─────────
-- Applied to the live database 2026-08-27.

-- Every insert into `notifications` decides its own audience here, so anything
-- that can write a row — a Server Action, a pg_cron job, a future mobile
-- backend — gets the same routing without repeating it.
create or replace function public.fan_out_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audience in ('admin', 'both') then
    insert into notification_recipients (notification_id, user_id)
    select new.id, p.id
    from profiles p
    where p.role = 'admin'
      and p.id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  if new.audience in ('client', 'both') and new.client_id is not null then
    insert into notification_recipients (notification_id, user_id)
    select new.id, c.owner_user_id
    from clients c
    where c.id = new.client_id
      and c.owner_user_id is not null
      and c.owner_user_id is distinct from new.actor_user_id
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_fan_out on public.notifications;
create trigger notifications_fan_out
  after insert on public.notifications
  for each row execute function public.fan_out_notification();

-- Clients have no INSERT policy on notifications and must not get one: a client
-- session still has to be able to tell the admins it just booked something.
-- This is the single authorised door, and the authorisation is checked here.
create or replace function public.emit_notification(
  p_kind text,
  p_category text,
  p_audience text,
  p_title text,
  p_body text default null,
  p_client_id uuid default null,
  p_booking_id uuid default null,
  p_property_id uuid default null,
  p_event_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not is_admin() then
    if p_client_id is null or not exists (
      select 1 from clients c where c.id = p_client_id and c.owner_user_id = auth.uid()
    ) then
      raise exception 'not allowed to notify for this client';
    end if;
  end if;

  insert into notifications (
    kind, category, audience, title, body,
    client_id, booking_id, property_id, event_key, actor_user_id
  )
  values (
    p_kind, p_category, p_audience, p_title, p_body,
    p_client_id, p_booking_id, p_property_id, p_event_key, auth.uid()
  )
  on conflict (event_key) where event_key is not null do nothing
  returning id into v_id;

  -- Null means the event_key already existed: a duplicate, deliberately dropped.
  return v_id;
end;
$$;

revoke execute on function public.emit_notification(text, text, text, text, text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.emit_notification(text, text, text, text, text, uuid, uuid, uuid, text) to authenticated;

-- `platform` is what lets the Android/iOS apps reuse this table: a web row keeps
-- the push endpoint plus its two encryption keys, a native row keeps the FCM/APNs
-- device token in `endpoint` and leaves the key columns null.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'web' check (platform in ('web', 'android', 'ios')),
  endpoint text not null unique,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failed_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: manage own"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  muted_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences: manage own"
  on public.notification_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The recipient row is what each user is allowed to see, so that is what the
-- browser subscribes to. RLS scopes the stream per user.
alter publication supabase_realtime add table public.notification_recipients;

-- A trigger function has no business being callable over the REST API. A fresh
-- function keeps its default PUBLIC grant, which anon inherits — revoking from
-- anon alone would not close it. (Applied live 2026-08-27.)
revoke execute on function public.fan_out_notification() from public, anon, authenticated;
