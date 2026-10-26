create or replace function public.reset_business_review_for_resubmission(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.businesses
  set status = 'pending',
      reason = null
  where user_id = p_user_id;

  if not found then
    raise exception 'business_not_found';
  end if;
end;
$$;

revoke all on function public.reset_business_review_for_resubmission(uuid) from public, anon, authenticated;
grant execute on function public.reset_business_review_for_resubmission(uuid) to authenticated;
