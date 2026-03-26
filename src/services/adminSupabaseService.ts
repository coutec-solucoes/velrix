import { supabase } from '@/lib/supabase';
import { SaasCompany, SaasPayment, AdminUser, SaasPlan, AdminActivityLog, AdminSettings } from '@/types/admin';

const ADMIN_SETTINGS_CACHE_KEY = 'veltor_admin_settings_cache';
const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  brandName: 'Velrix',
  brandLogo: '',
  pixKey: '',
  pixMerchantName: '',
  pixCity: '',
  pagoparPublicKey: '',
  pagoparPrivateKey: '',
  bancardPublicKey: '',
  bancardPrivateKey: '',
  mpPublicKey: '',
  mpSecretKey: '',
};

function readSettingsCache(): AdminSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_ADMIN_SETTINGS, ...(JSON.parse(raw) as Partial<AdminSettings>) };
  } catch {
    return null;
  }
}

function writeSettingsCache(settings: AdminSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function mapAdminSettingsRows(rows: any[]): AdminSettings {
  const settings = { ...DEFAULT_ADMIN_SETTINGS };
  rows.forEach((row: any) => {
    if (row.key === 'brandName') settings.brandName = row.value;
    if (row.key === 'brandLogo') settings.brandLogo = row.value;
    if (row.key === 'supabaseUrl') settings.supabaseUrl = row.value;
    if (row.key === 'supabaseAnonKey') settings.supabaseAnonKey = row.value;
    if (row.key === 'pixKey') settings.pixKey = row.value;
    if (row.key === 'pixMerchantName') settings.pixMerchantName = row.value;
    if (row.key === 'pixCity') settings.pixCity = row.value;
    if (row.key === 'pagoparPublicKey') settings.pagoparPublicKey = row.value;
    if (row.key === 'pagoparPrivateKey') settings.pagoparPrivateKey = row.value;
    if (row.key === 'bancardPublicKey') settings.bancardPublicKey = row.value;
    if (row.key === 'bancardPrivateKey') settings.bancardPrivateKey = row.value;
    if (row.key === 'mpPublicKey') settings.mpPublicKey = row.value;
    if (row.key === 'mpSecretKey') settings.mpSecretKey = row.value;
  });
  return settings;
}

// ===== Activity Log =====
async function logActivity(action: string, details: string) {
  await supabase.from('admin_activity_logs').insert({ action, details });
}

// ===== Companies =====
export async function fetchCompanies(): Promise<SaasCompany[]> {
  const { data, error } = await supabase
    .from('saas_companies')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchCompanies error:', error); return []; }
  return (data || []).map(mapCompany);
}

export async function createCompany(company: Omit<SaasCompany, 'id' | 'createdAt'>): Promise<SaasCompany | null> {
  const { data, error } = await supabase
    .from('saas_companies')
    .insert({
      name: company.name,
      document: company.document,
      country: company.country,
      contact_name: company.contactName,
      contact_email: company.contactEmail,
      contact_phone: company.contactPhone,
      status: company.status,
      plan_expiry: company.planExpiry || null,
      plan_id: company.planId || null,
    })
    .select()
    .single();
  
  if (error) { 
    console.error('createCompany error:', error); 
    throw error;
  }
  
  await logActivity('Empresa criada', company.name);
  return mapCompany(data);
}

export async function updateCompanySupa(id: string, updates: Partial<SaasCompany>) {
  const mapped: any = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.document !== undefined) mapped.document = updates.document;
  if (updates.country !== undefined) mapped.country = updates.country;
  if (updates.contactName !== undefined) mapped.contact_name = updates.contactName;
  if (updates.contactEmail !== undefined) mapped.contact_email = updates.contactEmail;
  if (updates.contactPhone !== undefined) mapped.contact_phone = updates.contactPhone;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.planExpiry !== undefined) mapped.plan_expiry = updates.planExpiry;
  
  // Explicitly handle empty string to clear the plan_id
  if (updates.planId !== undefined) {
    mapped.plan_id = updates.planId === '' ? null : updates.planId;
  }

  const { error } = await supabase.from('saas_companies').update(mapped).eq('id', id);
  if (error) {
    console.error('updateCompany error:', error);
    throw error;
  }
  await logActivity('Empresa editada', updates.name || id);
}

