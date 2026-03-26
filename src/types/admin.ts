export type CompanyStatus = 'ativo' | 'suspenso' | 'pendente' | 'inativo';

export interface SaasCompany {
  id: string;
  name: string;
  document: string;
  country: 'BR' | 'PY';
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: CompanyStatus;
  planExpiry: string;
  planId?: string;
  createdAt: string;
}

export interface SaasPayment {
  id: string;
  companyId: string;
  amount: number;
  currency: 'BRL' | 'PYG' | 'USD';
  date: string;
  description: string;
  status: 'pago' | 'pendente';
}

export type AdminUserRole = 'proprietario' | 'administrador' | 'financeiro' | 'visualizador';

export interface AdminUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  password: string;
  role: AdminUserRole;
  active: boolean;
  createdAt: string;
}

export interface SaasPlan {
  id: string;
  name: string;
  price: number;
  annualPrice?: number;
  currency: 'BRL' | 'PYG' | 'USD';
  features: string;
}

export interface AdminActivityLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface AdminSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  brandName: string;
  brandLogo: string;
  // Payment APIs - Brazil
  pixKey?: string;
  pixMerchantName?: string;
  pixCity?: string;
  // Payment APIs - Paraguay
  pagoparPublicKey?: string;
  pagoparPrivateKey?: string;
  bancardPublicKey?: string;
  bancardPrivateKey?: string;
  // Mercado Pago (cartão de crédito recorrente)
  mpPublicKey?: string;
  mpSecretKey?: string;
}

export interface AdminData {
  companies: SaasCompany[];
  payments: SaasPayment[];
  users: AdminUser[];
  plans: SaasPlan[];
  activityLogs: AdminActivityLog[];
  settings: AdminSettings;
}
