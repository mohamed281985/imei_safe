CREATE OR REPLACE FUNCTION public.consume_guest_search(p_guest_id text, p_daily_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count integer;
  today_utc date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_guest_id IS NULL OR length(p_guest_id) <> 64 OR p_daily_limit < 1 THEN
    RAISE EXCEPTION 'Invalid guest search parameters';
  END IF;

  INSERT INTO public.guest_search_usage (guest_id, usage_date, search_count)
  VALUES (p_guest_id, today_utc, 1)
  ON CONFLICT (guest_id) DO UPDATE
  SET usage_date = today_utc,
      search_count = CASE
        WHEN public.guest_search_usage.usage_date = today_utc
          THEN public.guest_search_usage.search_count + 1
        ELSE 1
      END,
      updated_at = now()
  WHERE CASE
    WHEN public.guest_search_usage.usage_date = today_utc
      THEN public.guest_search_usage.search_count
    ELSE 0
  END < p_daily_limit
  RETURNING search_count INTO current_count;

  IF current_count IS NULL THEN
    SELECT search_count INTO current_count
    FROM public.guest_search_usage
    WHERE guest_id = p_guest_id;

    RETURN jsonb_build_object(
      'allowed', false,
      'used', current_count,
      'remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', current_count,
    'remaining', greatest(p_daily_limit - current_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_search(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_search(text, integer) TO service_role;