export async function updateCompanyStatusSupa(id: string, status: SaasCompany['status']) {
  const { error } = await supabase.from('saas_companies').update({ status }).eq('id', id);
  if (error) console.error('updateCompanyStatus error:', error);
  else await logActivity('Status alterado', `${id} → ${status}`);
}

export async function updateCompanyExpirySupa(id: string, planExpiry: string) {
  const { error } = await supabase.from('saas_companies').update({ plan_expiry: planExpiry }).eq('id', id);
  if (error) console.error('updateCompanyExpiry error:', error);
  else await logActivity('Plano estendido', id);
}

export async function deleteCompanySupa(id: string) {
  // 1. Delete operational company (cascades to clients, users, transactions, etc.)
  const { error: opError } = await supabase.from('companies').delete().eq('id', id);
  if (opError) console.error('delete operational company error:', opError);

  // 2. Clear profiles company_id so users aren't orphaned with a dead link
  const { error: profError } = await supabase.from('profiles').update({ company_id: null }).eq('company_id', id);
  if (profError) console.error('clear profiles company error:', profError);

  // 3. Delete SaaS billing company (cascades to saas_payments)
  const { error: saasError } = await supabase.from('saas_companies').delete().eq('id', id);
  if (saasError) console.error('delete saas company error:', saasError);

  if (!opError && !saasError) await logActivity('Empresa excluída permanentemente', id);
}

// ===== Payments =====
export async function fetchPayments(companyId?: string): Promise<SaasPayment[]> {
  let query = supabase.from('saas_payments').select('*').order('date', { ascending: false });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) { console.error('fetchPayments error:', error); return []; }
  return (data || []).map(mapPayment);
}

export async function createPayment(payment: Omit<SaasPayment, 'id'>) {
  const { error } = await supabase.from('saas_payments').insert({
    company_id: payment.companyId,
    amount: payment.amount,
    currency: payment.currency,
    date: payment.date,
    description: payment.description,
    status: payment.status,
  });
  if (error) console.error('createPayment error:', error);
  else await logActivity('Pagamento registrado', payment.description);
}

// ===== Admin Users =====
export async function fetchAdminUsers(companyId?: string): Promise<AdminUser[]> {
  let query = supabase.from('admin_users_secure').select('*').order('created_at', { ascending: false });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    // Fallback to admin_users if secure view doesn't exist
    let q2 = supabase.from('admin_users').select('id, company_id, name, email, role, active, created_at').order('created_at', { ascending: false });
    if (companyId) q2 = q2.eq('company_id', companyId);
    const { data: d2, error: e2 } = await q2;
    if (e2) { console.error('fetchAdminUsers error:', e2); return []; }
    return (d2 || []).map(mapAdminUser);
  }
  return (data || []).map(mapAdminUser);
}

export async function fetchAdminUsersWithPassword(companyId: string): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('fetchAdminUsersWithPassword error:', error);
    return [];
  }
  
  return (data || []).map(row => ({
    ...mapAdminUser(row),
    password: row.password // Include the password
  }));
}

export async function createAdminUser(user: Omit<AdminUser, 'id' | 'createdAt'>) {
  const { error } = await supabase.from('admin_users').insert({
    company_id: user.companyId,
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    active: user.active,
  });
  if (error) console.error('createAdminUser error:', error);
  else await logActivity('Usuário criado', `${user.name} (${user.email})`);
}

export async function updateAdminUserSupa(id: string, updates: Partial<AdminUser>) {
  const mapped: any = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.email !== undefined) mapped.email = updates.email;
  if (updates.role !== undefined) mapped.role = updates.role;
  if (updates.companyId !== undefined) mapped.company_id = updates.companyId;
  if (updates.active !== undefined) mapped.active = updates.active;

  const { error } = await supabase.from('admin_users').update(mapped).eq('id', id);
  if (error) console.error('updateAdminUser error:', error);
  else await logActivity('Usuário atualizado', updates.name || id);
}

