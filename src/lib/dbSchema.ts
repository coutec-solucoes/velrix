/**
 * Complete SQL schema for all VELTOR tables with RLS policies.
 * Each table definition is stored separately for individual verification.
 */

export interface TableSchema {
  name: string;
  description: string;
  sql: string;
}

// SQL to create the exec_sql function (must be run first in Supabase SQL Editor)
export const EXEC_SQL_BOOTSTRAP = `-- Execute este SQL no SQL Editor do Supabase PRIMEIRO
-- Isso permite que o painel Admin crie tabelas automaticamente
-- SOMENTE admins podem executar (verificação de segurança interna)

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Security: only allow admin users to execute arbitrary SQL
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores podem executar SQL.';
  END IF;
  
  IF sql_query ILIKE 'SELECT%' THEN
    EXECUTE 'SELECT json_agg(t) FROM (' || sql_query || ') t' INTO v_result;
  ELSE
    EXECUTE sql_query;
    v_result := '{"success": true}'::json;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Dar permissão para usuários autenticados (guard interno verifica admin)
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO authenticated;
`;

export const allTables: TableSchema[] = [
  // ========== 0. EXEC_SQL FUNCTION (bootstrap) ==========
  {
    name: '_exec_sql',
    description: 'Função exec_sql para criar tabelas pelo painel (EXECUTAR PRIMEIRO)',
    sql: EXEC_SQL_BOOTSTRAP,
  },
  // ========== 1. PROFILES TABLE (must exist before RLS functions) ==========
  {
    name: 'profiles_table',
    description: 'Tabela profiles (criar ANTES das funções RLS)',
    sql: `CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'visualizador' CHECK (role IN ('proprietario', 'administrador', 'financeiro', 'visualizador', 'cobrador')),
  country TEXT DEFAULT 'BR' CHECK (country IN ('BR', 'PY')),
  account_type TEXT DEFAULT 'pessoal' CHECK (account_type IN ('pessoal', 'empresa')),
  company_name TEXT,
  document TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  company_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
  },

  // ========== 2. SECURITY DEFINER FUNCTIONS (profiles must exist) ==========
  {
    name: '_rls_functions',
    description: 'Funções auxiliares para RLS (requerem tabela profiles)',
    sql: `DROP FUNCTION IF EXISTS public.get_own_profile();
DROP FUNCTION IF EXISTS public.get_company_status();
DROP FUNCTION IF EXISTS public.ensure_profile_exists();

-- Função para obter o company_id do usuário logado (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Função para verificar se o usuário é admin SaaS
CREATE OR REPLACE FUNCTION public.is_saas_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid()
  )
$$;

-- Função para verificar role do usuário
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_company_status()
RETURNS TABLE (status TEXT, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sc.status, sc.name
  FROM public.profiles p
  JOIN public.saas_companies sc ON sc.id = p.company_id
  WHERE p.id = auth.uid()
$$;

-- Função para buscar perfil do próprio usuário (bypassa RLS)
CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS TABLE(
  id UUID, name TEXT, email TEXT, avatar_url TEXT, role TEXT,
  country TEXT, account_type TEXT, company_name TEXT, document TEXT,
  phone TEXT, company_id UUID, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, plan_id TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.avatar_url, p.role,
         p.country, p.account_type, p.company_name, p.document,
         p.phone, p.company_id, p.created_at, p.updated_at, p.plan_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

-- Função de Reparo/Garantia de Perfil (SECURITY DEFINER)
-- Chamada pelo hook useAuth quando o perfil some ou está incompleto
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
$$;`,
  },

  // ========== 3. PROFILES RLS + TRIGGER (functions now exist) ==========
  {
    name: 'profiles',
    description: 'RLS e trigger da tabela profiles',
    sql: `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Usuários da mesma empresa podem ver perfis (sem dados sensíveis via view)
CREATE POLICY "Same company users can view profiles"
  ON profiles FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- Usuário atualiza apenas seu próprio perfil
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger para auto-criar perfil no signup
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
    NULLIF(NEW.raw_user_meta_data->>'plan_id', '')-- Use text to allow special fallback IDs if needed
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
      id,
      name,
      document,
      country,
      contact_name,
      contact_email,
      contact_phone,
      status,
      plan_id
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
      id,
      name,
      country,
      language,
      multi_currency,
      currency_priority,
      active_currencies,
      exchange_rates,
      plan_id,
      document,
      phone,
      email
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`,
  },

  // ========== APP TABLES (per-company data) ==========
  {
    name: 'companies',
    description: 'Empresas do sistema (dados da empresa do tenant)',
    sql: `CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo TEXT,
  country TEXT NOT NULL DEFAULT 'BR' CHECK (country IN ('BR', 'PY')),
  language TEXT NOT NULL DEFAULT 'pt-BR' CHECK (language IN ('pt-BR', 'es-PY')),
  multi_currency BOOLEAN NOT NULL DEFAULT false,
  currency_priority JSONB DEFAULT '["BRL"]'::jsonb,
  active_currencies JSONB DEFAULT '["BRL"]'::jsonb,
  exchange_rates JSONB DEFAULT '[]'::jsonb,
  document TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas a empresa à qual pertence
CREATE POLICY "Users can view own company"
  ON companies FOR SELECT TO authenticated
  USING (id = public.get_user_company_id());

-- Proprietário pode atualizar sua empresa
CREATE POLICY "Owner can update company"
  ON companies FOR UPDATE TO authenticated
  USING (id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'))
  WITH CHECK (id = public.get_user_company_id());

-- Usuário pode inserir apenas a própria empresa
CREATE POLICY "Authenticated can insert own company"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (id = public.get_user_company_id());`,
  },
  {
    name: 'users',
    description: 'Usuários do sistema (por empresa)',
    sql: `CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  username TEXT,
  email TEXT,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'visualizador' CHECK (role IN ('proprietario', 'administrador', 'financeiro', 'visualizador', 'cobrador')),
  permissions JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, company_id),
  UNIQUE(username, company_id)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Usuários da mesma empresa podem ver outros usuários
CREATE POLICY "Same company can view users"
  ON users FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- Proprietário/admin pode gerenciar usuários
CREATE POLICY "Admin can insert users"
  ON users FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'));

CREATE POLICY "Admin can update users"
  ON users FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Admin can delete users"
  ON users FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'));`,
  },
  {
    name: 'cobradores',
    description: 'Cobradores cadastrados por empresa',
    sql: `CREATE TABLE IF NOT EXISTS cobradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  region TEXT DEFAULT '',
  sector TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cobradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view cobradores"
  ON cobradores FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert cobradores for own company"
  ON cobradores FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update cobradores for own company"
  ON cobradores FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete cobradores for own company"
  ON cobradores FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  {
    name: 'clients',
    description: 'Clientes cadastrados por empresa',
    sql: `CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PF' CHECK (type IN ('PF', 'PJ')),
  person_role TEXT NOT NULL DEFAULT 'cliente' CHECK (person_role IN ('cliente', 'fornecedor', 'ambos')),
  country TEXT NOT NULL DEFAULT 'BR' CHECK (country IN ('BR', 'PY')),
  document TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone2 TEXT DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_number TEXT DEFAULT '',
  address_complement TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  zip_code TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  trade_name TEXT DEFAULT '',
  state_registration TEXT DEFAULT '',
  municipal_registration TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view clients"
  ON clients FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert clients for own company"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update clients for own company"
  ON clients FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete clients for own company"
  ON clients FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  {
    name: 'categories',
    description: 'Categorias de movimentação',
    sql: `CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('investimento', 'despesa', 'receita', 'retirada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view categories"
  ON categories FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert categories for own company"
  ON categories FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update categories for own company"
  ON categories FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete categories for own company"
  ON categories FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  {
    name: 'transactions',
    description: 'Movimentações financeiras',
    sql: `CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('investimento', 'despesa', 'receita', 'retirada')),
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  category TEXT NOT NULL DEFAULT '',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado')),
  installments INTEGER,
  current_installment INTEGER,
  installment_group_id UUID,
  recurrence TEXT CHECK (recurrence IN ('mensal', 'semanal', 'anual')),
  paid_at TIMESTAMPTZ,
  payment_method TEXT DEFAULT '',
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view transactions"
  ON transactions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert transactions for own company"
  ON transactions FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update transactions for own company"
  ON transactions FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete transactions for own company"
  ON transactions FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  {
    name: 'contracts',
    description: 'Contratos com clientes',
    sql: `CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  description TEXT DEFAULT '',
  terms TEXT DEFAULT '',
  interest_rate NUMERIC(5,2) DEFAULT 0,
  late_fee_percent NUMERIC(5,2) DEFAULT 0,
  transaction_ids JSONB DEFAULT '[]'::jsonb,
  installment_group_id UUID,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_assinatura', 'assinado', 'cancelado')),
  signature_data TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view contracts"
  ON contracts FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert contracts for own company"
  ON contracts FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update contracts for own company"
  ON contracts FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete contracts for own company"
  ON contracts FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  {
    name: 'currencies',
    description: 'Moedas ativas por empresa',
    sql: `CREATE TABLE IF NOT EXISTS currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code IN ('BRL', 'PYG', 'USD')),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view currencies"
  ON currencies FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can manage currencies for own company"
  ON currencies FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());`,
  },
  {
    name: 'current_exchange_rates',
    description: 'Cotações atuais por empresa (uma linha por par de moedas)',
    sql: `CREATE TABLE IF NOT EXISTS current_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  pair TEXT NOT NULL,
  rate NUMERIC(20,10) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, pair)
);

ALTER TABLE current_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view current rates"
  ON current_exchange_rates FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can manage current rates for own company"
  ON current_exchange_rates FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());`,
  },
  {
    name: 'exchange_rate_history',
    description: 'Histórico de cotações diárias',
    sql: `CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  rates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, date)
);

