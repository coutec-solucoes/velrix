import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  RefreshCw, CheckCircle2, XCircle,
  Loader2, Database, BarChart3, Wifi, WifiOff, Activity, Timer, TimerOff
} from 'lucide-react';

interface TableDiag {
  table: string;
  label: string;
  count: number | null;
  error?: string;
}

const allDiagTables = [
  { table: 'profiles', label: 'Perfis de Usuários' },
  { table: 'companies', label: 'Empresas' },
  { table: 'users_secure', label: 'Usuários (App)' },
  { table: 'clients', label: 'Clientes' },
  { table: 'transactions', label: 'Movimentações' },
  { table: 'contracts', label: 'Contratos' },
  { table: 'categories', label: 'Categorias' },
  { table: 'bank_accounts', label: 'Contas Bancárias' },
  { table: 'cash_movements', label: 'Movimentos de Caixa' },
  { table: 'audit_logs', label: 'Logs de Auditoria' },
  { table: 'currencies', label: 'Moedas' },
  { table: 'current_exchange_rates', label: 'Cotações Atuais' },
  { table: 'exchange_rate_history', label: 'Histórico de Cotações' },
  { table: 'app_settings', label: 'Configurações' },
  { table: 'saas_companies', label: 'Empresas SaaS' },
  { table: 'saas_payments', label: 'Pagamentos SaaS' },
  { table: 'saas_plans', label: 'Planos' },
  { table: 'admin_users_secure', label: 'Usuários Admin' },
  { table: 'admin_activity_logs', label: 'Logs Admin' },
  { table: 'admin_roles', label: 'Roles Admin' },
];

const INTERVAL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1min', value: 60 },
  { label: '5min', value: 300 },
];

export default function DataSyncPanel() {
  const [results, setResults] = useState<TableDiag[]>([]);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [autoRefreshSec, setAutoRefreshSec] = useState(0);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runDiagnostic = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setConnectionOk(false);
      return;
    }

    setChecking(true);

    const t0 = performance.now();
    try {
      const { error } = await supabase.from('profiles').select('id').limit(0);
      setLatencyMs(Math.round(performance.now() - t0));
      setConnectionOk(!error);
    } catch {
      setLatencyMs(null);
      setConnectionOk(false);
    }

    const diag: TableDiag[] = [];
    for (const t of allDiagTables) {
      try {
        const { count, error } = await supabase
          .from(t.table)
          .select('*', { count: 'exact', head: true });
        diag.push({
          table: t.table,
          label: t.label,
          count: error ? null : (count ?? 0),
          error: error?.message,
        });
      } catch (e: any) {
        diag.push({ table: t.table, label: t.label, count: null, error: e.message });
      }
    }

    setResults(diag);
    setLastCheck(new Date().toLocaleTimeString('pt-BR'));
    setChecking(false);
    setNextRefreshIn(autoRefreshSec);
  }, [autoRefreshSec]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (autoRefreshSec > 0) {
      setNextRefreshIn(autoRefreshSec);
      intervalRef.current = setInterval(() => {
        runDiagnostic();
      }, autoRefreshSec * 1000);
      countdownRef.current = setInterval(() => {
        setNextRefreshIn(prev => (prev > 0 ? prev - 1 : autoRefreshSec));
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefreshSec, runDiagnostic]);

  const totalRecords = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const tablesOk = results.filter(r => r.count !== null).length;
  const tablesError = results.filter(r => r.count === null).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <Activity size={16} className="text-secondary" /> Diagnóstico Supabase
            </div>
            <p className="text-white/40 text-xs mt-1">
              Verifique a saúde da conexão e a contagem de registros em cada tabela.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-refresh selector */}
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
              {autoRefreshSec > 0
                ? <Timer size={13} className="text-secondary shrink-0" />
                : <TimerOff size={13} className="text-white/30 shrink-0" />
              }
              <select
                value={autoRefreshSec}
                onChange={e => setAutoRefreshSec(Number(e.target.value))}
                className="bg-transparent text-white/70 text-xs outline-none cursor-pointer"
              >
                {INTERVAL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} className="bg-zinc-900 text-white">
                    {o.label}
                  </option>
                ))}
              </select>
              {autoRefreshSec > 0 && (
                <span className="text-white/30 text-[10px] font-mono ml-1">{nextRefreshIn}s</span>
              )}
            </div>
            <button onClick={runDiagnostic} disabled={checking}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {checking ? 'Analisando...' : 'Executar'}
            </button>
          </div>
        </div>

        {/* Connection status */}
        {connectionOk !== null && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-xs ${
            connectionOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-destructive/5 border-destructive/20'
          }`}>
            {connectionOk ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-destructive" />}
            <span className={connectionOk ? 'text-emerald-400 font-medium' : 'text-destructive font-medium'}>
              {connectionOk ? 'Conexão ativa' : 'Conexão falhou'}
            </span>
            {latencyMs !== null && (
              <span className="text-white/40 font-mono">{latencyMs}ms</span>
            )}
          </div>
        )}

        {/* Summary bar */}
        {lastCheck && results.length > 0 && (
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <span className="text-white/40">Última análise: {lastCheck}</span>
            <span className="text-emerald-400">{tablesOk} tabelas acessíveis</span>
            {tablesError > 0 && <span className="text-destructive">{tablesError} com erro</span>}
            <span className="text-white/50 font-mono">{totalRecords.toLocaleString('pt-BR')} registros totais</span>
          </div>
        )}

        {/* Table list */}
        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map(r => (
              <div key={r.table} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs ${
                r.count !== null ? 'bg-white/5 border-white/10' : 'bg-destructive/5 border-destructive/20'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {r.count !== null
                    ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    : <XCircle size={13} className="text-destructive shrink-0" />
                  }
                  <span className="text-white font-medium">{r.label}</span>
                  <span className="text-white/30 font-mono text-[10px]">{r.table}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.count !== null ? (
                    <div className="flex items-center gap-1.5">
                      <Database size={11} className="text-white/30" />
                      <span className="text-white/70 font-mono">{r.count.toLocaleString('pt-BR')}</span>
                    </div>
                  ) : (
                    <span className="text-destructive text-[10px] truncate max-w-[200px]" title={r.error}>
                      {r.error || 'Erro'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !checking && (
          <div className="text-center py-8">
            <BarChart3 size={32} className="text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-xs">Clique em "Executar" para verificar o estado do banco de dados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
