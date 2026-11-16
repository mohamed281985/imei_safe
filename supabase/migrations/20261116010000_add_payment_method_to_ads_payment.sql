alter table public.ads_payment
  add column if not exists payment_method text not null default 'card';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ads_payment_method_valid'
      and conrelid = 'public.ads_payment'::regclass
  ) then
    alter table public.ads_payment
      add constraint ads_payment_method_valid
      check (payment_method in ('card', 'wallet'));
  end if;
end;
$$;

notify pgrst, 'reload schema';
