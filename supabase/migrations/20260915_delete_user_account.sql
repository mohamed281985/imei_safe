-- Delete all application data owned by a user.
-- The server calls this function with the service role after validating the user's JWT.
CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target record;
  cleanup_pass integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  -- Remove dependent rows first. Repeating the pass allows tables with nested
  -- foreign keys to be cleaned without relying on a particular table order.
  FOR cleanup_pass IN 1..3 LOOP
    FOR target IN
      SELECT DISTINCT c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = ANY (ARRAY[
          'user_id', 'owner_id', 'seller_id', 'buyer_id', 'seller_user_id',
          'buyer_user_id', 'finder_user_id', 'reviewer_id', 'created_by',
          'recipient_id', 'sender_id', 'admin_id'
        ])
        AND c.table_name NOT IN ('users', 'profiles')
    LOOP
      BEGIN
        EXECUTE format(
          'DELETE FROM public.%I WHERE %I = $1',
          target.table_name,
          target.column_name
        ) USING p_user_id;
      EXCEPTION
        WHEN foreign_key_violation THEN
          -- A later pass can remove the dependent row first.
          NULL;
      END;
    END LOOP;
  END LOOP;

  -- These rows represent the account itself and must be removed explicitly.
  DELETE FROM public.users_plans WHERE id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM public.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO service_role;
