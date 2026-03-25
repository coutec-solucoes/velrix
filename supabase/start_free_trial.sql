CREATE OR REPLACE FUNCTION start_free_trial(p_user_id UUID, p_days INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- 1. Grab the company_id from the profile
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 2. Update saas_companies with 'ativo' status and expiration
  UPDATE public.saas_companies
  SET 
    status = 'ativo',
    plan_expiry = (CURRENT_DATE + (p_days || ' days')::INTERVAL)::DATE
  WHERE id = v_company_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;
