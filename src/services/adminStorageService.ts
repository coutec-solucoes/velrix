import { AdminData, SaasCompany, SaasPayment, AdminUser, SaasPlan, AdminActivityLog, AdminSettings } from '@/types/admin';

const ADMIN_KEY = 'veltor_admin_data';
const ADMIN_AUTH_KEY = 'veltor_admin_auth'; // kept for backward compat cleanup

export function getCompanyStatusForUser(userEmail: string): { status: 'ativo' | 'suspenso' | 'pendente' | 'inativo' | 'not_found'; companyName?: string } {
  const data = getAdminData();
  const company = data.companies.find(c => c.contactEmail.toLowerCase() === userEmail.toLowerCase());
  if (!company) return { status: 'not_found' };
  return { status: company.status, companyName: company.name };
}

export function getAdminData(): AdminData {
  const raw = localStorage.getItem(ADMIN_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Migrate old data
      if (!parsed.users) parsed.users = generateSampleUsers();
      if (!parsed.plans) parsed.plans = generateSamplePlans();
      if (!parsed.activityLogs) parsed.activityLogs = [];
      if (!parsed.settings) parsed.settings = defaultSettings();
      return parsed;
    } catch { /* fall through */ }
  }
  const initial: AdminData = {
    companies: generateSampleCompanies(),
    payments: generateSamplePayments(),
    users: generateSampleUsers(),
    plans: generateSamplePlans(),
    activityLogs: [],
    settings: defaultSettings(),
  };
  localStorage.setItem(ADMIN_KEY, JSON.stringify(initial));
  return initial;
}

function saveAdminData(data: AdminData) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(data));
}

function logActivity(action: string, details: string) {
  const data = getAdminData();
  data.activityLogs.unshift({
    id: crypto.randomUUID(),
    action,
    details,
    timestamp: new Date().toISOString(),
  });
  if (data.activityLogs.length > 200) data.activityLogs = data.activityLogs.slice(0, 200);
  saveAdminData(data);
}

// Auth - now handled by Supabase Auth + useAdminAuth hook
// These functions are kept only for backward compatibility cleanup
/** @deprecated Use useAdminAuth hook instead */
export function adminLogin(_email: string, _password: string): boolean {
  console.warn('[AdminAuth] adminLogin() is deprecated. Use useAdminAuth hook with Supabase Auth.');
  return false;
}
/** @deprecated Use useAdminAuth hook instead */
export function isAdminAuthenticated(): boolean {
  console.warn('[AdminAuth] isAdminAuthenticated() is deprecated. Use useAdminAuth hook.');
  return false;
}
/** @deprecated Use useAdminAuth hook instead */
export function adminLogout() {
  localStorage.removeItem(ADMIN_AUTH_KEY);
}

// Companies
export function getCompanies(): SaasCompany[] { return getAdminData().companies; }
export function addCompany(company: SaasCompany) {
  const data = getAdminData(); data.companies.push(company); saveAdminData(data);
  logActivity('Empresa criada', company.name);
}
export function updateCompany(id: string, updates: Partial<SaasCompany>) {
  const data = getAdminData(); const idx = data.companies.findIndex(c => c.id === id);
  if (idx !== -1) { data.companies[idx] = { ...data.companies[idx], ...updates }; saveAdminData(data); logActivity('Empresa editada', data.companies[idx].name); }
}
export function updateCompanyStatus(id: string, status: SaasCompany['status']) {
  const data = getAdminData(); const idx = data.companies.findIndex(c => c.id === id);
  if (idx !== -1) { data.companies[idx].status = status; saveAdminData(data); logActivity('Status alterado', `${data.companies[idx].name} → ${status}`); }
}
export function updateCompanyExpiry(id: string, planExpiry: string) {
  const data = getAdminData(); const idx = data.companies.findIndex(c => c.id === id);
  if (idx !== -1) { data.companies[idx].planExpiry = planExpiry; saveAdminData(data); logActivity('Plano estendido', data.companies[idx].name); }
}
export function deleteCompany(id: string) {
  const data = getAdminData();
  const company = data.companies.find(c => c.id === id);
  data.companies = data.companies.filter(c => c.id !== id);
  data.payments = data.payments.filter(p => p.companyId !== id);
  data.users = data.users.filter(u => u.companyId !== id);
  saveAdminData(data);
  if (company) logActivity('Empresa excluída', company.name);
}

