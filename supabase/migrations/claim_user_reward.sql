-- RPC to atomically claim a user reward and apply its prize to users_plans
-- Usage: SELECT claim_user_reward(p_reward_id := 'uuid', p_user_id := 'uuid');

CREATE OR REPLACE FUNCTION public.claim_user_reward(p_reward_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  rew record;
  prize_int int := 0;
  applied text := NULL;
  new_balance int := 0;
BEGIN
  -- Atomically mark reward as claimed and return its row
  UPDATE public.user_rewards
  SET claimed = TRUE, claimed_at = now()
  WHERE id = p_reward_id AND user_id = p_user_id AND claimed = FALSE
  RETURNING id, reward_name, prizes INTO rew;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_already_claimed');
  END IF;

  prize_int := COALESCE(NULLIF(trim(rew.prizes), ''), '0')::int;

  IF rew.reward_name ILIKE '%bonus%' OR rew.reward_name ILIKE '%بونص%' THEN
    applied := 'bonus';
    INSERT INTO public.users_plans (user_id, bonus)
    VALUES (p_user_id, prize_int)
    ON CONFLICT (user_id) DO UPDATE SET bonus = COALESCE(public.users_plans.bonus, 0) + EXCLUDED.bonus;
    SELECT COALESCE(bonus, 0) INTO new_balance FROM public.users_plans WHERE user_id = p_user_id;

  ELSIF rew.reward_name ILIKE '%points%' OR rew.reward_name ILIKE '%نقاط%' THEN
    applied := 'points';
    INSERT INTO public.users_plans (user_id, points)
    VALUES (p_user_id, prize_int)
    ON CONFLICT (user_id) DO UPDATE SET points = COALESCE(public.users_plans.points, 0) + EXCLUDED.points;
    SELECT COALESCE(points, 0) INTO new_balance FROM public.users_plans WHERE user_id = p_user_id;

  ELSIF rew.reward_name ILIKE '%money%' OR rew.reward_name ILIKE '%مال%' THEN
    applied := 'money';
    INSERT INTO public.users_plans (user_id, money)
    VALUES (p_user_id, prize_int)
    ON CONFLICT (user_id) DO UPDATE SET money = COALESCE(public.users_plans.money, 0) + EXCLUDED.money;
    SELECT COALESCE(money, 0) INTO new_balance FROM public.users_plans WHERE user_id = p_user_id;

  ELSE
    applied := 'other';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reward_id', rew.id,
    'reward_name', rew.reward_name,
    'applied', applied,
    'prize', prize_int,
    'new_balance', new_balance
  );
END;
$$;
