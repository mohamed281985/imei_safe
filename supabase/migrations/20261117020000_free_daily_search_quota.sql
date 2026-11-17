ALTER TABLE public.users_plans
  ADD COLUMN IF NOT EXISTS search_imei_usage_date date;

CREATE OR REPLACE FUNCTION public.refresh_free_search_imei_quota(
  p_user_id uuid,
  p_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  today_utc date := (now() AT TIME ZONE 'UTC')::date;
  affected_rows integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF lower(btrim(COALESCE(p_role, ''))) NOT IN ('free_user', 'free_business', 'user', 'customer') THEN
    RETURN false;
  END IF;

  UPDATE public.users_plans
  SET
    used_search_imei = 0,
    search_imei_usage_date = today_utc
  WHERE user_id = p_user_id
    AND search_imei_usage_date IS DISTINCT FROM today_utc;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_free_search_imei_quota(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_free_search_imei_quota(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
