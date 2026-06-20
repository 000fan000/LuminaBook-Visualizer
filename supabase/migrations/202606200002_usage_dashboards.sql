alter table public.usage_events
  add column if not exists response_status integer,
  add column if not exists elapsed_ms integer,
  add column if not exists estimated_cost_microusd bigint not null default 0;

create table if not exists public.account_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  daily_allowance_override bigint check (daily_allowance_override is null or daily_allowance_override between 0 and 10000000),
  admin_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);
create index if not exists usage_events_operation_created_idx on public.usage_events (operation, created_at desc);
create index if not exists usage_events_status_created_idx on public.usage_events (status, created_at desc);

alter table public.account_admins enable row level security;
alter table public.account_controls enable row level security;
alter table public.admin_audit_log enable row level security;

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
  v_status text := 'active';
  v_allowance bigint := 50000;
begin
  select
    coalesce((select status from public.account_controls where user_id = p_user_id), 'active'),
    coalesce((select daily_allowance_override from public.account_controls where user_id = p_user_id), 50000)
  into v_status, v_allowance;

  if v_status = 'suspended' then
    return query select false, 0::bigint, 'account_suspended';
    return;
  end if;

  if p_reserved_units <= 0 or p_reserved_units > 250000 then
    return query select false, 0::bigint, 'invalid_reservation';
    return;
  end if;

  if exists (select 1 from public.usage_events where request_id = p_request_id) then
    return query select false, 0::bigint, 'duplicate_request';
    return;
  end if;

  insert into public.quota_periods (user_id, period_key, allowance_units)
  values (p_user_id, v_period, v_allowance)
  on conflict (user_id, period_key) do update
  set allowance_units = excluded.allowance_units, updated_at = now();

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

create or replace function public.settle_daily_quota_v2(
  p_request_id text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_charged_units bigint,
  p_response_status integer,
  p_elapsed_ms integer,
  p_estimated_cost_microusd bigint
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
      response_status = p_response_status,
      elapsed_ms = greatest(p_elapsed_ms, 0),
      estimated_cost_microusd = greatest(p_estimated_cost_microusd, 0),
      status = 'completed',
      settled_at = now()
  where id = v_event.id;

  return v_remaining;
end;
$$;

create or replace function public.release_daily_quota_v2(
  p_request_id text,
  p_error_code text default null,
  p_response_status integer default null,
  p_elapsed_ms integer default null
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
  set reserved_units = greatest(reserved_units - v_event.reserved_units, 0), updated_at = now()
  where user_id = v_event.user_id and period_key = v_event.period_key
  returning greatest(allowance_units - used_units - reserved_units, 0) into v_remaining;

  update public.usage_events
  set status = 'failed',
      error_code = left(p_error_code, 100),
      response_status = p_response_status,
      elapsed_ms = greatest(coalesce(p_elapsed_ms, 0), 0),
      settled_at = now()
  where id = v_event.id;

  return v_remaining;
end;
$$;

revoke all on table public.account_admins, public.account_controls, public.admin_audit_log from public, anon, authenticated;
revoke all on function public.settle_daily_quota_v2(text, text, integer, integer, bigint, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.release_daily_quota_v2(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.settle_daily_quota_v2(text, text, integer, integer, bigint, integer, integer, bigint) to service_role;
grant execute on function public.release_daily_quota_v2(text, text, integer, integer) to service_role;
