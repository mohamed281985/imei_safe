insert into public.promo_code (
  promo_code,
  discount_percentage,
  duration_days,
  is_active,
  expires_at
)
values (
  'M5',
  50,
  365,
  true,
  now() + interval '30 days'
)
on conflict ((lower(btrim(promo_code)))) do nothing;

notify pgrst, 'reload schema';
