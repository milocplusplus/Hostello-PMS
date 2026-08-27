-- ─── Notification backbone ────────────────────────────────────────────────────
-- One row per EVENT in `notifications`; one row per PERSON who should see it in
-- `notification_recipients`. Read state, push delivery and (later) the mobile
-- apps all hang off the recipient row, so a second admin no longer marks a
-- notification read for every other admin.
--
-- Applied to the live database 2026-08-27.

alter table public.notifications alter column kind type text using kind::text;
drop type if exists public.notification_kind;

alter table public.notifications
  add column if not exists category text not null default 'system',
  add column if not exists audience text not null default 'both',
  add column if not exists event_key text,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

alter table public.notifications alter column client_id drop not null;

alter table public.notifications
  add constraint notifications_category_check
  check (category in ('booking', 'payment', 'calendar', 'system', 'critical'));

alter table public.notifications
  add constraint notifications_audience_check
  check (audience in ('admin', 'client', 'both'));

create unique index if not exists notifications_event_key_uniq
  on public.notifications (event_key) where event_key is not null;

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

update public.notifications set
  category = case
    when kind in ('booking_created', 'booking_cancelled') then 'booking'
    when kind in ('payout_settled') then 'payment'
    when kind in ('dates_blocked', 'dates_unblocked') then 'calendar'
    else 'system'
  end,
  audience = 'both'
where category = 'system';

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create index if not exists notification_recipients_unread_idx
  on public.notification_recipients (user_id, created_at desc) where read_at is null;

create index if not exists notification_recipients_user_idx
  on public.notification_recipients (user_id, created_at desc);

alter table public.notification_recipients enable row level security;

create policy "notification_recipients: read own"
  on public.notification_recipients for select
  using (user_id = auth.uid());

create policy "notification_recipients: mark own read"
  on public.notification_recipients for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notification_recipients: admin full access"
  on public.notification_recipients for all
  using (is_admin());

insert into public.notification_recipients (notification_id, user_id, read_at, created_at)
select n.id, c.owner_user_id, n.read_at, n.created_at
from public.notifications n
join public.clients c on c.id = n.client_id
where c.owner_user_id is not null
on conflict do nothing;

insert into public.notification_recipients (notification_id, user_id, read_at, created_at)
select n.id, p.id, n.admin_read_at, n.created_at
from public.notifications n
cross join public.profiles p
where p.role = 'admin'
on conflict do nothing;

drop function if exists public.guard_notification_admin_read() cascade;

alter table public.notifications
  drop column if exists read_at,
  drop column if exists admin_read_at;

drop policy if exists "notifications: client reads own" on public.notifications;
drop policy if exists "notifications: client marks own as read" on public.notifications;

create policy "notifications: recipients read"
  on public.notifications for select
  using (
    is_admin()
    or exists (
      select 1 from public.notification_recipients r
      where r.notification_id = notifications.id and r.user_id = auth.uid()
    )
  );
