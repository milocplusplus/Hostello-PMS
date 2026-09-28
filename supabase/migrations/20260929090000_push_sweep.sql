-- ── Push for alerts the database raises on its own ──────────────────────────
--
-- Until now only the app sent Web Push: a Server Action writes a notification
-- and hands its id to `deliverPush`. Everything the database raises by itself
-- — channel emails, the calendar sync, the morning jobs, the health check —
-- reached the bell but never a phone, because nothing in the database can call
-- the app. The owner asked for all of it to reach phones (2026-09-29).
--
-- So a sweep: every minute, recipient rows 30 seconds to 15 minutes old that
-- nobody has pushed are claimed here and sent by the `push-sweep` edge
-- function. Thirty seconds is the app's head start — its own `deliverPush`
-- runs inside the request and stamps `pushed_at` long before — so the two
-- never send the same row. Fifteen minutes is how stale a push may be before
-- it is not worth a banner.
--
-- The VAPID keys live in Vault (`vapid_public_key`, `vapid_private_key`, and
-- optionally `vapid_subject`), never in a table or the repo — the same place
-- as `ical_sync_secret`. Without the private key the sweep does nothing, the
-- way `push.ts` does nothing without its env vars.

-- The shared secret between the schedule and the function.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_sweep_secret',
                           'Shared by run_push_sweep() and the push-sweep edge function.')
 where not exists (select 1 from vault.secrets where name = 'push_sweep_secret');

create function is_push_sweep_secret(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault', 'pg_temp'
as $fn$
  select exists (
    select 1 from vault.decrypted_secrets
     where name = 'push_sweep_secret' and decrypted_secret = p_secret
  );
$fn$;

-- Claims what is due and returns it with the keys to sign it. Claiming (the
-- `pushed_at` stamp) happens before sending, as `push.ts` does after: a push
-- sent twice is worse than one that never arrived, and the alert is in the
-- bell either way. Preferences are the same rule `push.ts` applies — push on
-- unless switched off, nothing in a muted category.
create function push_sweep_claim()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'vault', 'pg_temp'
as $fn$
declare
  v_public  text;
  v_private text;
  v_subject text;
  v_items   jsonb;
begin
  select decrypted_secret into v_public  from vault.decrypted_secrets where name = 'vapid_public_key';
  select decrypted_secret into v_private from vault.decrypted_secrets where name = 'vapid_private_key';
  select decrypted_secret into v_subject from vault.decrypted_secrets where name = 'vapid_subject';

  if v_public is null or v_private is null then
    return jsonb_build_object('keys', null, 'items', '[]'::jsonb);
  end if;

  with due as (
    update notification_recipients r
       set pushed_at = now()
     where r.pushed_at is null
       and r.created_at < now() - interval '30 seconds'
       and r.created_at > now() - interval '15 minutes'
    returning r.notification_id, r.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'subscription_id', s.id,
           'endpoint', s.endpoint,
           'p256dh', s.p256dh,
           'auth', s.auth,
           'title', n.title,
           'body', n.body,
           'category', n.category,
           -- The app resolves where it goes (notificationHref); see
           -- src/app/notifications/open/[id]/page.tsx.
           'url', '/notifications/open/' || n.id,
           'tag', n.kind || ':' || coalesce(n.booking_id, n.property_id, n.id)::text
         )), '[]'::jsonb)
    into v_items
    from due d
    join notifications n on n.id = d.notification_id
    join push_subscriptions s
      on s.user_id = d.user_id and s.platform = 'web' and s.failed_at is null
    left join notification_preferences np on np.user_id = d.user_id
   where coalesce(np.push_enabled, true)
     and not (n.category = any(coalesce(np.muted_categories, '{}'::text[])));

  return jsonb_build_object(
    'keys', jsonb_build_object(
      'public', v_public,
      'private', v_private,
      'subject', coalesce(v_subject, 'mailto:ops@hostello.pk')
    ),
    'items', v_items
  );
end;
$fn$;

-- 404/410 from a push service: the browser threw the subscription away.
create function push_sweep_dead(p_ids uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  update push_subscriptions set failed_at = now() where id = any(p_ids);
$fn$;

create function run_push_sweep()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'pg_temp'
as $fn$
declare
  v_secret text;
  v_request_id bigint;
begin
  -- Nothing waiting, or no key to sign with: don't wake the function.
  if not exists (
    select 1 from notification_recipients
     where pushed_at is null
       and created_at < now() - interval '30 seconds'
       and created_at > now() - interval '15 minutes'
  ) or not exists (select 1 from vault.secrets where name = 'vapid_private_key') then
    return null;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_sweep_secret';

  select net.http_post(
    url := 'https://vucfpfqcankyztzvmyht.supabase.co/functions/v1/push-sweep',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Sweep-Secret', v_secret),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$fn$;

revoke execute on function is_push_sweep_secret(text) from public, anon, authenticated;
revoke execute on function push_sweep_claim() from public, anon, authenticated;
revoke execute on function push_sweep_dead(uuid[]) from public, anon, authenticated;
revoke execute on function run_push_sweep() from public, anon, authenticated;
grant execute on function is_push_sweep_secret(text) to service_role;
grant execute on function push_sweep_claim() to service_role;
grant execute on function push_sweep_dead(uuid[]) to service_role;

select cron.schedule('hostello-push-sweep', '* * * * *', 'select public.run_push_sweep();');

-- ── A channel email nobody has looked at in two hours ───────────────────────
-- One reminder per mail (the owner's choice), to the same people the mail
-- itself went to, and pushed by the sweep like anything else.

create function notify_ota_waiting()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_n integer;
begin
  insert into notifications (kind, category, audience, title, body, client_id, property_id, booking_id, event_key)
  select 'ota_waiting', 'booking',
         case when m.kind = 'payout' then 'admin' else 'staff' end,
         'Channel email still waiting',
         coalesce(nullif(m.parsed ->> 'guest_name', ''), m.subject, 'A channel email') ||
           ' · arrived ' || to_char(m.received_at at time zone 'Asia/Karachi', 'HH24:MI') ||
           ' and nobody has reviewed it yet.',
         p.client_id, m.property_id, m.booking_id, 'ota-waiting:' || m.id
    from ota_messages m
    left join properties p on p.id = m.property_id
   where m.status in ('pending', 'needs_property', 'failed')
     and m.received_at < now() - interval '2 hours'
     and m.received_at > now() - interval '2 days'
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke execute on function notify_ota_waiting() from public, anon, authenticated;

select cron.schedule('hostello-ota-waiting', '*/10 * * * *', 'select public.notify_ota_waiting();');

-- ── Channel emails go to ops too ────────────────────────────────────────────
-- Every kind but payout (money ops never sees). `record_ota_message` is long
-- and otherwise unchanged, so its audience is rewritten in place, and the
-- rewrite refuses to run if the text it expects has moved.

do $do$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(
    'record_ota_message(text,text,text,text,text,text,text,text,text,jsonb,text)'::regprocedure
  );
  if position($x$v_notif_kind, v_category, 'admin', v_title$x$ in v_def) = 0 then
    raise exception 'record_ota_message changed: audience line not found';
  end if;
  v_def := replace(v_def,
    $x$v_notif_kind, v_category, 'admin', v_title$x$,
    $x$v_notif_kind, v_category, case when v_kind = 'payout' then 'admin' else 'staff' end, v_title$x$);
  v_def := replace(v_def,
    '-- Admin-only, every kind. The owner hears nothing yet',
    '-- Admin and ops (payout mails admin only). The owner hears nothing yet');
  execute v_def;
end;
$do$;
