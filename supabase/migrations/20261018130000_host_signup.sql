-- Host mode, phase 2: public sign-up creates a host account once the email is confirmed.
-- Applied to the live DB as `host_signup` on 2026-10-18.
alter table public.app_settings add column host_signup_open boolean not null default false;
alter table public.clients add column terms_accepted_at timestamptz;

-- Whether the front door is open. Anyone may ask; the answer is one yes/no.
create or replace function public.host_signup_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select host_signup_open from app_settings limit 1), false);
$$;
grant execute on function public.host_signup_open() to anon, authenticated;

create or replace function public.handle_host_signup() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := nullif(trim(v_meta ->> 'full_name'), '');
  v_client uuid;
begin
  if coalesce(v_meta ->> 'signup_kind', '') <> 'host' then
    return new;
  end if;

  -- Auth's sign-up API is public, so the rules are enforced here, not just in the form.
  if tg_op = 'INSERT' then
    if not host_signup_open() then
      raise exception 'Host sign-ups are not open yet.';
    end if;
    if coalesce(v_meta ->> 'terms_accepted', '') <> 'true' then
      raise exception 'You need to accept the terms to sign up.';
    end if;
    if v_name is null then
      raise exception 'Enter your name to sign up.';
    end if;
  end if;

  -- The account is made once the email is confirmed, so a stranger typing
  -- someone else's address leaves nothing behind.
  if new.email_confirmed_at is not null
     and not exists (select 1 from profiles where id = new.id) then
    insert into profiles (id, role, full_name) values (new.id, 'client', v_name);

    insert into clients (
      name, contact_email, contact_phone, owner_user_id,
      deal_model, share_percent, deduct_percent, monthly_fee,
      account_type, terms_accepted_at
    ) values (
      coalesce(v_name, new.email), new.email, left(nullif(trim(v_meta ->> 'phone'), ''), 30), new.id,
      'percent', 0, 0, 0,
      'host', now()
    ) returning id into v_client;

    insert into subscriptions (client_id, plan_key, status, trial_ends_at)
    values (v_client, 'starter', 'trial', now() + interval '14 days');
  end if;

  return new;
end $$;
revoke execute on function public.handle_host_signup() from public, anon, authenticated;

create trigger host_signup after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_host_signup();
