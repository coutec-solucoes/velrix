import { Transaction, Currency } from '@/types';
import { formatCurrency, formatDate, getStatusColor } from '@/utils/formatters';
import CurrencyFlag from '@/components/CurrencyFlag';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
} from 'lucide-react';

interface CurrencySummarySectionProps {
  currency: Currency;
  transactions: Transaction[];
  allTransactions: Transaction[];
  clients: any[];
  bankAccounts: any[];
  t: (key: string) => string;
  compact?: boolean;
}

export default function CurrencySummarySection({
  currency,
  transactions,
  allTransactions,
  clients,
  bankAccounts,
  t,
  compact = false,
}: CurrencySummarySectionProps) {
  const txs = transactions.filter((tx) => tx.currency === currency);
  const allTxs = allTransactions.filter((tx) => tx.currency === currency);

  const totalInvested = txs.filter((t) => t.type === 'investimento').reduce((s, t) => s + t.amount, 0);
  const totalReceived = txs.filter((t) => (t.type === 'receita' || t.type === 'investimento') && t.status === 'pago').reduce((s, t) => s + t.amount, 0);
  const totalToReceive = allTxs.filter((t) => (t.type === 'receita' || t.type === 'investimento') && t.status !== 'pago').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = txs.filter((t) => (t.type === 'despesa' || t.type === 'retirada') && t.status === 'pago').reduce((s, t) => s + t.amount, 0);
  const totalToPay = allTxs.filter((t) => (t.type === 'despesa' || t.type === 'retirada') && t.status !== 'pago').reduce((s, t) => s + t.amount, 0);
  const profit = totalReceived - totalExpenses;

  const cards = [
    { label: t('dash_total_invested'), value: formatCurrency(totalInvested, currency), icon: Wallet, color: 'text-secondary' },
    { label: t('dash_total_received'), value: formatCurrency(totalReceived, currency), icon: ArrowUpRight, color: 'text-success' },
    { label: t('dash_to_receive'), value: formatCurrency(totalToReceive, currency), icon: Clock, color: 'text-warning' },
    { label: t('dash_to_pay'), value: formatCurrency(totalToPay, currency), icon: ArrowDownRight, color: 'text-destructive' },
    { label: t('dash_real_profit'), value: formatCurrency(profit, currency), icon: profit >= 0 ? TrendingUp : TrendingDown, color: profit >= 0 ? 'text-success' : 'text-destructive' },
  ];

  const contasReceber = allTxs
    .filter((t) => (t.type === 'receita' || t.type === 'investimento') && t.status !== 'pago')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 50);

  const contasPagar = allTxs
    .filter((t) => (t.type === 'despesa' || t.type === 'retirada') && t.status !== 'pago')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 50);

  const currencyAccounts = bankAccounts.filter((a) => a.active && a.currency === currency);


  const renderAccountBlock = (title: string, items: Transaction[], icon: React.ReactNode, emptyMsg: string) => (
    <div className="bg-card rounded-lg p-4 card-shadow border border-border flex flex-col h-[300px]">
      <h4 className="text-body-sm font-semibold mb-3 flex items-center gap-2 shrink-0">{icon} {title}</h4>
      <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-xs">{emptyMsg}</p>
        ) : (
          items.map((tx) => {
            const client = clients.find((c) => c.id === tx.clientId);
            return (
              <div key={tx.id} className="flex items-center justify-between p-2 rounded-md bg-accent/50 shrink-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{client?.name || '—'} · {formatDate(tx.dueDate)}</p>
                </div>
                <div className="text-right ml-2 shrink-0">
                  <p className="text-xs font-semibold">{formatCurrency(tx.amount, tx.currency)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>{t(`fin_status_${tx.status}` as any)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (txs.length === 0 && currencyAccounts.length === 0) return null;

  return (
    <div className={`space-y-4 p-5 bg-card rounded-xl card-shadow border border-border ${compact ? 'p-4' : ''}`}>
      <h2 className={`font-bold flex items-center gap-2 ${compact ? 'text-body' : 'text-title-section'}`}>
        <CurrencyFlag currency={currency} size={compact ? 'md' : 'lg'} showCode={true} />
        Resumo em {currency}
      </h2>

      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
        {cards.map((card) => (
          <div key={card.label} className="bg-accent/30 rounded-lg p-3 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <card.icon size={compact ? 14 : 16} className={card.color} />
            </div>
            <p className={`font-bold ${compact ? 'text-body-sm' : 'text-body'}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {!compact && currencyAccounts.length > 0 && (
        <div>
          <h4 className="text-body-sm font-semibold mb-2 flex items-center gap-2"><Wallet size={14} /> Saldos ({currency})</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currencyAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-accent/50">
                <div>
                  <p className="text-xs font-medium">{acc.name}</p>
                  <p className="text-xs text-muted-foreground">{acc.bankName || acc.accountType}</p>
                </div>
                <p className={`text-body-sm font-semibold ${acc.currentBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(acc.currentBalance, acc.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderAccountBlock('Contas a Receber', contasReceber, <ArrowUpRight size={16} className="text-success" />, 'Nenhuma pendência')}
          {renderAccountBlock('Contas a Pagar', contasPagar, <ArrowDownRight size={16} className="text-destructive" />, 'Nenhuma pendência')}
        </div>
      )}

    </div>
  );
}