// Payments
export function getPayments(companyId?: string): SaasPayment[] {
  const payments = getAdminData().payments;
  return companyId ? payments.filter(p => p.companyId === companyId) : payments;
}
export function addPayment(payment: SaasPayment) {
  const data = getAdminData(); data.payments.push(payment); saveAdminData(data);
  logActivity('Pagamento registrado', `Empresa: ${data.companies.find(c => c.id === payment.companyId)?.name || payment.companyId}`);
}

// Users (per company)
export function getAdminUsers(companyId?: string): AdminUser[] {
  const users = getAdminData().users;
  return companyId ? users.filter(u => u.companyId === companyId) : users;
}
export function addAdminUser(user: AdminUser) {
  const data = getAdminData(); data.users.push(user); saveAdminData(data);
  logActivity('Usuário criado', `${user.name} (${user.email})`);
}
export function updateAdminUser(id: string, updates: Partial<AdminUser>) {
  const data = getAdminData(); const idx = data.users.findIndex(u => u.id === id);
  if (idx !== -1) { data.users[idx] = { ...data.users[idx], ...updates }; saveAdminData(data); logActivity('Usuário atualizado', data.users[idx].name); }
}
export function deleteAdminUser(id: string) {
  const data = getAdminData();
  const user = data.users.find(u => u.id === id);
  data.users = data.users.filter(u => u.id !== id); saveAdminData(data);
  if (user) logActivity('Usuário removido', `${user.name} (${user.email})`);
}
export function resetAdminUserPassword(id: string, newPassword: string) {
  const data = getAdminData(); const idx = data.users.findIndex(u => u.id === id);
  if (idx !== -1) { data.users[idx].password = newPassword; saveAdminData(data); logActivity('Senha resetada', data.users[idx].name); }
}

// Plans
export function getPlans(): SaasPlan[] { return getAdminData().plans; }
export function addPlan(plan: SaasPlan) { const data = getAdminData(); data.plans.push(plan); saveAdminData(data); logActivity('Plano criado', plan.name); }
export function updatePlan(id: string, updates: Partial<SaasPlan>) {
  const data = getAdminData(); const idx = data.plans.findIndex(p => p.id === id);
  if (idx !== -1) { data.plans[idx] = { ...data.plans[idx], ...updates }; saveAdminData(data); }
}
export function deletePlan(id: string) { const data = getAdminData(); data.plans = data.plans.filter(p => p.id !== id); saveAdminData(data); }

// Activity Logs
export function getActivityLogs(): AdminActivityLog[] { return getAdminData().activityLogs; }

// Settings
export function getAdminSettings(): AdminSettings { return getAdminData().settings; }
export function updateAdminSettings(updates: Partial<AdminSettings>) {
  const data = getAdminData(); data.settings = { ...data.settings, ...updates }; saveAdminData(data);
  logActivity('Configurações atualizadas', Object.keys(updates).join(', '));
}

// Defaults
function defaultSettings(): AdminSettings {
  return { supabaseUrl: '', supabaseAnonKey: '', brandName: 'Velrix', brandLogo: '' };
}

function generateSampleCompanies(): SaasCompany[] {
  return [];
}

function generateSamplePayments(): SaasPayment[] {
  return [];
}

function generateSampleUsers(): AdminUser[] {
  return [];
}

function generateSamplePlans(): SaasPlan[] {
  return [];
}
