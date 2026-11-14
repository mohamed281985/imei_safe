alter table public.ads_payment
  add column if not exists promo_code text;

notify pgrst, 'reload schema';