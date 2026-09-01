-- What a unit holds and what it is quoted at, so availability can be searched
-- by requirement and not only by date.
--
-- Deliberately NOT stack_rate: that is the owner's guaranteed per-night floor
-- in the ads / fixed_stack deal models, properties_v blanks it for ops, and it
-- is not the number a guest is told. These three are guest-facing asking
-- figures, so they stay visible to everyone who answers an enquiry, ops
-- included -- the same call already made for bookings.sale_price.
alter table public.properties
  add column if not exists max_guests integer,
  add column if not exists nightly_rate numeric,
  add column if not exists short_stay_rate numeric;

alter table public.properties drop constraint if exists properties_max_guests_positive;
alter table public.properties add constraint properties_max_guests_positive
  check (max_guests is null or max_guests > 0);

alter table public.properties drop constraint if exists properties_nightly_rate_nonneg;
alter table public.properties add constraint properties_nightly_rate_nonneg
  check (nightly_rate is null or nightly_rate >= 0);

alter table public.properties drop constraint if exists properties_short_stay_rate_nonneg;
alter table public.properties add constraint properties_short_stay_rate_nonneg
  check (short_stay_rate is null or short_stay_rate >= 0);

comment on column public.properties.max_guests is
  'How many guests the unit sleeps. Null = not recorded yet; the availability finder groups those separately rather than guessing.';
comment on column public.properties.nightly_rate is
  'Asking price per night, PKR. Guest-facing, not a deal term - see stack_rate for that.';
comment on column public.properties.short_stay_rate is
  'Asking price for one short-stay (hourly) window, PKR. Flat per stay, matching how short_stay_stack_rate is applied.';

-- The view lists its columns explicitly, so it has to be recreated to pass the
-- new ones through. Unchanged otherwise: same order, same ops blanking, still
-- security_invoker = false so its WHERE clause is the access rule.
create or replace view public.properties_v with (security_invoker = false) as
 SELECT id,
    client_id,
    name,
    location,
    city,
    type,
    status,
    created_at,
    province,
        CASE
            WHEN NOT is_ops() THEN stack_rate
            ELSE NULL::numeric
        END AS stack_rate,
        CASE
            WHEN NOT is_ops() THEN short_stay_stack_rate
            ELSE NULL::numeric
        END AS short_stay_stack_rate,
    max_guests,
    nightly_rate,
    short_stay_rate
   FROM properties p
  WHERE is_staff() OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE c.id = p.client_id AND c.owner_user_id = auth.uid()));