ALTER TABLE exchange_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view exchange rates"
  ON exchange_rate_history FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert exchange rates for own company"
  ON exchange_rate_history FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can update exchange rates for own company"
  ON exchange_rate_history FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());`,
  },
  {
    name: 'app_settings',
    description: 'Configurações da aplicação por empresa',
    sql: `CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  late_fee_enabled BOOLEAN NOT NULL DEFAULT false,
  late_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  interest_per_day NUMERIC(5,4) NOT NULL DEFAULT 0,
  cobradores_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view settings"
  ON app_settings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Admin can manage settings"
  ON app_settings FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'));
CREATE POLICY "Admin can update settings"
  ON app_settings FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'))
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'));

-- Trigger para criar app_settings automaticamente quando uma empresa é criada
CREATE OR REPLACE FUNCTION public.handle_new_company_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_settings (company_id, late_fee_enabled, late_fee_percent, interest_per_day, cobradores_enabled)
  VALUES (NEW.id, false, 2.0, 0.033, true)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_created ON companies;
CREATE TRIGGER on_company_created
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_company_settings();`,
  },

  // ========== ADMIN / SAAS TABLES ==========
  {
    name: 'saas_companies',
    description: 'Empresas SaaS (gestão admin)',
    sql: `CREATE TABLE IF NOT EXISTS saas_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  document TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'BR' CHECK (country IN ('BR', 'PY')),
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('ativo', 'suspenso', 'pendente', 'inativo')),
  plan_expiry DATE,
  plan_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE saas_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all companies"
  ON saas_companies FOR SELECT TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can insert companies"
  ON saas_companies FOR INSERT TO authenticated
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can update companies"
  ON saas_companies FOR UPDATE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can delete companies"
  ON saas_companies FOR DELETE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));

