-- RPCs to atomically increment user's bonus, points, and money in users_plans
-- Usage: SELECT increment_bonus(p_user_id := 'uuid', p_amount := 10);

CREATE OR REPLACE FUNCTION public.increment_bonus(p_user_id uuid, p_amount int)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users_plans (user_id, bonus)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET bonus = COALESCE(public.users_plans.bonus, 0) + p_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_points(p_user_id uuid, p_amount int)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users_plans (user_id, points)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET points = COALESCE(public.users_plans.points, 0) + p_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_money(p_user_id uuid, p_amount int)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users_plans (user_id, money)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET money = COALESCE(public.users_plans.money, 0) + p_amount;
END;
$$;