export async function deleteAdminUserSupa(id: string) {
  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) console.error('deleteAdminUser error:', error);
  else await logActivity('Usuário removido', id);
}

export async function resetAdminUserPasswordSupa(id: string, newPassword: string) {
  const { error } = await supabase.from('admin_users').update({ password: newPassword }).eq('id', id);
  if (error) {
    console.error('resetPassword error:', error);
    throw error;
  }
  await logActivity('Senha resetada', id);
}

export function generateRandomPassword(length = 10): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

// ===== Plans =====
export async function fetchPlans(): Promise<SaasPlan[]> {
  const { data, error } = await supabase.from('saas_plans').select('*').order('created_at', { ascending: false });
  if (error) { console.error('fetchPlans error:', error); return []; }
  return (data || []).map(p => ({ 
    id: p.id, 
    name: p.name, 
    price: Number(p.price), 
    annualPrice: p.annual_price ? Number(p.annual_price) : undefined,
    currency: p.currency, 
    features: p.features 
  }));
}

export async function createPlan(plan: Omit<SaasPlan, 'id'>) {
  const { error } = await supabase.from('saas_plans').insert({ 
    name: plan.name, 
    price: plan.price, 
    annual_price: plan.annualPrice || null,
    currency: plan.currency, 
    features: plan.features 
  });
  if (error) console.error('createPlan error:', error);
  else await logActivity('Plano criado', plan.name);
}

export async function updatePlanSupa(id: string, updates: Partial<SaasPlan>) {
  const mapped: any = { ...updates };
  if (updates.annualPrice !== undefined) {
    mapped.annual_price = updates.annualPrice;
    delete mapped.annualPrice;
  }
  const { error } = await supabase.from('saas_plans').update(mapped).eq('id', id);
  if (error) console.error('updatePlan error:', error);
}

export async function deletePlanSupa(id: string) {
  const { error } = await supabase.from('saas_plans').delete().eq('id', id);
  if (error) console.error('deletePlan error:', error);
}

// ===== Activity Logs =====
export async function fetchActivityLogs(): Promise<AdminActivityLog[]> {
  const { data, error } = await supabase.from('admin_activity_logs').select('*').order('timestamp', { ascending: false }).limit(200);
  if (error) { console.error('fetchActivityLogs error:', error); return []; }
  return (data || []).map(l => ({ id: l.id, action: l.action, details: l.details, timestamp: l.timestamp }));
}

// ===== Settings =====
export async function fetchAdminSettings(): Promise<AdminSettings> {
  const cached = readSettingsCache();

  try {
    const { data, error } = await supabase.from('admin_settings').select('*');
    if (error) throw error;

    if (Array.isArray(data) && data.length > 0) {
      const settings = mapAdminSettingsRows(data);
      writeSettingsCache(settings);
      return settings;
    }

    return cached ?? DEFAULT_ADMIN_SETTINGS;
  } catch (error) {
    console.warn('fetchAdminSettings fallback to cache:', error);
    return cached ?? DEFAULT_ADMIN_SETTINGS;
  }
}

export async function updateAdminSettingsSupa(updates: Partial<AdminSettings>): Promise<{ hasError: boolean; errorMessage: string }> {
  const mergedSettings: AdminSettings = {
    ...DEFAULT_ADMIN_SETTINGS,
    ...(readSettingsCache() ?? {}),
    ...updates,
  };

  writeSettingsCache(mergedSettings);

  let hasRemoteError = false;
  let lastErrorMessage = '';
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue;
    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });

    if (error) {
      hasRemoteError = true;
      lastErrorMessage = error.message;
      console.error(`updateAdminSettingsSupa error (${key}):`, error);
    }
  }

  if (!hasRemoteError) {
    await logActivity('Configurações atualizadas', Object.keys(updates).join(', '));
  }

  return { hasError: hasRemoteError, errorMessage: lastErrorMessage };
}

