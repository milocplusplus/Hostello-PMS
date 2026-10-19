-- The public landing page says whether bookings-from-email is switched on, without
-- revealing the address itself.
-- Applied to the live DB as `public_channel_inbox_live` on 2026-10-19.
create or replace function public.channel_inbox_live() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(channel_inbox_address), '') is not null from app_settings limit 1), false);
$$;
grant execute on function public.channel_inbox_live() to anon, authenticated;
