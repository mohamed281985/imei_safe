ALTER TABLE public.phones
  ADD COLUMN IF NOT EXISTS duration_days integer;
ALTER TABLE public.phones
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.accessories
  ADD COLUMN IF NOT EXISTS duration_days integer;
ALTER TABLE public.accessories
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DO $$
DECLARE
  fallback_duration integer;
BEGIN
  SELECT min(duration_days)::integer
  INTO fallback_duration
  FROM public.ads_price
  WHERE type = 'sell_phone'
    AND duration_days > 0;

  fallback_duration := COALESCE(fallback_duration, 1);

  UPDATE public.phones
  SET duration_days = COALESCE(NULLIF(duration_days, 0), fallback_duration),
      expires_at = COALESCE(
        expires_at,
        COALESCE(created_at, now()) + make_interval(days => COALESCE(NULLIF(duration_days, 0), fallback_duration))
      )
  WHERE duration_days IS NULL OR duration_days <= 0 OR expires_at IS NULL;

  UPDATE public.accessories
  SET duration_days = COALESCE(NULLIF(duration_days, 0), fallback_duration),
      expires_at = COALESCE(
        expires_at,
        COALESCE(created_at, now()) + make_interval(days => COALESCE(NULLIF(duration_days, 0), fallback_duration))
      )
  WHERE duration_days IS NULL OR duration_days <= 0 OR expires_at IS NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS phones_active_expiry_idx
  ON public.phones (expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS accessories_active_expiry_idx
  ON public.accessories (expires_at)
  WHERE status = 'active';