// ===== Backfill: create saas_companies for profiles missing them =====
export async function backfillMissingCompanies(): Promise<{ created: number; error?: string }> {
  const sql = `
    WITH missing AS (
      SELECT p.id AS user_id, p.company_id, p.name, p.email, p.phone, p.document, p.country, p.company_name, p.account_type
      FROM profiles p
      LEFT JOIN saas_companies sc ON sc.id = p.company_id
      WHERE p.company_id IS NOT NULL AND sc.id IS NULL
    ),
    inserted_saas AS (
      INSERT INTO saas_companies (id, name, document, country, contact_name, contact_email, contact_phone, status)
      SELECT
        m.company_id,
        COALESCE(NULLIF(m.company_name, ''), m.name, 'Empresa sem nome'),
        COALESCE(m.document, ''),
        COALESCE(m.country, 'BR'),
        COALESCE(m.name, ''),
        COALESCE(m.email, ''),
        COALESCE(m.phone, ''),
        'pendente'
      FROM missing m
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ),
    inserted_companies AS (
      INSERT INTO companies (id, name, country, language, multi_currency, currency_priority, active_currencies, exchange_rates)
      SELECT
        m.company_id,
        COALESCE(NULLIF(m.company_name, ''), m.name, 'Empresa sem nome'),
        COALESCE(m.country, 'BR'),
        CASE WHEN COALESCE(m.country, 'BR') = 'PY' THEN 'es-PY' ELSE 'pt-BR' END,
        true,
        '["BRL","PYG","USD"]'::jsonb,
        '["BRL","PYG","USD"]'::jsonb,
        '[]'::jsonb
      FROM missing m
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ),
    no_company AS (
      SELECT p.id AS user_id, p.name, p.email, p.phone, p.document, p.country, p.company_name
      FROM profiles p
      WHERE p.company_id IS NULL
    ),
    new_ids AS (
      SELECT n.user_id, gen_random_uuid() AS new_company_id, n.name, n.email, n.phone, n.document, n.country, n.company_name
      FROM no_company n
    ),
    ins_saas2 AS (
      INSERT INTO saas_companies (id, name, document, country, contact_name, contact_email, contact_phone, status)
      SELECT
        ni.new_company_id,
        COALESCE(NULLIF(ni.company_name, ''), ni.name, 'Empresa sem nome'),
        COALESCE(ni.document, ''),
        COALESCE(ni.country, 'BR'),
        COALESCE(ni.name, ''),
        COALESCE(ni.email, ''),
        COALESCE(ni.phone, ''),
        'pendente'
      FROM new_ids ni
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ),
    ins_comp2 AS (
      INSERT INTO companies (id, name, country, language, multi_currency, currency_priority, active_currencies, exchange_rates)
      SELECT
        ni.new_company_id,
        COALESCE(NULLIF(ni.company_name, ''), ni.name, 'Empresa sem nome'),
        COALESCE(ni.country, 'BR'),
        CASE WHEN COALESCE(ni.country, 'BR') = 'PY' THEN 'es-PY' ELSE 'pt-BR' END,
        true,
        '["BRL","PYG","USD"]'::jsonb,
        '["BRL","PYG","USD"]'::jsonb,
        '[]'::jsonb
      FROM new_ids ni
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ),
    upd AS (
      UPDATE profiles
      SET company_id = ni.new_company_id
      FROM new_ids ni
      WHERE profiles.id = ni.user_id AND profiles.company_id IS NULL
      RETURNING profiles.id
    )
    SELECT
      (SELECT count(*) FROM inserted_saas) + (SELECT count(*) FROM ins_saas2) AS total_created;
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      console.error('backfillMissingCompanies error:', error);
      return { created: 0, error: error.message };
    }
    return { created: data?.[0]?.total_created ?? 0 };
  } catch (err: any) {
    return { created: 0, error: err.message };
  }
}

// ===== Mappers (snake_case → camelCase) =====
function mapCompany(row: any): SaasCompany {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    country: row.country,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    planExpiry: row.plan_expiry || '',
    planId: row.plan_id,
    createdAt: row.created_at,
  };
}

function mapPayment(row: any): SaasPayment {
  return {
    id: row.id,
    companyId: row.company_id,
    amount: Number(row.amount),
    currency: row.currency,
    date: row.date,
    description: row.description,
    status: row.status,
  };
}

function mapAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    password: '', // Never expose
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
  };
}
