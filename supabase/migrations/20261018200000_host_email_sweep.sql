-- Host mode: the same notices a host gets in the app are also emailed (welcome, trial and
-- plan reminders, lapse). The edge function `host-email` sends them through Resend.
-- Applied to the live DB as `host_email_sweep` + `host_email_claim_text_fix` on 2026-10-18.

alter table public.notifications add column emailed_at timestamptz;

-- A welcome notice at sign-up (and so a welcome email).
do $$
declare
  v_def text := pg_get_functiondef('public.handle_host_signup()'::regprocedure);
  v_old text := E'''host_signup:'' || new.id::text)\n    on conflict (event_key) where event_key is not null do nothing;';
  v_new text := v_old || E'\n\n    insert into notifications (kind, category, audience, title, body, client_id, event_key)\n    values (''host_welcome'', ''system'', ''client'', ''Welcome to Hostello'',\n            ''Your 14-day free trial has started. Add your first property and connect its Airbnb calendar to get going.'',\n            v_client, ''host_welcome:'' || v_client)\n    on conflict (event_key) where event_key is not null do nothing;';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'handle_host_signup no longer has the expected sign-up notice';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- The shared secret the schedule presents to the function.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'host_email_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'host_email_secret');
  end if;
end $$;

create or replace function public.is_host_email_secret(p_secret text) returns boolean
language sql security definer set search_path = public, vault, pg_temp as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'host_email_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.is_host_email_secret(text) from public, anon, authenticated;
grant execute on function public.is_host_email_secret(text) to service_role;

-- Takes up to 50 unsent notices (stamping them so a second run cannot double-send) and
-- says where each goes: the login's email, else the contact email.
create or replace function public.host_email_claim()
returns table (id uuid, kind text, title text, body text, email text, name text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select n.id from notifications n
    join clients c on c.id = n.client_id
    where c.account_type = 'host' and n.audience = 'client' and n.emailed_at is null
      and n.kind in ('host_welcome', 'host_trial_ending', 'host_payment_due', 'host_trial_ended',
                     'host_payment_overdue', 'host_paused')
      and n.created_at > now() - interval '3 days'
    order by n.created_at
    limit 50
    for update of n skip locked
  ), stamped as (
    update notifications n set emailed_at = now() from due where n.id = due.id
    returning n.id, n.kind, n.title, n.body, n.client_id
  )
  select s.id, s.kind, s.title, s.body, coalesce(u.email::text, c.contact_email), c.name
  from stamped s
  join clients c on c.id = s.client_id
  left join auth.users u on u.id = c.owner_user_id;
end $$;
revoke execute on function public.host_email_claim() from public, anon, authenticated;
grant execute on function public.host_email_claim() to service_role;

-- A send that failed goes back in the queue (until it is three days old).
create or replace function public.host_email_release(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update notifications set emailed_at = null where id = any(p_ids);
$$;
revoke execute on function public.host_email_release(uuid[]) from public, anon, authenticated;
grant execute on function public.host_email_release(uuid[]) to service_role;

-- Every five minutes, but only when something is waiting.
create or replace function public.run_host_email_sweep() returns bigint
language plpgsql security definer set search_path = public, extensions, vault, pg_temp as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  if not exists (
    select 1 from notifications n join clients c on c.id = n.client_id
    where c.account_type = 'host' and n.audience = 'client' and n.emailed_at is null
      and n.kind in ('host_welcome', 'host_trial_ending', 'host_payment_due', 'host_trial_ended',
                     'host_payment_overdue', 'host_paused')
      and n.created_at > now() - interval '3 days'
  ) then
    return null;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'host_email_secret';

  select net.http_post(
    url := 'https://vucfpfqcankyztzvmyht.supabase.co/functions/v1/host-email',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Email-Secret', v_secret),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end $$;
revoke execute on function public.run_host_email_sweep() from public, anon, authenticated;

select cron.schedule('hostello-host-email', '*/5 * * * *', 'select public.run_host_email_sweep();');
