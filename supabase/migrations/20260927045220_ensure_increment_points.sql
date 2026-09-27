create or replace function public.increment_points(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Point amount must be positive';
  end if;

  if auth.role() is distinct from 'service_role'
    and auth.uid() is distinct from p_user_id then
    raise exception 'Not allowed to change another user point balance'
      using errcode = '42501';
  end if;

  insert into public.users_plans (user_id, points)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
    set points = coalesce(public.users_plans.points, 0) + excluded.points;
end;
$$;

revoke all on function public.increment_points(uuid, integer) from public, anon;
grant execute on function public.increment_points(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';