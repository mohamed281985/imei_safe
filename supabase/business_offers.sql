-- Business offer submissions and review workflow.
-- Apply in the Supabase SQL editor after the businesses table exists.

begin;

create table if not exists public.business_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  business_name text not null default '',
  product_name text not null check (char_length(product_name) between 1 and 120),
  description text not null check (char_length(description) between 1 and 1500),
  category text not null default 'Other',
  store_latitude double precision check (store_latitude between -90 and 90),
  store_longitude double precision check (store_longitude between -180 and 180),
  original_price numeric(12, 2) not null check (original_price > 0),
  offer_price numeric(12, 2) not null check (offer_price > 0 and offer_price < original_price),
  discount_percent integer not null check (discount_percent between 1 and 100),
  coins_required integer not null default 0 check (coins_required >= 0),
  expires_at timestamptz not null,
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused', 'expired')),
  is_active boolean not null default false,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_offers
  add column if not exists store_latitude double precision check (store_latitude between -90 and 90);
alter table public.business_offers
  add column if not exists store_longitude double precision check (store_longitude between -180 and 180);

alter table public.business_offers
  drop column if exists available_quantity;
alter table public.business_offers
  drop column if exists brand;

create table if not exists public.business_offer_images (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.business_offers(id) on delete cascade,
  image_path text not null,
  main_image boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (offer_id, image_path)
);

create index if not exists business_offers_business_created_idx
  on public.business_offers (business_id, created_at desc);
create index if not exists business_offers_status_active_expiry_idx
  on public.business_offers (status, is_active, expires_at);
create index if not exists business_offer_images_offer_sort_idx
  on public.business_offer_images (offer_id, sort_order);

alter table public.business_offers enable row level security;
alter table public.business_offer_images enable row level security;

drop policy if exists "Businesses can view their own offers" on public.business_offers;
create policy "Businesses can view their own offers"
  on public.business_offers for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Approved offers are publicly viewable" on public.business_offers;
create policy "Approved offers are publicly viewable"
  on public.business_offers for select to anon, authenticated
  using (status = 'approved' and is_active = true and expires_at > now());

drop policy if exists "Businesses can view their own offer images" on public.business_offer_images;
create policy "Businesses can view their own offer images"
  on public.business_offer_images for select to authenticated
  using (
    exists (
      select 1 from public.business_offers offer
      where offer.id = offer_id and offer.user_id = auth.uid()
    )
  );

drop policy if exists "Approved offer images are publicly viewable" on public.business_offer_images;
create policy "Approved offer images are publicly viewable"
  on public.business_offer_images for select to anon, authenticated
  using (
    exists (
      select 1 from public.business_offers offer
      where offer.id = offer_id
        and offer.status = 'approved'
        and offer.is_active = true
        and offer.expires_at > now()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-offer-images',
  'business-offer-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Businesses upload offer images to own folder" on storage.objects;
create policy "Businesses upload offer images to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'business-offer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Businesses update offer images in own folder" on storage.objects;
create policy "Businesses update offer images in own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'business-offer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'business-offer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Businesses delete offer images in own folder" on storage.objects;
create policy "Businesses delete offer images in own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'business-offer-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Offer images are publicly readable" on storage.objects;
create policy "Offer images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'business-offer-images');

commit;