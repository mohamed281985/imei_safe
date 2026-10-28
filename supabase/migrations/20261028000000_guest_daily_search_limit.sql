CREATE TABLE IF NOT EXISTS public.guest_search_usage (
  guest_id text PRIMARY KEY,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  search_count integer NOT NULL DEFAULT 0 CHECK (search_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_search_usage ENABLE ROW LEVEL SECURITY;

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
  VALUES (p_guest_id, today_utc, 0)
  ON CONFLICT (guest_id) DO NOTHING;

  UPDATE public.guest_search_usage
  SET usage_date = today_utc,
      search_count = CASE WHEN usage_date = today_utc THEN search_count ELSE 0 END,
      updated_at = now()
  WHERE guest_id = p_guest_id;

  UPDATE public.guest_search_usage
  SET search_count = search_count + 1,
      updated_at = now()
  WHERE guest_id = p_guest_id
    AND search_count < p_daily_limit
  RETURNING search_count INTO current_count;

  IF current_count IS NULL THEN
    SELECT search_count INTO current_count
    FROM public.guest_search_usage
    WHERE guest_id = p_guest_id;
    RETURN jsonb_build_object('allowed', false, 'used', current_count, 'remaining', 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', current_count,
    'remaining', greatest(p_daily_limit - current_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_guest_search_remaining(p_guest_id text, p_daily_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count integer := 0;
  today_utc date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_guest_id IS NULL OR length(p_guest_id) <> 64 OR p_daily_limit < 1 THEN
    RAISE EXCEPTION 'Invalid guest search parameters';
  END IF;

  SELECT search_count INTO current_count
  FROM public.guest_search_usage
  WHERE guest_id = p_guest_id AND usage_date = today_utc;

  RETURN jsonb_build_object(
    'remaining', greatest(p_daily_limit - COALESCE(current_count, 0), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_search(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_guest_search_remaining(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_search(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_search_remaining(text, integer) TO service_role;
