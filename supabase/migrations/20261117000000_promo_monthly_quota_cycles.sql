ALTER TABLE public.users_plans
  ADD COLUMN IF NOT EXISTS promo_quota_cycle_start timestamptz;

CREATE OR REPLACE FUNCTION public.refresh_promo_quota_cycle(
  p_user_id uuid,
  p_role text,
  p_email text,
  p_cycle_start timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_rows integer;
BEGIN
  IF p_user_id IS NULL OR p_cycle_start IS NULL THEN
    RAISE EXCEPTION 'User and promo quota cycle start are required';
  END IF;

  INSERT INTO public.users_plans (
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
    promo_quota_cycle_start
  )
  VALUES (
    p_user_id,
    p_user_id,
    COALESCE(p_email, ''),
    COALESCE(p_role, 'free_user'),
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
    p_cycle_start
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.users_plans.email),
    role = EXCLUDED.role,
    used_search_imei = 0,
    used_register_phone = 0,
    used_search_history = 0,
    used_print_history = 0,
    used_game = 0,
    used_notify_in_app = 0,
    used_notify_email = 0,
    used_notify_push = 0,
    silver_ad = 0,
    gold_ad = 0,
    promo_quota_cycle_start = EXCLUDED.promo_quota_cycle_start
  WHERE public.users_plans.promo_quota_cycle_start IS DISTINCT FROM EXCLUDED.promo_quota_cycle_start;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_promo_quota_cycle(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_promo_quota_cycle(uuid, text, text, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
