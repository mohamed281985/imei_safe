alter table public.ads_payment
  add column if not exists promo_code text;

alter table public.promo_code
  add column if not exists description text not null default '',
  add column if not exists starts_at timestamptz,
  add column if not exists max_redemptions integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'promo_code_max_redemptions_positive'
      and conrelid = 'public.promo_code'::regclass
  ) then
    alter table public.promo_code
      add constraint promo_code_max_redemptions_positive
      check (max_redemptions is null or max_redemptions > 0);
  end if;
end;
$$;

notify pgrst, 'reload schema';