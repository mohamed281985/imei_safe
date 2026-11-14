alter table public.ads_payment
  add column if not exists promo_code text,
  add column if not exists promo_duration_months integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ads_payment'::regclass
      and conname = 'ads_payment_promo_duration_months_positive'
  ) then
    alter table public.ads_payment
      add constraint ads_payment_promo_duration_months_positive
      check (promo_duration_months is null or promo_duration_months > 0);
  end if;
end;
$$;

notify pgrst, 'reload schema';