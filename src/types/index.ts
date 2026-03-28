export type Currency = 'BRL' | 'PYG' | 'USD';
export type Country = 'BR' | 'PY';
export type PersonType = 'PF' | 'PJ';
export type PersonRole = 'cliente' | 'fornecedor' | 'ambos';
export type TransactionType = 'investimento' | 'despesa' | 'receita' | 'retirada';
export type TransactionStatus = 'pendente' | 'pago' | 'atrasado';
export type UserRole = 'proprietario' | 'administrador' | 'financeiro' | 'visualizador' | 'cobrador';
export type AppLanguage = 'pt-BR' | 'es-PY';

export type AppModule = 'dashboard' | 'financeiro' | 'caixa' | 'contasBancarias' | 'clientes' | 'categorias' | 'contratos' | 'configuracoes' | 'relatorios' | 'auditoria' | 'cobradores';

export interface ModulePermission {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

export type UserPermissions = Record<AppModule, ModulePermission>;

export const ALL_MODULES: { key: AppModule; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'caixa', label: 'Caixa' },
  { key: 'contasBancarias', label: 'Contas Bancárias' },
  { key: 'clientes', label: 'Pessoas' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'contratos', label: 'Contratos' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'cobradores', label: 'Cobradores' },
];

export function getDefaultPermissions(role: UserRole): UserPermissions {
  const allTrue: ModulePermission = { view: true, edit: true, delete: true };
  const viewOnly: ModulePermission = { view: true, edit: false, delete: false };
  const viewEdit: ModulePermission = { view: true, edit: true, delete: false };
  const none: ModulePermission = { view: false, edit: false, delete: false };

  const modules: AppModule[] = ['dashboard', 'financeiro', 'caixa', 'contasBancarias', 'clientes', 'categorias', 'contratos', 'configuracoes', 'relatorios', 'auditoria', 'cobradores'];

  if (role === 'proprietario' || role === 'administrador') {
    return Object.fromEntries(modules.map(m => [m, allTrue])) as UserPermissions;
  }
  if (role === 'financeiro') {
    return Object.fromEntries(modules.map(m => {
      if (['financeiro', 'caixa', 'contasBancarias', 'clientes', 'categorias', 'cobradores'].includes(m)) return [m, viewEdit];
      if (['dashboard', 'relatorios'].includes(m)) return [m, viewOnly];
      return [m, none];
    })) as UserPermissions;
  }
  if (role === 'cobrador') {
    return Object.fromEntries(modules.map(m => {
      if (['clientes', 'cobradores'].includes(m)) return [m, viewOnly];
      return [m, none];
    })) as UserPermissions;
  }
  // visualizador
  return Object.fromEntries(modules.map(m => [m, viewOnly])) as UserPermissions;
}

export interface Cobrador {
  id: string;
  userId?: string;
  name: string;
  region?: string;
  sector?: string;
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  password: string;
  role: UserRole;
  permissions?: UserPermissions;
  createdAt: string;
}

export interface ExchangeRate {
  pair: string;
  rate: number;
  updatedAt: string;
}

export interface ExchangeRateSnapshot {
  date: string;
  rates: { pair: string; rate: number }[];
}

export interface Company {
  id: string;
  name: string;
  logo?: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  country: Country;
  language: AppLanguage;
  multiCurrency: boolean;
  currencyPriority: Currency[]; // ordered: [0]=primary, [1]=secondary, [2]=tertiary
  activeCurrencies: Currency[];
  exchangeRates: ExchangeRate[];
  planId?: string;
  planName?: string;
  planFeatures?: string;
}

export interface Client {
  id: string;
  name: string;
  type: PersonType;
  personRole?: PersonRole;
  country: Country;
  document: string; // CPF/CNPJ (BR) or CI/RUC (PY)
  phone: string;
  phone2?: string;
  email: string;
  address: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string;
  // PJ-specific fields
  tradeName?: string;       // Nome fantasia
  stateRegistration?: string; // Inscrição Estadual
  municipalRegistration?: string; // Inscrição Municipal
  contactPerson?: string;   // Pessoa de contato
  contactPhone?: string;    // Telefone do contato
  cobradorId?: string;      // ID do cobrador responsável
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  currency: Currency;
  category: string;
  clientId?: string;
  dueDate: string;
  status: TransactionStatus;
  installments?: number;
  currentInstallment?: number;
  installmentGroupId?: string;
  recurrence?: 'mensal' | 'semanal' | 'anual' | null;
  paidAt?: string;
  paymentMethod?: string;
  bankAccountId?: string;
  cobradorId?: string;
  createdAt: string;
}

export type ContractStatus = 'rascunho' | 'aguardando_assinatura' | 'assinado' | 'cancelado';

export interface Contract {
  id: string;
  clientId: string;
  amount: number;
  currency: Currency;
  startDate: string;
  endDate: string;
  installments: number;
  description?: string;
  terms?: string;
  interestRate?: number;
  lateFeePercent?: number;
  transactionIds?: string[];
  installmentGroupId?: string;
  status: ContractStatus;
  signatureData?: string; // base64 PNG of client signature
  companySignatureData?: string; // base64 PNG of company/entrepreneur signature
  signingToken?: string; // unique token for public signing page
  signingTokenExpiresAt?: string; // ISO date when token expires
  signedAt?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
}

export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountType: 'corrente' | 'poupanca' | 'caixa';
  currency: Currency;
  initialBalance: number;
  currentBalance: number;
  active: boolean;
  createdAt: string;
}

export const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'transferencia_bancaria', label: 'Transferência Bancária' },
  { value: 'deposito', label: 'Depósito Bancário' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'outros', label: 'Outros' },
] as const;

export type PaymentMethodValue = typeof PAYMENT_METHODS[number]['value'];

export function getPaymentMethodLabel(value?: string): string {
  if (!value) return '—';
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}

export interface CashMovement {
  id: string;
  transactionId?: string;
  bankAccountId?: string;
  type: 'entrada' | 'saida' | 'transferencia';
  amount: number;
  currency: Currency;
  description: string;
  date: string;
  paymentMethod?: string;
  userId?: string;
  userName?: string;
  cobradorId?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: 'baixa_recebimento' | 'baixa_pagamento' | 'estorno';
  transactionId: string;
  transactionDescription: string;
  clientId?: string;
  clientName?: string;
  amount: number;
  currency: Currency;
  bankAccountId?: string;
  bankAccountName?: string;
  userId: string;
  userName: string;
  date: string;
  cobradorId?: string;
  createdAt: string;
}

export interface LateFeeSettings {
  enabled: boolean;
  feePercent: number;
  interestPerDay: number;
}

export interface AppSettings {
  company: Company;
  lateFees?: LateFeeSettings;
  cobradoresEnabled: boolean;
}

export interface AppData {
  users: User[];
  companies: Company[];
  clients: Client[];
  transactions: Transaction[];
  contracts: Contract[];
  categories: Category[];
  bankAccounts: BankAccount[];
  cashMovements: CashMovement[];
  auditLogs: AuditLog[];
  cobradores: Cobrador[];
  settings: AppSettings;
  exchangeRateHistory: ExchangeRateSnapshot[];
}
