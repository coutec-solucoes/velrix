import { Currency, Country, TransactionStatus, UserRole } from '@/types';

export function formatCurrency(amount: number, currency: Currency): string {
  const locales: Record<Currency, string> = { BRL: 'pt-BR', PYG: 'es-PY', USD: 'en-US' };
  const codes: Record<Currency, string> = { BRL: 'BRL', PYG: 'PYG', USD: 'USD' };
  return new Intl.NumberFormat(locales[currency], {
    style: 'currency',
    currency: codes[currency],
    minimumFractionDigits: currency === 'PYG' ? 0 : 2,
  }).format(amount);
}

export function formatDate(date: string): string {
  // Append T12:00:00 to date-only strings to avoid UTC midnight timezone shift
  const safeDate = date.length === 10 ? date + 'T12:00:00' : date;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(safeDate));
}

export function getCountryFlag(country: Country): string {
  return country === 'BR' ? '🇧🇷' : '🇵🇾';
}

export function getStatusColor(status: TransactionStatus): string {
  switch (status) {
    case 'pago': return 'bg-success/10 text-success';
    case 'pendente': return 'bg-warning/10 text-warning';
    case 'atrasado': return 'bg-destructive/10 text-destructive';
  }
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    proprietario: 'Proprietário',
    administrador: 'Administrador',
    financeiro: 'Financeiro',
    visualizador: 'Visualizador',
  };
  return labels[role];
}

export function getDocumentLabel(country: Country, type: 'PF' | 'PJ'): string {
  if (country === 'BR') return type === 'PF' ? 'CPF' : 'CNPJ';
  return type === 'PF' ? 'CI' : 'RUC';
}
