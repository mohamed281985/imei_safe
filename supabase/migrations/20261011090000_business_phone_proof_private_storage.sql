begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-phone-proof', 'business-phone-proof', false, 4194304, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 4194304,
    allowed_mime_types = array['image/webp'];

create table if not exists public.business_phone_proofs (
  phone_id uuid primary key references public.phones(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  box_imei_image_path text not null,
  phone_imei_image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.business_phone_proofs enable row level security;
alter table public.business_phone_proofs force row level security;
revoke all on public.business_phone_proofs from anon, authenticated;
grant select, insert, update, delete on public.business_phone_proofs to service_role;

commit;