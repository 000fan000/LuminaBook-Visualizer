create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  home_region text not null default 'sg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quota_periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key date not null,
  allowance_units bigint not null default 50000 check (allowance_units >= 0),
  used_units bigint not null default 0 check (used_units >= 0),
  reserved_units bigint not null default 0 check (reserved_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null unique,
  period_key date not null,
  operation text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  reserved_units bigint not null default 0,
  charged_units bigint not null default 0,
  status text not null check (status in ('reserved', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists usage_events_user_created_idx on public.usage_events (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.quota_periods enable row level security;
alter table public.usage_events enable row level security;

create policy "profiles are readable by their owner" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles are editable by their owner" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quota is readable by its owner" on public.quota_periods for select using (auth.uid() = user_id);
create policy "usage is readable by its owner" on public.usage_events for select using (auth.uid() = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, locale, timezone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'locale', 'en'),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create or replace function public.reserve_daily_quota(
  p_user_id uuid,
  p_request_id text,
  p_operation text,
  p_reserved_units bigint
)
returns table (accepted boolean, remaining_units bigint, reason text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_period date := (now() at time zone 'UTC')::date;
  v_remaining bigint;
begin
  if p_reserved_units <= 0 or p_reserved_units > 50000 then
    return query select false, 0::bigint, 'invalid_reservation';
    return;
  end if;

  if exists (select 1 from public.usage_events where request_id = p_request_id) then
    return query select false, 0::bigint, 'duplicate_request';
    return;
  end if;

  insert into public.quota_periods (user_id, period_key)
  values (p_user_id, v_period)
  on conflict (user_id, period_key) do nothing;

  update public.quota_periods
  set reserved_units = reserved_units + p_reserved_units, updated_at = now()
  where user_id = p_user_id
    and period_key = v_period
    and allowance_units - used_units - reserved_units >= p_reserved_units
  returning allowance_units - used_units - reserved_units into v_remaining;

  if not found then
    select greatest(allowance_units - used_units - reserved_units, 0)
    into v_remaining
    from public.quota_periods
    where user_id = p_user_id and period_key = v_period;
    return query select false, coalesce(v_remaining, 0), 'quota_exhausted';
    return;
  end if;

  insert into public.usage_events (user_id, request_id, period_key, operation, reserved_units, status)
  values (p_user_id, p_request_id, v_period, p_operation, p_reserved_units, 'reserved');

  return query select true, v_remaining, null::text;
end;
$$;

create or replace function public.settle_daily_quota(
  p_request_id text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_charged_units bigint
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.usage_events%rowtype;
  v_remaining bigint;
begin
  select * into v_event from public.usage_events where request_id = p_request_id for update;
  if not found or v_event.status <> 'reserved' then
    raise exception 'reservation_not_found';
  end if;

  update public.quota_periods
  set reserved_units = greatest(reserved_units - v_event.reserved_units, 0),
      used_units = used_units + greatest(p_charged_units, 0),
      updated_at = now()
  where user_id = v_event.user_id and period_key = v_event.period_key
  returning greatest(allowance_units - used_units - reserved_units, 0) into v_remaining;

  update public.usage_events
  set model = p_model,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      charged_units = greatest(p_charged_units, 0),
      status = 'completed',
      settled_at = now()
  where id = v_event.id;

  return v_remaining;
end;
$$;

create or replace function public.release_daily_quota(p_request_id text, p_error_code text default null)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.usage_events%rowtype;
  v_remaining bigint;
begin
  select * into v_event from public.usage_events where request_id = p_request_id for update;
  if not found or v_event.status <> 'reserved' then
    raise exception 'reservation_not_found';
  end if;

  update public.quota_periods
  set reserved_units = greatest(reserved_units - v_event.reserved_units, 0), updated_at = now()
  where user_id = v_event.user_id and period_key = v_event.period_key
  returning greatest(allowance_units - used_units - reserved_units, 0) into v_remaining;

  update public.usage_events
  set status = 'failed', error_code = left(p_error_code, 100), settled_at = now()
  where id = v_event.id;

  return v_remaining;
end;
$$;

revoke all on function public.reserve_daily_quota(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.settle_daily_quota(text, text, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.release_daily_quota(text, text) from public, anon, authenticated;
grant execute on function public.reserve_daily_quota(uuid, text, text, bigint) to service_role;
grant execute on function public.settle_daily_quota(text, text, integer, integer, bigint) to service_role;
grant execute on function public.release_daily_quota(text, text) to service_role;

