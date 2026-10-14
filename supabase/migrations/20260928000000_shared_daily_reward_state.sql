create table public.daily_reward_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_days smallint[] not null default array[]::smallint[],
  last_claim_date date
);

alter table public.daily_reward_state enable row level security;
revoke all on table public.daily_reward_state from public, anon, authenticated;

create or replace function public.get_daily_reward_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_claimed_days smallint[] := array[]::smallint[];
  v_last_claim_date date;
  v_claimed_today boolean := false;
  v_today_day integer := 1;
  v_amount integer := 20;
  v_current_balance integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select state.claimed_days, state.last_claim_date
  into v_claimed_days, v_last_claim_date
  from public.daily_reward_state as state
  where state.user_id = v_user_id;

  if not found then
    v_claimed_days := array[]::smallint[];
    v_last_claim_date := null;
  end if;

  if cardinality(v_claimed_days) >= 7 and v_last_claim_date is distinct from v_today then
    v_claimed_days := array[]::smallint[];
  end if;

  v_claimed_today := v_last_claim_date = v_today;
  if v_claimed_today then
    v_today_day := greatest(cardinality(v_claimed_days), 1);
  else
    v_today_day := least(cardinality(v_claimed_days) + 1, 7);
  end if;

  v_amount := case v_today_day
    when 1 then 20
    when 2 then 30
    when 3 then 40
    when 4 then 50
    when 5 then 75
    when 6 then 100
    else 200
  end;

  select coalesce(plan.points, 0)::integer
  into v_current_balance
  from public.users_plans as plan
  where plan.user_id = v_user_id
  order by plan.id
  limit 1;

  return jsonb_build_object(
    'claimed_days', to_jsonb(v_claimed_days),
    'claimed_today', v_claimed_today,
    'today_day', v_today_day,
    'amount', v_amount,
    'current_balance', coalesce(v_current_balance, 0),
    'server_date', v_today
  );
end;
$$;

create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_claimed_days smallint[];
  v_last_claim_date date;
  v_today_day integer;
  v_amount integer;
  v_current_balance integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.daily_reward_state (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select state.claimed_days, state.last_claim_date
  into v_claimed_days, v_last_claim_date
  from public.daily_reward_state as state
  where state.user_id = v_user_id
  for update;

  if v_last_claim_date = v_today then
    v_today_day := greatest(cardinality(v_claimed_days), 1);
    v_amount := case v_today_day
      when 1 then 20
      when 2 then 30
      when 3 then 40
      when 4 then 50
      when 5 then 75
      when 6 then 100
      else 200
    end;

    select coalesce(plan.points, 0)::integer
    into v_current_balance
    from public.users_plans as plan
    where plan.user_id = v_user_id
    order by plan.id
    limit 1;

    return jsonb_build_object(
      'already_claimed', true,
      'claimed_days', to_jsonb(v_claimed_days),
      'claimed_today', true,
      'today_day', v_today_day,
      'amount', v_amount,
      'current_balance', coalesce(v_current_balance, 0),
      'server_date', v_today
    );
  end if;

  if cardinality(v_claimed_days) >= 7 then
    v_claimed_days := array[]::smallint[];
  end if;

  v_today_day := cardinality(v_claimed_days) + 1;
  v_amount := case v_today_day
    when 1 then 20
    when 2 then 30
    when 3 then 40
    when 4 then 50
    when 5 then 75
    when 6 then 100
    else 200
  end;
  v_claimed_days := array_append(v_claimed_days, v_today_day::smallint);

  update public.daily_reward_state
  set claimed_days = v_claimed_days,
      last_claim_date = v_today
  where user_id = v_user_id;

  perform public.increment_points(v_user_id, v_amount);

  select coalesce(plan.points, 0)::integer
  into v_current_balance
  from public.users_plans as plan
  where plan.user_id = v_user_id
  order by plan.id
  limit 1;

  return jsonb_build_object(
    'already_claimed', false,
    'claimed_days', to_jsonb(v_claimed_days),
    'claimed_today', true,
    'today_day', v_today_day,
    'amount', v_amount,
    'current_balance', coalesce(v_current_balance, 0),
    'server_date', v_today
  );
end;
$$;

revoke all on function public.get_daily_reward_status() from public, anon;
revoke all on function public.claim_daily_reward() from public, anon;
grant execute on function public.get_daily_reward_status() to authenticated;
grant execute on function public.claim_daily_reward() to authenticated;

notify pgrst, 'reload schema';