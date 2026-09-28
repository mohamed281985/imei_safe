create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  offer_id uuid not null references public.business_offers(id) on delete restrict,
  redemption_code text not null unique,
  product_name text not null,
  business_name text not null,
  coins_used integer not null check (coins_used >= 0),
  original_price numeric(12, 2) not null,
  offer_price numeric(12, 2) not null,
  currency_symbol text not null default 'EGP',
  status text not null default 'redeemed' check (status in ('redeemed', 'cancelled')),
  redeemed_at timestamptz not null default now()
);

create index if not exists reward_redemptions_business_date_idx
  on public.reward_redemptions (business_id, redeemed_at desc);
create index if not exists reward_redemptions_user_date_idx
  on public.reward_redemptions (user_id, redeemed_at desc);

alter table public.reward_redemptions enable row level security;
revoke all on table public.reward_redemptions from public, anon, authenticated;

create or replace function public.redeem_reward_offer(
  p_user_id uuid,
  p_offer_id uuid,
  p_business_id uuid,
  p_redemption_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer record;
  v_plan_id uuid;
  v_balance integer;
  v_redemption public.reward_redemptions%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_user_id is null or p_offer_id is null or p_business_id is null
    or nullif(trim(p_redemption_code), '') is null then
    raise exception 'Invalid redemption request' using errcode = '22023';
  end if;

  select offer.id, offer.business_id, offer.product_name, offer.business_name,
         offer.coins_required, offer.original_price, offer.offer_price, offer.currency_symbol
  into v_offer
  from public.business_offers as offer
  where offer.id = p_offer_id
    and offer.business_id = p_business_id
    and offer.status = 'approved'
    and offer.is_active = true
    and offer.expires_at > now();

  if not found then
    raise exception 'Offer is unavailable for this store' using errcode = 'P0002';
  end if;

  select plan.id, coalesce(plan.points, 0)::integer
  into v_plan_id, v_balance
  from public.users_plans as plan
  where plan.user_id = p_user_id
  order by plan.id
  limit 1
  for update;

  if not found then
    v_plan_id := null;
    v_balance := 0;
  end if;

  if v_balance < v_offer.coins_required then
    raise exception 'Insufficient points' using errcode = 'P0001';
  end if;

  if v_offer.coins_required > 0 then
    update public.users_plans
    set points = coalesce(points, 0) - v_offer.coins_required
    where id = v_plan_id
      and coalesce(points, 0) >= v_offer.coins_required;

    if not found then
      raise exception 'Insufficient points' using errcode = 'P0001';
    end if;
  end if;

  insert into public.reward_redemptions (
    user_id,
    business_id,
    offer_id,
    redemption_code,
    product_name,
    business_name,
    coins_used,
    original_price,
    offer_price,
    currency_symbol
  )
  values (
    p_user_id,
    p_business_id,
    p_offer_id,
    trim(p_redemption_code),
    v_offer.product_name,
    v_offer.business_name,
    v_offer.coins_required,
    v_offer.original_price,
    v_offer.offer_price,
    coalesce(nullif(trim(v_offer.currency_symbol), ''), 'EGP')
  )
  returning * into v_redemption;

  if v_plan_id is not null then
    select coalesce(plan.points, 0)::integer
    into v_balance
    from public.users_plans as plan
    where plan.id = v_plan_id;
  end if;

  return jsonb_build_object(
    'id', v_redemption.id,
    'user_id', v_redemption.user_id,
    'business_id', v_redemption.business_id,
    'offer_id', v_redemption.offer_id,
    'code', v_redemption.redemption_code,
    'product_name', v_redemption.product_name,
    'business_name', v_redemption.business_name,
    'coins_used', v_redemption.coins_used,
    'original_price', v_redemption.original_price,
    'offer_price', v_redemption.offer_price,
    'currency_symbol', v_redemption.currency_symbol,
    'status', v_redemption.status,
    'redeemed_at', v_redemption.redeemed_at,
    'current_balance', v_balance
  );
end;
$$;

revoke all on function public.redeem_reward_offer(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_reward_offer(uuid, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';