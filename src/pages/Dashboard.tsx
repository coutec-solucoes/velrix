import { useState, useEffect, useMemo } from 'react';
import { getAppData, getUIShownCurrencies } from '@/services/storageService';
import { getExchangeRate } from '@/utils/currencyConversion';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { AppData, Currency, Transaction } from '@/types';
import { useTranslation } from '@/hooks/useI18n';
import { LayoutGrid, Columns, Rows3, Calendar } from 'lucide-react';
import CurrencySummarySection from '@/components/dashboard/CurrencySummarySection';
import ConsolidatedSummary from '@/components/dashboard/ConsolidatedSummary';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import CashFlowForecast from '@/components/dashboard/CashFlowForecast';
import TrialBanner from '@/components/TrialBanner';

type PeriodFilter = 'month' | 'quarter' | 'year' | 'all';

function getDateRange(filter: PeriodFilter): { from: string; to: string } | null {
  if (filter === 'all') return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (filter === 'month') {
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0);
    return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
  }
  if (filter === 'quarter') {
    const qStart = Math.floor(m / 3) * 3;
    const from = new Date(y, qStart, 1);
    const to = new Date(y, qStart + 3, 0);
    return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
  }
  // year
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const periodLabelsRaw: Record<PeriodFilter, string> = {
  month: 'dash_period_month',
  quarter: 'dash_period_quarter',
  year: 'dash_period_year',
  all: 'dash_period_all',
};

export default function Dashboard() {
  const [transactions] = useRealtimeData('transactions');
  const [clients] = useRealtimeData('clients');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const [data, setData] = useState<AppData | null>(null);
  const [viewMode, setViewMode] = useState<'default' | 'columns' | 'compact'>(() => {
    return (localStorage.getItem('dash_view_mode') as any) || 'default';
  });
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() => {
    return (localStorage.getItem('dash_period_filter') as PeriodFilter) || 'month';
  });
  const { t } = useTranslation();
  const periodLabels: Record<PeriodFilter, string> = {
    month: t('dash_period_month'),
    quarter: t('dash_period_quarter'),
    year: t('dash_period_year'),
    all: t('dash_period_all'),
  };

  const cycleViewMode = () => {
    const modes: Array<'default' | 'columns' | 'compact'> = ['default', 'columns', 'compact'];
    const next = modes[(modes.indexOf(viewMode) + 1) % modes.length];
    setViewMode(next);
    localStorage.setItem('dash_view_mode', next);
  };

  const handlePeriodChange = (p: PeriodFilter) => {
    setPeriodFilter(p);
    localStorage.setItem('dash_period_filter', p);
  };

  useEffect(() => {
    setData(getAppData());
    // DEBUG: Log transaction types to diagnose missing receitas
    const typeCounts: Record<string, number> = {};
    transactions.forEach((tx) => {
      typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
    });
    console.log('[Dashboard DEBUG] Total transactions:', transactions.length);
    console.log('[Dashboard DEBUG] By type:', JSON.stringify(typeCounts));
    console.log('[Dashboard DEBUG] Sample transactions:', JSON.stringify(transactions.slice(0, 5).map(tx => ({ id: tx.id?.slice(0, 8), type: tx.type, amount: tx.amount, currency: tx.currency, status: tx.status, dueDate: tx.dueDate }))));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const range = getDateRange(periodFilter);
    if (!range) return transactions;
    return transactions.filter((tx) => {
      const d = tx.dueDate || tx.createdAt?.split('T')[0];
      return d >= range.from && d <= range.to;
    });
  }, [transactions, periodFilter]);

  if (!data) return null;

  const { settings } = data;
  const company = settings.company;
  const activeCurrencies = getUIShownCurrencies();

  const primaryCurrency = activeCurrencies[0];

  const convertToPrimary = (amount: number, currency: Currency): number => {
    return amount * getExchangeRate(currency, primaryCurrency);
  };

  const showMultiSections = activeCurrencies.length > 1;

  const range = getDateRange(periodFilter);
  const periodDescription = range
    ? `${new Date(range.from + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(range.to + 'T12:00:00').toLocaleDateString('pt-BR')}`
    : '';

  return (
    <div className="space-y-6">
      <TrialBanner />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">{t('dash_title')}</h1>
        <div className="flex items-center gap-2">
          {/* Period filter */}
          <div className="inline-flex items-center rounded-lg border border-border overflow-hidden">
            {(Object.keys(periodLabels) as PeriodFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-3 py-2 text-body-sm font-medium transition-colors ${
                  periodFilter === p
                    ? 'bg-secondary text-secondary-foreground'
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
          {/* View mode */}
          <button
            onClick={cycleViewMode}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm font-medium border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title={viewMode === 'default' ? t('dash_view_columns') : viewMode === 'columns' ? t('dash_view_compact') : t('dash_view_default')}
          >
            {viewMode === 'default' && <><Rows3 size={18} /> {t('dash_view_default')}</>}
            {viewMode === 'columns' && <><Columns size={18} /> {t('dash_view_columns')}</>}
            {viewMode === 'compact' && <><LayoutGrid size={18} /> {t('dash_view_compact')}</>}
          </button>
        </div>
      </div>

      {/* Period info */}
      {periodFilter !== 'all' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar size={14} />
          <span>{t('rep_period')}: <strong className="text-foreground">{periodLabels[periodFilter]}</strong> · {periodDescription}</span>
          <span className="text-muted-foreground/60">({filteredTransactions.length} {t('fin_installments').toLowerCase()})</span>
        </div>
      )}

      {showMultiSections && (
        <ConsolidatedSummary
          transactions={transactions}
          primaryCurrency={primaryCurrency}
          convertToPrimary={convertToPrimary}
          t={t}
        />
      )}

      <div className={
        viewMode === 'columns' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' :
        viewMode === 'compact' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' :
        'space-y-6'
      }>
        {activeCurrencies.map((currency) => (
          <CurrencySummarySection
            key={currency}
            currency={currency}
            transactions={filteredTransactions}
            allTransactions={transactions}
            clients={clients}
            bankAccounts={bankAccounts}
            t={t}
            compact={viewMode === 'compact'}
          />
        ))}
      </div>

      {/* Charts & Forecast — always shown below the summary cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DashboardCharts
          transactions={filteredTransactions}
          primaryCurrency={primaryCurrency}
          categories={data.categories}
          t={t}
        />
        <CashFlowForecast
          transactions={transactions}
          bankAccounts={bankAccounts}
          primaryCurrency={primaryCurrency}
        />
      </div>
    </div>
  );
}
