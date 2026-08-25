-- Admin-side read state for notifications.
-- `read_at` belongs to the client the row is about; admins see the same rows as
-- a portfolio activity feed and need their own unread mark.
alter table public.notifications
  add column if not exists admin_read_at timestamptz;

create index if not exists notifications_admin_unread_idx
  on public.notifications (created_at desc)
  where admin_read_at is null;

-- RLS cannot restrict a single column, and the client UPDATE policy allows a
-- client to write any column on their own rows. Pin the admin mark to admins.
create or replace function public.guard_notification_admin_read()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.admin_read_at is distinct from old.admin_read_at and not is_admin() then
    new.admin_read_at := old.admin_read_at;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_admin_read on public.notifications;
create trigger notifications_guard_admin_read
  before update on public.notifications
  for each row execute function public.guard_notification_admin_read();
