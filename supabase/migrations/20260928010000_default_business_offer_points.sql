alter table public.business_offers
  alter column coins_required set default 500;

notify pgrst, 'reload schema';