-- Harden RLS for core IMEI tables.
-- Apply this in Supabase SQL editor (or as migration) in production.

begin;

-- -------------------------------------------------------------------
-- 1) phone_reports
-- -------------------------------------------------------------------
alter table if exists public.phone_reports enable row level security;
alter table if exists public.phone_reports force row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'phone_reports'
  loop
    execute format('drop policy if exists %I on public.phone_reports', p.policyname);
  end loop;
end
$$;

create policy phone_reports_select_owner_or_assigned_finder
on public.phone_reports
for select
to authenticated
using (
  auth.uid() is not null
  and (
    user_id = auth.uid()
    or finder_user_id = auth.uid()
  )
);

create policy phone_reports_insert_owner_only
on public.phone_reports
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy phone_reports_update_owner_only
on public.phone_reports
for update
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
)
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy phone_reports_delete_owner_only
on public.phone_reports
for delete
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
);

-- -------------------------------------------------------------------
-- 2) registered_phones
-- -------------------------------------------------------------------
alter table if exists public.registered_phones enable row level security;
alter table if exists public.registered_phones force row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'registered_phones'
  loop
    execute format('drop policy if exists %I on public.registered_phones', p.policyname);
  end loop;
end
$$;

create policy registered_phones_select_owner_only
on public.registered_phones
for select
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy registered_phones_insert_owner_only
on public.registered_phones
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy registered_phones_update_owner_only
on public.registered_phones
for update
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
)
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy registered_phones_delete_owner_only
on public.registered_phones
for delete
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
);

-- -------------------------------------------------------------------
-- 3) transfer_records
-- -------------------------------------------------------------------
-- This table currently has no stable owner FK (e.g. seller_user_id/buyer_user_id)
-- in rows, so safest policy is server-only access.
alter table if exists public.transfer_records enable row level security;
alter table if exists public.transfer_records force row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'transfer_records'
  loop
    execute format('drop policy if exists %I on public.transfer_records', p.policyname);
  end loop;
end
$$;

create policy transfer_records_no_client_select
on public.transfer_records
for select
to authenticated
using (false);

create policy transfer_records_no_client_insert
on public.transfer_records
for insert
to authenticated
with check (false);

create policy transfer_records_no_client_update
on public.transfer_records
for update
to authenticated
using (false)
with check (false);

create policy transfer_records_no_client_delete
on public.transfer_records
for delete
to authenticated
using (false);

-- Extra defense in depth for direct grants
revoke all on table public.phone_reports from anon;
revoke all on table public.registered_phones from anon;
revoke all on table public.transfer_records from anon;
revoke all on table public.transfer_records from authenticated;

commit;
