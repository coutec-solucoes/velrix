import { Transaction, Currency } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import CurrencyFlag from '@/components/CurrencyFlag';
import { RefreshCw } from 'lucide-react';

interface ConsolidatedSummaryProps {
  transactions: Transaction[];
  primaryCurrency: Currency;
  convertToPrimary: (amount: number, currency: Currency) => number;
  t: (key: string) => string;
}

export default function ConsolidatedSummary({
  transactions,
  primaryCurrency,
  convertToPrimary,
  t,
}: ConsolidatedSummaryProps) {
  const totalReceivedAll = transactions
    .filter((tx) => (tx.type === 'receita' || tx.type === 'investimento') && tx.status === 'pago')
    .reduce((s, tx) => s + convertToPrimary(tx.amount, tx.currency), 0);
  const totalExpensesAll = transactions
    .filter((tx) => (tx.type === 'despesa' || tx.type === 'retirada') && tx.status === 'pago')
    .reduce((s, tx) => s + convertToPrimary(tx.amount, tx.currency), 0);
  const totalToReceiveAll = transactions
    .filter((tx) => (tx.type === 'receita' || tx.type === 'investimento') && tx.status !== 'pago')
    .reduce((s, tx) => s + convertToPrimary(tx.amount, tx.currency), 0);
  const totalToPayAll = transactions
    .filter((tx) => (tx.type === 'despesa' || tx.type === 'retirada') && tx.status !== 'pago')
    .reduce((s, tx) => s + convertToPrimary(tx.amount, tx.currency), 0);
  const profitAll = totalReceivedAll - totalExpensesAll;

  return (
    <div className="bg-card rounded-xl p-5 card-shadow border-2 border-secondary/30">
      <h2 className="text-title-section font-bold mb-4 flex items-center gap-2">
        <RefreshCw size={18} className="text-secondary" />
        Consolidado Geral (convertido para <CurrencyFlag currency={primaryCurrency} size="sm" />)
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-accent/30 rounded-lg p-4 border border-border/50">
          <span className="text-xs text-muted-foreground">{t('dash_total_received')}</span>
          <p className="text-body font-bold text-success">{formatCurrency(totalReceivedAll, primaryCurrency)}</p>
        </div>
        <div className="bg-accent/30 rounded-lg p-4 border border-border/50">
          <span className="text-xs text-muted-foreground">{t('dash_to_receive')}</span>
          <p className="text-body font-bold text-warning">{formatCurrency(totalToReceiveAll, primaryCurrency)}</p>
        </div>
        <div className="bg-accent/30 rounded-lg p-4 border border-border/50">
          <span className="text-xs text-muted-foreground">{t('dash_to_pay')}</span>
          <p className="text-body font-bold text-destructive">{formatCurrency(totalToPayAll, primaryCurrency)}</p>
        </div>
        <div className="bg-accent/30 rounded-lg p-4 border border-border/50">
          <span className="text-xs text-muted-foreground">{t('dash_real_profit')}</span>
          <p className={`text-body font-bold ${profitAll >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(profitAll, primaryCurrency)}</p>
        </div>
      </div>
    </div>
  );
}