-- Allow trigger to insert during signup (service role bypasses RLS, but anon inserts need this)
CREATE POLICY "Allow insert for new company signup"
  ON saas_companies FOR INSERT TO authenticated
  WITH CHECK (true);`,
  },
  {
    name: 'saas_payments',
    description: 'Pagamentos de assinaturas SaaS',
    sql: `CREATE TABLE IF NOT EXISTS saas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES saas_companies(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago', 'pendente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE saas_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all payments"
  ON saas_payments FOR SELECT TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can insert payments"
  ON saas_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can update payments"
  ON saas_payments FOR UPDATE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));`,
  },
  {
    name: 'saas_plans',
    description: 'Planos de assinatura disponíveis',
    sql: `CREATE TABLE IF NOT EXISTS saas_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(15,2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(15,2),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  features TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plans"
  ON saas_plans FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admin can manage plans"
  ON saas_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can update plans"
  ON saas_plans FOR UPDATE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can delete plans"
  ON saas_plans FOR DELETE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));`,
  },
  {
    name: 'admin_users',
    description: 'Usuários administradores do painel SaaS',
    sql: `CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES saas_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'visualizador' CHECK (role IN ('proprietario', 'administrador', 'financeiro', 'visualizador')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view admin users"
  ON admin_users FOR SELECT TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can manage admin users"
  ON admin_users FOR INSERT TO authenticated
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can update admin users"
  ON admin_users FOR UPDATE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can delete admin users"
  ON admin_users FOR DELETE TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));`,
  },
  {
    name: 'admin_activity_logs',
    description: 'Logs de atividades do painel admin',
    sql: `CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view logs"
  ON admin_activity_logs FOR SELECT TO authenticated
  USING (public.is_saas_admin() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin can insert logs"
  ON admin_activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_saas_admin() OR public.is_admin(auth.uid()));`,
  },
  {
    name: 'admin_settings',
    description: 'Configurações globais do admin',
    sql: `CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view settings"
  ON admin_settings FOR SELECT TO authenticated
  USING (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admin can manage settings"
  ON admin_settings FOR ALL TO authenticated
  USING (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  );`,
  },

  // ========== SECURE VIEWS (hide password from SELECT) ==========
  {
    name: '_secure_views',
    description: 'Views seguras que ocultam o campo password das queries SELECT',
    sql: `-- View segura para tabela users (sem password)
CREATE OR REPLACE VIEW public.users_secure AS
SELECT
  id,
  company_id,
  company_name,
  name,
  email,
  role,
  permissions,
  active,
  created_at
FROM public.users;

-- RLS da view herda da tabela base, mas garantimos acesso via GRANT
GRANT SELECT ON public.users_secure TO authenticated;

-- View segura para tabela admin_users (sem password)
CREATE OR REPLACE VIEW public.admin_users_secure AS
SELECT
  id,
  company_id,
  name,
  email,
  role,
  active,
  created_at
FROM public.admin_users;

GRANT SELECT ON public.admin_users_secure TO authenticated;

-- Revogar SELECT direto na coluna password (defesa em profundidade)
-- Grant access (RLS policies handle row-level filtering — no need to revoke columns)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;

REVOKE ALL ON public.admin_users FROM authenticated;
GRANT SELECT (id, company_id, name, email, role, active, created_at) ON public.admin_users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;`,
  },

  // ========== ADMIN ROLES TABLE (Supabase Auth admin access) ==========
  {
    name: 'admin_roles',
    description: 'Roles de administrador do painel (Supabase Auth)',
    sql: `CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can see admin_roles
CREATE POLICY "Admins can view admin_roles"
  ON admin_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Security definer function to check admin status (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id
  )
$$;`
  },
  // ========== BANK ACCOUNTS ==========
  {
    name: 'bank_accounts',
    description: 'Contas bancárias por empresa',
    sql: `CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL DEFAULT '',
  account_type TEXT NOT NULL DEFAULT 'corrente' CHECK (account_type IN ('corrente', 'poupanca', 'caixa')),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view bank_accounts"
  ON bank_accounts FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert bank_accounts for own company"
  ON bank_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update bank_accounts for own company"
  ON bank_accounts FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete bank_accounts for own company"
  ON bank_accounts FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  // ========== CASH MOVEMENTS ==========
  {
    name: 'cash_movements',
    description: 'Movimentações de caixa',
    sql: `CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'transferencia')),
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  description TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL,
  payment_method TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view cash_movements"
  ON cash_movements FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert cash_movements for own company"
  ON cash_movements FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));

CREATE POLICY "Can update cash_movements for own company"
  ON cash_movements FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'))
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete cash_movements for own company"
  ON cash_movements FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro'));`,
  },
  // ========== AUDIT LOGS ==========
  {
    name: 'audit_logs',
    description: 'Log de auditoria de baixas e pagamentos',
    sql: `CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('baixa_recebimento', 'baixa_pagamento', 'estorno', 'despesa', 'transferencia', 'fechamento_caixa')),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  transaction_description TEXT NOT NULL DEFAULT '',
  client_id UUID,
  client_name TEXT DEFAULT '',
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'PYG', 'USD')),
  bank_account_id UUID,
  bank_account_name TEXT DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same company can view audit_logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Can insert audit_logs for own company"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Can delete audit_logs for own company"
  ON audit_logs FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador'));`,
  },
  // ========== MIGRATIONS (add missing columns to existing tables) ==========
  {
    name: '_migrations_v2',
    description: 'Adicionar colunas faltantes em clients e contracts',
    sql: `-- Add missing columns to clients (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='phone2') THEN
    ALTER TABLE clients ADD COLUMN phone2 TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='address_number') THEN
    ALTER TABLE clients ADD COLUMN address_number TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='address_complement') THEN
    ALTER TABLE clients ADD COLUMN address_complement TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='neighborhood') THEN
    ALTER TABLE clients ADD COLUMN neighborhood TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='city') THEN
    ALTER TABLE clients ADD COLUMN city TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='state') THEN
    ALTER TABLE clients ADD COLUMN state TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='zip_code') THEN
    ALTER TABLE clients ADD COLUMN zip_code TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='notes') THEN
    ALTER TABLE clients ADD COLUMN notes TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='trade_name') THEN
    ALTER TABLE clients ADD COLUMN trade_name TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='state_registration') THEN
    ALTER TABLE clients ADD COLUMN state_registration TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='municipal_registration') THEN
    ALTER TABLE clients ADD COLUMN municipal_registration TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='contact_person') THEN
    ALTER TABLE clients ADD COLUMN contact_person TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='contact_phone') THEN
    ALTER TABLE clients ADD COLUMN contact_phone TEXT DEFAULT '';
  END IF;
END;
$$;

-- Add missing columns to contracts (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='description') THEN
    ALTER TABLE contracts ADD COLUMN description TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='terms') THEN
    ALTER TABLE contracts ADD COLUMN terms TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='interest_rate') THEN
    ALTER TABLE contracts ADD COLUMN interest_rate NUMERIC(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='late_fee_percent') THEN
    ALTER TABLE contracts ADD COLUMN late_fee_percent NUMERIC(5,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='transaction_ids') THEN
    ALTER TABLE contracts ADD COLUMN transaction_ids JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='installment_group_id') THEN
    ALTER TABLE contracts ADD COLUMN installment_group_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='status') THEN
    ALTER TABLE contracts ADD COLUMN status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aguardando_assinatura', 'assinado', 'cancelado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='signature_data') THEN
    ALTER TABLE contracts ADD COLUMN signature_data TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='signed_at') THEN
    ALTER TABLE contracts ADD COLUMN signed_at TIMESTAMPTZ;
  END IF;
END;
$$;

-- Add permissions column to users (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN
    ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}'::jsonb;
  END IF;
END;
$$;

-- Add cobradores_enabled to app_settings (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_settings' AND column_name='cobradores_enabled') THEN
    ALTER TABLE app_settings ADD COLUMN cobradores_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END;
$$;

-- Add cobrador_id to various tables (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='cobrador_id') THEN
    ALTER TABLE clients ADD COLUMN cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='cobrador_id') THEN
    ALTER TABLE transactions ADD COLUMN cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_movements' AND column_name='cobrador_id') THEN
    ALTER TABLE cash_movements ADD COLUMN cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='cobrador_id') THEN
    ALTER TABLE audit_logs ADD COLUMN cobrador_id UUID REFERENCES cobradores(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Update role constraints to allow 'cobrador' (idempotent)
DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('proprietario', 'administrador', 'financeiro', 'visualizador', 'cobrador'));
  
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('proprietario', 'administrador', 'financeiro', 'visualizador', 'cobrador'));
END;
$$;`,
  },
  // ========== MIGRATIONS v3 ==========
  {
    name: '_migrations_v3',
    description: 'Adicionar payment_method em cash_movements',
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_movements' AND column_name='payment_method') THEN
    ALTER TABLE cash_movements ADD COLUMN payment_method TEXT DEFAULT '';
  END IF;
END;
$$;`,
  },
  // ========== MIGRATIONS v4 ==========
  {
    name: '_migrations_v4',
    description: 'Adicionar contract_title e contract_clauses em companies',
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='contract_title') THEN
    ALTER TABLE companies ADD COLUMN contract_title TEXT DEFAULT 'CONFISSÃO DE DÍVIDA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='contract_clauses') THEN
    ALTER TABLE companies ADD COLUMN contract_clauses JSONB DEFAULT '[]'::jsonb;
  END IF;
END;
$$;`,
  },
  // ========== REALTIME ==========
  {
    name: '_realtime',
    description: 'Habilitar Realtime nas tabelas principais',
    sql: `-- Enable realtime for app tables (idempotent)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cobradores','clients','transactions','contracts','categories','users','companies','bank_accounts','cash_movements','audit_logs']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already added
    END;
  END LOOP;
END;
$$;`,
  },
  {
    name: 'grant_cobrador_permissions',
    description: 'Permitir que cobradores baixem parcelas',
    sql: `
-- Atualizar transações
DROP POLICY IF EXISTS "Can update transactions for own company" ON transactions;
CREATE POLICY "Can update transactions for own company"
  ON transactions FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'))
  WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Can insert transactions for own company" ON transactions;
CREATE POLICY "Can insert transactions for own company"
  ON transactions FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'));

-- Atualizar contas bancárias
DROP POLICY IF EXISTS "Can update bank_accounts for own company" ON bank_accounts;
CREATE POLICY "Can update bank_accounts for own company"
  ON bank_accounts FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'))
  WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Can insert bank_accounts for own company" ON bank_accounts;
CREATE POLICY "Can insert bank_accounts for own company"
  ON bank_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'));

-- Atualizar e Inserir movimentações de caixa
DROP POLICY IF EXISTS "Can update cash_movements for own company" ON cash_movements;
CREATE POLICY "Can update cash_movements for own company"
  ON cash_movements FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'))
  WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Can insert cash_movements for own company" ON cash_movements;
CREATE POLICY "Can insert cash_movements for own company"
  ON cash_movements FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'));

-- Atualizar e Inserir logs de auditoria
DROP POLICY IF EXISTS "Can update audit_logs for own company" ON audit_logs;
CREATE POLICY "Can update audit_logs for own company"
  ON audit_logs FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'))
  WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Can insert audit_logs for own company" ON audit_logs;
CREATE POLICY "Can insert audit_logs for own company"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND public.get_user_role() IN ('proprietario', 'administrador', 'financeiro', 'cobrador'));
    `,
  },
];

/**
 * Makes SQL idempotent by adding DROP POLICY IF EXISTS before each CREATE POLICY.
 */
export function makeIdempotent(sql: string): string {
  return sql.replace(
    /CREATE POLICY "([^"]+)"\s+ON (\S+)/g,
    'DROP POLICY IF EXISTS "$1" ON $2;\nCREATE POLICY "$1"\n  ON $2'
  );
}

/**
 * Returns the full SQL to create all tables in order (idempotent).
 */
export function getFullSchemaSQL(): string {
  return allTables.map(t => `-- ${t.description}\n${makeIdempotent(t.sql)}`).join('\n\n');
}

/**
 * Returns SQL to check which tables exist.
 */
export function getTableCheckSQL(): string {
  const tableNames = allTables
    .filter(t => !t.name.startsWith('_') && t.name !== 'profiles_table')
    .map(t => `'${t.name}'`).join(', ');
  return `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${tableNames}) ORDER BY table_name;`;
}
