-- Migration: Fix collaborator login creating ghost companies
-- Root cause: handle_new_user() trigger fires for ALL new Auth users (including collaborators)
--             creating a new saas_companies/companies record and overwriting company_id.
--             ensure_profile_exists() also creates a company when company_id is NULL.
-- Fix: Skip company creation for users with is_collaborator=true in user_metadata.

-- 1. Fix the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
  account_type_value TEXT;
BEGIN
  -- Colaboradores já têm perfil e empresa gerenciados pela Edge Function authenticate-collaborator.
  -- Criar uma empresa nova aqui causaria conflito: o trigger sobrescreveria o company_id correto.
  IF (NEW.raw_user_meta_data->>'is_collaborator')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  account_type_value := COALESCE(NEW.raw_user_meta_data->>'account_type', 'pessoal');

  INSERT INTO public.profiles (id, name, email, country, account_type, company_name, document, phone, plan_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'country', 'BR'),
    account_type_value,
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'company_name', ''), ''),
    COALESCE(NEW.raw_user_meta_data->>'document', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'plan_id', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    country = EXCLUDED.country,
    account_type = EXCLUDED.account_type,
    company_name = EXCLUDED.company_name,
    document = EXCLUDED.document,
    phone = EXCLUDED.phone,
    plan_id = EXCLUDED.plan_id;

  new_company_id := gen_random_uuid();

  IF to_regclass('public.saas_companies') IS NOT NULL THEN
    INSERT INTO public.saas_companies (
      id, name, document, country, contact_name, contact_email, contact_phone, status, plan_id
    )
    VALUES (
      new_company_id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), NEW.raw_user_meta_data->>'name', 'Empresa sem nome'),
      COALESCE(NEW.raw_user_meta_data->>'document', ''),
      COALESCE(NEW.raw_user_meta_data->>'country', 'BR'),
      COALESCE(NEW.raw_user_meta_data->>'name', ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      'pendente',
      NULLIF(NEW.raw_user_meta_data->>'plan_id', '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('public.companies') IS NOT NULL THEN
    INSERT INTO public.companies (
      id, name, country, language, multi_currency, currency_priority,
      active_currencies, exchange_rates, plan_id, document, phone, email
    )
    VALUES (
      new_company_id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), NEW.raw_user_meta_data->>'name', 'Empresa sem nome'),
      COALESCE(NEW.raw_user_meta_data->>'country', 'BR'),
      CASE WHEN COALESCE(NEW.raw_user_meta_data->>'country', 'BR') = 'PY' THEN 'es-PY' ELSE 'pt-BR' END,
      true,
      '["BRL","PYG","USD"]'::jsonb,
      '["BRL","PYG","USD"]'::jsonb,
      '["BRL","PYG","USD"]'::jsonb,
      '[]'::jsonb,
      NULLIF(NEW.raw_user_meta_data->>'plan_id', ''),
      COALESCE(NEW.raw_user_meta_data->>'document', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles
    SET company_id = new_company_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Fix ensure_profile_exists to also skip company creation for collaborators
CREATE OR REPLACE FUNCTION public.ensure_profile_exists()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_id UUID;
  u_email TEXT;
  u_name TEXT;
  p_exists BOOLEAN;
  new_company_id UUID;
  p_role TEXT;
BEGIN
  u_id := auth.uid();
  IF u_id IS NULL THEN
    RETURN '{"success": false, "message": "Não autenticado"}'::json;
  END IF;

  u_email := auth.jwt()->>'email';
  u_name := COALESCE(auth.jwt()->'user_metadata'->>'name', '');

  -- Colaboradores têm empresa gerenciada pela Edge Function authenticate-collaborator.
  -- Não criar empresa aqui para evitar sobreposição do company_id correto.
  IF (auth.jwt()->'user_metadata'->>'is_collaborator')::boolean IS TRUE THEN
    SELECT company_id INTO new_company_id FROM public.profiles WHERE id = u_id;
    RETURN json_build_object('success', true, 'company_id', new_company_id);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = u_id) INTO p_exists;

  IF NOT p_exists THEN
    INSERT INTO public.profiles (id, name, email, role, country, account_type)
    VALUES (u_id, u_name, u_email, 'proprietario', 'BR', 'pessoal');
  END IF;

  -- Verifica se tem empresa vinculada
  SELECT company_id, role INTO new_company_id, p_role FROM public.profiles WHERE id = u_id;

  IF new_company_id IS NULL THEN
    -- Busca por email em saas_companies (para proprietários que perderam o vínculo)
    SELECT id INTO new_company_id FROM public.saas_companies WHERE contact_email = u_email LIMIT 1;

    IF new_company_id IS NOT NULL THEN
      UPDATE public.profiles SET company_id = new_company_id WHERE id = u_id;
    ELSE
      -- Cria nova empresa se for um usuário orfão (ou recém-criado sem trigger)
      new_company_id := gen_random_uuid();

      INSERT INTO public.saas_companies (id, name, contact_email, contact_name, status)
      VALUES (new_company_id, COALESCE(NULLIF(u_name, ''), 'Empresa de ' || u_email), u_email, u_name, 'pendente')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.companies (id, name, email)
      VALUES (new_company_id, COALESCE(NULLIF(u_name, ''), 'Empresa de ' || u_email), u_email)
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.profiles SET company_id = new_company_id WHERE id = u_id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'company_id', new_company_id);
END;
$$;
