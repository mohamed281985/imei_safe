alter table public.business_offers
  add column if not exists currency_symbol text not null default 'EGP';

update public.business_offers as offer
set currency_symbol = coalesce(
  (
    select nullif(trim(country.currency_symbol), '')
    from public.users as owner
    join public.countries as country
      on lower(trim(country.name_ar)) = lower(trim(owner.countries))
      or lower(trim(country.name_en)) = lower(trim(owner.countries))
    where owner.id = offer.user_id
    limit 1
  ),
  'EGP'
);

notify pgrst, 'reload schema';