-- Session control: who is signed in where, and signing them out.
--
-- `auth.sessions` knows a session exists and when it was last refreshed, but
-- the app refreshes tokens from the server, so its user_agent / ip say
-- "Vercel Edge Functions". The login action records the real browser here,
-- once, keyed by the session; it goes when the session goes.

create table public.session_devices (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

alter table public.session_devices enable row level security;
revoke all on public.session_devices from anon, authenticated;

-- Called by the login action straight after a successful sign-in.
create or replace function public.record_session_device(p_user_agent text, p_ip text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or v_session is null then
    return;
  end if;
  insert into session_devices (session_id, user_id, user_agent, ip)
  values (v_session, auth.uid(), left(p_user_agent, 400), left(p_ip, 60))
  on conflict (session_id) do nothing;
end;
$$;

revoke all on function public.record_session_device(text, text) from public, anon;
grant execute on function public.record_session_device(text, text) to authenticated;

-- The admin may list anyone's sessions; everyone may list their own.
create or replace function public.list_user_sessions(p_user_id uuid)
returns table (
  id uuid,
  signed_in_at timestamptz,
  last_active timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.id,
         s.created_at,
         greatest(s.updated_at, s.refreshed_at at time zone 'utc'),
         d.user_agent,
         d.ip,
         s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    from auth.sessions s
    left join public.session_devices d on d.session_id = s.id
   where s.user_id = p_user_id
     and (p_user_id = auth.uid() or public.is_admin())
     and (s.not_after is null or s.not_after > now())
   order by 3 desc nulls last;
$$;

revoke all on function public.list_user_sessions(uuid) from public, anon;
grant execute on function public.list_user_sessions(uuid) to authenticated;

-- One session, or all of a person's (keeping the caller's own when asked).
-- Deleting the session revokes its refresh tokens; the middleware's
-- getUser() on the next request finds it gone and sends them to sign in.
create or replace function public.end_user_sessions(
  p_user_id uuid,
  p_session_id uuid default null,
  p_keep_current boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_n integer;
  v_actor record;
  v_email text;
begin
  if not (p_user_id = auth.uid() or public.is_admin()) then
    raise exception 'You can only sign out your own devices';
  end if;

  delete from auth.sessions
   where user_id = p_user_id
     and (p_session_id is null or id = p_session_id)
     and not (p_keep_current and id is not distinct from v_current);
  get diagnostics v_n = row_count;

  if v_n > 0 then
    select email into v_email from auth.users where id = p_user_id;
    select * into v_actor from public.audit_actor(auth.uid());
    insert into public.audit_log (actor_id, actor_name, actor_role, category, action, table_name, record_id, label)
    values (v_actor.actor_id, v_actor.actor_name, v_actor.actor_role, 'staff', 'signed_out', 'sessions',
            p_user_id::text, v_email || ' · ' || v_n || ' device' || case when v_n = 1 then '' else 's' end);
  end if;

  return v_n;
end;
$$;

revoke all on function public.end_user_sessions(uuid, uuid, boolean) from public, anon;
grant execute on function public.end_user_sessions(uuid, uuid, boolean) to authenticated;
