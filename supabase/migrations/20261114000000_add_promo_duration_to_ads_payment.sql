alter table public.ads_payment
  add column if not exists promo_duration_months integer
  check (promo_duration_months is null or promo_duration_months > 0);

notify pgrst, 'reload schema';
