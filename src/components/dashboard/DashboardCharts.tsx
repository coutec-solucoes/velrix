import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Transaction, Currency } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getExchangeRate } from '@/utils/currencyConversion';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';

interface DashboardChartsProps {
  transactions: Transaction[];
  primaryCurrency: Currency;
  categories: { id: string; name: string; type: string }[];
  t: (key: string) => string;
}

const CHART_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
];

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export default function DashboardCharts({ transactions, primaryCurrency, categories, t }: DashboardChartsProps) {
  const [activeChart, setActiveChart] = useState<'bar' | 'pie'>('bar');

  const convertToPrimary = (amount: number, currency: Currency) =>
    amount * getExchangeRate(currency, primaryCurrency);

  // Last 6 months bar chart data
  const barData = useMemo(() => {
    const months: { label: string; from: Date; to: Date }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({ label: getMonthLabel(from), from, to });
    }

    return months.map(({ label, from, to }) => {
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];
      const monthTxs = transactions.filter((tx) => {
        const d = tx.dueDate || tx.createdAt?.split('T')[0];
        return d >= fromStr && d <= toStr;
      });

      const receitas = monthTxs
        .filter((tx) => (tx.type === 'receita' || tx.type === 'investimento') && tx.status === 'pago')
        .reduce((sum, tx) => sum + convertToPrimary(tx.amount, tx.currency), 0);

      const despesas = monthTxs
        .filter((tx) => (tx.type === 'despesa' || tx.type === 'retirada') && tx.status === 'pago')
        .reduce((sum, tx) => sum + convertToPrimary(tx.amount, tx.currency), 0);

      return { label, receitas: Math.round(receitas * 100) / 100, despesas: Math.round(despesas * 100) / 100 };
    });
  }, [transactions, primaryCurrency]);

  // Category pie chart
  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type !== 'despesa' && tx.type !== 'retirada') return;
      const cat = tx.category || 'Sem categoria';
      map[cat] = (map[cat] || 0) + convertToPrimary(tx.amount, tx.currency);
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [transactions, primaryCurrency]);

  const formatYAxis = (value: number) => {
    if (primaryCurrency === 'PYG') {
      if (value >= 1_000_000) return `₲${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `₲${(value / 1_000).toFixed(0)}k`;
      return `₲${value}`;
    }
    const symbol = primaryCurrency === 'USD' ? '$' : 'R$';
    if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
    return `${symbol}${value}`;
  };

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey === 'receitas' ? 'Receitas' : 'Despesas'}: {formatCurrency(p.value, primaryCurrency)}
          </p>
        ))}
        {payload.length === 2 && (
          <p className={`font-semibold border-t border-border pt-1 mt-1 ${payload[0].value - payload[1].value >= 0 ? 'text-success' : 'text-destructive'}`}>
            Resultado: {formatCurrency(payload[0].value - payload[1].value, primaryCurrency)}
          </p>
        )}
      </div>
    );
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs">
        <p className="font-semibold">{payload[0].name}</p>
        <p style={{ color: payload[0].payload.fill }}>{formatCurrency(payload[0].value, primaryCurrency)}</p>
      </div>
    );
  };

  const hasBarData = barData.some((d) => d.receitas > 0 || d.despesas > 0);
  const hasPieData = pieData.length > 0;

  return (
    <div className="bg-card rounded-xl card-shadow border border-border p-5 space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-title-section font-bold flex items-center gap-2">
          {activeChart === 'bar' ? <BarChart3 size={18} /> : <PieIcon size={18} />}
          {activeChart === 'bar' ? 'Receitas vs Despesas — Últimos 6 meses' : 'Despesas por Categoria'}
        </h3>
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setActiveChart('bar')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${activeChart === 'bar' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
          >
            <BarChart3 size={14} /> Barras
          </button>
          <button
            onClick={() => setActiveChart('pie')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${activeChart === 'pie' ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
          >
            <PieIcon size={14} /> Pizza
          </button>
        </div>
      </div>

      {/* Bar Chart */}
      {activeChart === 'bar' && (
        hasBarData ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} barGap={4} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} className="fill-muted-foreground" width={70} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
              <Bar dataKey="receitas" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            Nenhuma transação paga nos últimos 6 meses
          </div>
        )
      )}

      {/* Pie Chart */}
      {activeChart === 'pie' && (
        hasPieData ? (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={40}
                paddingAngle={2}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
              <Legend
                formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                iconSize={10}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            Nenhuma despesa no período selecionado
          </div>
        )
      )}
    </div>
  );
}
