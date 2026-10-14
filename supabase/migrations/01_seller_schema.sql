-- التأكد من وجود الامتدادات المطلوبة
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- جدول معلومات التجار (profiles)
create table public.profiles (
    id uuid primary key references auth.users on delete cascade,
    username text unique,
    role text not null default 'user',
    full_name text,
    phone text,
    whatsapp text,
    store_name text,
    city text,
    verified boolean default false,
    rating numeric(3,2) default 0,
    total_ratings integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- جدول الهواتف
create table public.phones (
    id uuid primary key default uuid_generate_v4(),
    seller_id uuid not null references public.profiles(id) on delete cascade,
    title text not null,
    brand text,
    model text,
    description text,
    price numeric(12,2) not null,
    condition text not null, -- new, used, refurbished
    warranty_months integer default 0,
    specs jsonb not null default '{}'::jsonb,
    city text not null,
    contact_methods jsonb not null default '{}'::jsonb,
    imei_encrypted bytea,
    imei_hash text,
    status text not null default 'pending',
    featured boolean default false,
    views_count integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- جدول صور الهواتف
create table public.phone_images (
    id uuid primary key default uuid_generate_v4(),
    phone_id uuid not null references public.phones(id) on delete cascade,
    image_path text not null,
    main_image boolean default false,
    "order" integer default 0,
    created_at timestamptz default now()
);

-- جدول تقييمات التجار
create table public.seller_reviews (
    id uuid primary key default uuid_generate_v4(),
    seller_id uuid not null references public.profiles(id) on delete cascade,
    reviewer_id uuid not null references auth.users(id) on delete cascade,
    rating integer not null check (rating between 1 and 5),
    comment text,
    created_at timestamptz default now()
);

-- Indexes للبحث السريع
create index idx_phones_seller on public.phones(seller_id);
create index idx_phones_status on public.phones(status);
create index idx_phones_city on public.phones(city);
create index idx_phones_price on public.phones(price);
create index idx_phones_specs on public.phones using gin (specs);
create index idx_phone_images_phone on public.phone_images(phone_id);
create index idx_seller_reviews_seller on public.seller_reviews(seller_id);

-- RLS Policies

-- سياسات profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
    on public.profiles for select
    using (true);

create policy "Users can update own profile"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- سياسات phones
alter table public.phones enable row level security;

create policy "Active phones are viewable by everyone"
    on public.phones for select
    using (status = 'active');

create policy "Sellers can manage their own phones"
    on public.phones for all
    using (auth.uid() = seller_id)
    with check (auth.uid() = seller_id);

-- سياسات phone_images
alter table public.phone_images enable row level security;

create policy "Phone images are viewable by everyone"
    on public.phone_images for select
    using (true);

create policy "Sellers can manage their phone images"
    on public.phone_images for all
    using (
        exists (
            select 1 from public.phones
            where phones.id = phone_images.phone_id
            and phones.seller_id = auth.uid()
        )
    );

-- سياسات seller_reviews
alter table public.seller_reviews enable row level security;

create policy "Reviews are viewable by everyone"
    on public.seller_reviews for select
    using (true);

create policy "Authenticated users can create reviews"
    on public.seller_reviews for insert
    with check (auth.uid() = reviewer_id);

-- Functions

-- دالة تحديث تقييم التاجر
create or replace function update_seller_rating()
returns trigger as $$
begin
    update public.profiles
    set 
        rating = (
            select coalesce(avg(rating)::numeric(3,2), 0)
            from public.seller_reviews
            where seller_id = new.seller_id
        ),
        total_ratings = (
            select count(*)
            from public.seller_reviews
            where seller_id = new.seller_id
        )
    where id = new.seller_id;
    return new;
end;
$$ language plpgsql security definer;

-- Trigger لتحديث تقييم التاجر تلقائياً
create trigger update_seller_rating_trigger
after insert or update or delete on public.seller_reviews
for each row execute function update_seller_rating();

-- View للهواتف النشطة (بدون IMEI)
create view public.active_phones as
select 
    p.id,
    p.seller_id,
    p.title,
    p.brand,
    p.model,
    p.description,
    p.price,
    p.condition,
    p.warranty_months,
    p.specs,
    p.city,
    p.contact_methods,
    p.featured,
    p.views_count,
    p.created_at,
    p.updated_at,
    s.username as seller_username,
    s.store_name as seller_store,
    s.rating as seller_rating,
    s.verified as seller_verified,
    (
        select json_agg(json_build_object(
            'id', pi.id,
            'path', pi.image_path,
            'main', pi.main_image,
            'order', pi."order"
        ))
        from public.phone_images pi
        where pi.phone_id = p.id
        order by pi.main_image desc, pi."order" asc
    ) as images
from public.phones p
join public.profiles s on s.id = p.seller_id
where p.status = 'active';

-- منح صلاحيات الوصول للـ view
grant select on public.active_phones to anon;
grant select on public.active_phones to authenticated;