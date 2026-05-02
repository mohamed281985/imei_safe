-- Allow authenticated users to insert their own notification rows.
-- This fixes row-level security failures when the app creates a notification from the client.

alter table if exists public.notifications enable row level security;

-- INSERT must allow the authenticated user to set their own user_id.
drop policy if exists notifications_insert_owner_only on public.notifications;
create policy notifications_insert_owner_only
on public.notifications
for insert
to authenticated
with check (auth.uid() = user_id);

-- DELETE should also be scoped to the owning user if delete actions are required.
drop policy if exists notifications_delete_owner_only on public.notifications;
create policy notifications_delete_owner_only
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id);
