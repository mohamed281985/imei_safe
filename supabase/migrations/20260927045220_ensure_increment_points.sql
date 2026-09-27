create or replace function public.increment_points(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_email text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Point amount must be positive';
  end if;

  if auth.role() is distinct from 'service_role'
    and auth.uid() is distinct from p_user_id then
    raise exception 'Not allowed to change another user point balance'
      using errcode = '42501';
  end if;

  update public.users_plans
  set points = coalesce(points, 0) + p_amount
  where id = (
    select id
    from public.users_plans
    where user_id = p_user_id
    order by id
    limit 1
  );

  if not found then
    select role, email into v_role, v_email
    from public.users
    where id = p_user_id;

    insert into public.users_plans (
      id,
      user_id,
      email,
      role,
      used_search_imei,
      used_register_phone,
      used_search_history,
      used_print_history,
      used_game,
      used_notify_in_app,
      used_notify_email,
      used_notify_push,
      silver_ad,
      gold_ad,
      points
    )
    values (
      p_user_id,
      p_user_id,
      v_email,
      coalesce(v_role, 'free_user'),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      p_amount
    )
    on conflict (id) do update
      set points = coalesce(public.users_plans.points, 0) + excluded.points;
  end if;
end;
$$;

revoke all on function public.increment_points(uuid, integer) from public, anon;
grant execute on function public.increment_points(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';