create table if not exists public.promo_code (
  id uuid primary key default gen_random_uuid(),
  promo_code text not null,
  discount_percentage numeric(5, 2) not null
    check (discount_percentage > 0 and discount_percentage <= 100),
  duration_days integer not null
    check (duration_days > 0),
  is_active boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists promo_code_value_unique
  on public.promo_code (lower(btrim(promo_code)));

create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null
    references public.promo_code(id) on delete restrict,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  payment_reference text,
  redeemed_at timestamptz not null default now(),
  constraint promo_code_one_use_per_user
    unique (promo_code_id, user_id)
);

create index if not exists promo_code_redemptions_user_date_idx
  on public.promo_code_redemptions (user_id, redeemed_at desc);

alter table public.promo_code enable row level security;
alter table public.promo_code_redemptions enable row level security;

revoke all on table public.promo_code from public, anon, authenticated;
revoke all on table public.promo_code_redemptions from public, anon, authenticated;

notify pgrst, 'reload schema';