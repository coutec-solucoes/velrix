import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Transaction, BankAccount, Currency } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getExchangeRate } from '@/utils/currencyConversion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CashFlowForecastProps {
  transactions: Transaction[];
  bankAccounts: BankAccount[];
  primaryCurrency: Currency;
}

type Range = 30 | 60 | 90;

export default function CashFlowForecast({ transactions, bankAccounts, primaryCurrency }: CashFlowForecastProps) {
  const [range, setRange] = useState<Range>(30);

  const convertToPrimary = (amount: number, currency: Currency) =>
    amount * getExchangeRate(currency, primaryCurrency);

  const { chartData, startBalance, endBalance } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Starting balance = sum of all active bank accounts converted to primary
    const startBalance = bankAccounts
      .filter((a) => a.active)
      .reduce((sum, a) => sum + convertToPrimary(a.currentBalance, a.currency), 0);

    // Group pending transactions by date
    const byDate: Record<string, number> = {};

    transactions
      .filter((tx) => tx.status !== 'pago' && tx.dueDate)
      .forEach((tx) => {
        const txDate = new Date(tx.dueDate + 'T12:00:00');
        if (txDate < today) return; // skip already overdue (before today)
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + range);
        if (txDate > endDate) return;

        const key = tx.dueDate;
        const converted = convertToPrimary(tx.amount, tx.currency);

        if (tx.type === 'receita' || tx.type === 'investimento') {
          byDate[key] = (byDate[key] || 0) + converted;
        } else {
          byDate[key] = (byDate[key] || 0) - converted;
        }
      });

    // Build daily series
    const data: { date: string; label: string; balance: number; delta: number }[] = [];
    let running = startBalance;

    for (let i = 0; i <= range; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const delta = byDate[key] || 0;
      running += delta;

      data.push({
        date: key,
        label: i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        balance: Math.round(running * 100) / 100,
        delta,
      });
    }

    return { chartData: data, startBalance, endBalance: running };
  }, [transactions, bankAccounts, primaryCurrency, range]);

  const formatYAxis = (value: number) => {
    if (primaryCurrency === 'PYG') {
      if (Math.abs(value) >= 1_000_000) return `₲${(value / 1_000_000).toFixed(1)}M`;
      if (Math.abs(value) >= 1_000) return `₲${(value / 1_000).toFixed(0)}k`;
      return `₲${value}`;
    }
    const symbol = primaryCurrency === 'USD' ? '$' : 'R$';
    if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
    return `${symbol}${value.toFixed(0)}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const { balance, delta, date } = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[180px]">
        <p className="font-semibold text-foreground">{date === new Date().toISOString().split('T')[0] ? 'Hoje' : formatDate(date)}</p>
        <p className="text-foreground">Saldo projetado: <span className={`font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(balance, primaryCurrency)}</span></p>
        {delta !== 0 && (
          <p className={delta > 0 ? 'text-success' : 'text-destructive'}>
            {delta > 0 ? '+ Entradas' : '− Saídas'}: {formatCurrency(Math.abs(delta), primaryCurrency)}
          </p>
        )}
      </div>
    );
  };

  const trend = endBalance - startBalance;
  const isPositive = trend >= 0;
  const TrendIcon = trend === 0 ? Minus : isPositive ? TrendingUp : TrendingDown;
  const trendColor = trend === 0 ? 'text-muted-foreground' : isPositive ? 'text-success' : 'text-destructive';

  // Determine if chart dips below zero
  const hasNegative = chartData.some((d) => d.balance < 0);

  // Show only every Nth label for readability
  const labelStep = range === 30 ? 5 : range === 60 ? 10 : 15;

  return (
    <div className="bg-card rounded-xl card-shadow border border-border p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-title-section font-bold flex items-center gap-2">
            <TrendIcon size={18} className={trendColor} />
            Fluxo de Caixa Projetado
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Saldo atual: <span className="font-semibold text-foreground">{formatCurrency(startBalance, primaryCurrency)}</span>
            {' → '}
            Projetado: <span className={`font-semibold ${endBalance >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(endBalance, primaryCurrency)}</span>
            {trend !== 0 && (
              <span className={`ml-1 ${trendColor}`}>
                ({isPositive ? '+' : ''}{formatCurrency(trend, primaryCurrency)})
              </span>
            )}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {([30, 60, 90] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Warning if balance goes negative */}
      {hasNegative && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <TrendingDown size={14} />
          <span>Atenção: o saldo projetado fica negativo em algum momento dos próximos {range} dias.</span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            className="fill-muted-foreground"
            interval={labelStep - 1}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 10 }}
            className="fill-muted-foreground"
            width={72}
          />
          <Tooltip content={<CustomTooltip />} />
          {hasNegative && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />}
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#balanceGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-xs text-muted-foreground text-center">
        Projeção baseada nas transações pendentes com vencimento nos próximos {range} dias
      </p>
    </div>
  );
}
