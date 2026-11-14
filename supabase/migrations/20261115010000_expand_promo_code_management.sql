alter table public.promo_code
  add column if not exists description text,
  add column if not exists starts_at timestamptz,
  add column if not exists max_redemptions integer;

alter table public.promo_code
  drop constraint if exists promo_code_max_redemptions_positive;

alter table public.promo_code
  add constraint promo_code_max_redemptions_positive
  check (max_redemptions is null or max_redemptions > 0);

alter table public.ads_payment
  add column if not exists promo_code_id uuid
    references public.promo_code(id) on delete set null;

create index if not exists ads_payment_promo_code_id_idx
  on public.ads_payment (promo_code_id, payment_date desc);

update public.ads_payment as payment
set promo_code_id = promo.id
from public.promo_code as promo
where payment.promo_code_id is null
  and payment.promo_code is not null
  and lower(btrim(payment.promo_code)) = lower(btrim(promo.promo_code));

notify pgrst, 'reload schema';