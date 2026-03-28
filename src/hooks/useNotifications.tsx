import { useMemo } from 'react';
import { Transaction, BankAccount, AppSettings } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

export type NotificationSeverity = 'error' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: 'overdue' | 'due_today' | 'due_soon' | 'low_balance' | 'plan';
}

export function useNotifications(
  transactions: Transaction[],
  bankAccounts: BankAccount[],
  settings: AppSettings | null,
): AppNotification[] {
  return useMemo(() => {
    if (!settings) return [];

    const notifications: AppNotification[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    // --- Overdue transactions ---
    const overdue = transactions.filter(
      (tx) => tx.status === 'atrasado' || (tx.status === 'pendente' && tx.dueDate < todayStr),
    );
    const overdueReceitas = overdue.filter((tx) => tx.type === 'receita' || tx.type === 'investimento');
    const overdueDespesas = overdue.filter((tx) => tx.type === 'despesa' || tx.type === 'retirada');

    if (overdueReceitas.length > 0) {
      notifications.push({
        id: 'overdue_receitas',
        title: `${overdueReceitas.length} recebimento${overdueReceitas.length > 1 ? 's' : ''} em atraso`,
        message: overdueReceitas.length === 1
          ? `"${overdueReceitas[0].description}" venceu em ${formatDate(overdueReceitas[0].dueDate)}`
          : `O mais antigo: "${overdueReceitas[0].description}" (${formatDate(overdueReceitas[0].dueDate)})`,
        severity: 'error',
        category: 'overdue',
      });
    }

    if (overdueDespesas.length > 0) {
      notifications.push({
        id: 'overdue_despesas',
        title: `${overdueDespesas.length} pagamento${overdueDespesas.length > 1 ? 's' : ''} em atraso`,
        message: overdueDespesas.length === 1
          ? `"${overdueDespesas[0].description}" venceu em ${formatDate(overdueDespesas[0].dueDate)}`
          : `O mais antigo: "${overdueDespesas[0].description}" (${formatDate(overdueDespesas[0].dueDate)})`,
        severity: 'error',
        category: 'overdue',
      });
    }

    // --- Due today ---
    const dueToday = transactions.filter(
      (tx) => tx.status === 'pendente' && tx.dueDate === todayStr,
    );
    if (dueToday.length > 0) {
      notifications.push({
        id: 'due_today',
        title: `${dueToday.length} vencimento${dueToday.length > 1 ? 's' : ''} hoje`,
        message: dueToday.length === 1
          ? `"${dueToday[0].description}" — ${formatCurrency(dueToday[0].amount, dueToday[0].currency)}`
          : `${dueToday.filter((t) => t.type === 'receita' || t.type === 'investimento').length} a receber · ${dueToday.filter((t) => t.type === 'despesa' || t.type === 'retirada').length} a pagar`,
        severity: 'warning',
        category: 'due_today',
      });
    }

    // --- Due in next 3 days (excluding today) ---
    const dueSoon = transactions.filter(
      (tx) => tx.status === 'pendente' && tx.dueDate > todayStr && tx.dueDate <= in3DaysStr,
    );
    if (dueSoon.length > 0) {
      notifications.push({
        id: 'due_soon',
        title: `${dueSoon.length} vencimento${dueSoon.length > 1 ? 's' : ''} nos próximos 3 dias`,
        message: dueSoon
          .slice(0, 2)
          .map((tx) => `"${tx.description}" (${formatDate(tx.dueDate)})`)
          .join(' · ') + (dueSoon.length > 2 ? ` e mais ${dueSoon.length - 2}…` : ''),
        severity: 'warning',
        category: 'due_soon',
      });
    }

    // --- Negative or very low bank balance ---
    bankAccounts
      .filter((a) => a.active && a.currentBalance < 0)
      .forEach((acc) => {
        notifications.push({
          id: `neg_balance_${acc.id}`,
          title: `Saldo negativo: ${acc.name}`,
          message: `Conta "${acc.name}" com saldo ${formatCurrency(acc.currentBalance, acc.currency)}`,
          severity: 'error',
          category: 'low_balance',
        });
      });

    // --- Plan expiry (if planExpiresAt is available in future) ---
    // Currently Company doesn't have planExpiresAt exposed, skip for now

    return notifications;
  }, [transactions, bankAccounts, settings]);
}
