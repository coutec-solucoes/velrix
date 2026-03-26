import { useState, useEffect } from 'react';
import { fetchAdminSettings, updateAdminSettingsSupa, fetchPlans, createPlan, updatePlanSupa, deletePlanSupa, fetchActivityLogs } from '@/services/adminSupabaseService';
import { AdminSettings, SaasPlan, AdminActivityLog } from '@/types/admin';
import { Settings, Database, CreditCard, Clock, Save, Plus, Trash2, Edit2, X, Palette, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, RefreshCw, Copy, Table2, Play, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getSupabase } from '@/lib/supabase';
import { allTables, TableSchema, getFullSchemaSQL, makeIdempotent, EXEC_SQL_BOOTSTRAP } from '@/lib/dbSchema';
import DataSyncPanel from '@/components/admin/DataSyncPanel';

const inputClass = 'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-secondary w-full';

function SqlBlockItem({ table, index, externalStatus, manualOnly = false }: { table: TableSchema; index: number; externalStatus?: { status: 'idle' | 'running' | 'success' | 'error'; message: string }; manualOnly?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localStatus, setLocalStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [localMessage, setLocalMessage] = useState('');

  const status = externalStatus?.status ?? localStatus;
  const message = externalStatus?.message ?? localMessage;

  const copySQL = () => {
    navigator.clipboard.writeText(makeIdempotent(table.sql));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const executeSQL = async () => {
    setLocalStatus('error');
    setLocalMessage('Execução direta via UI desabilitada por segurança (Padrão Enterprise). Copie e execute no SQL Editor do Supabase.');
  };

  return (
    <div className={`rounded-lg border transition-colors ${
      status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20' :
      status === 'error' ? 'bg-destructive/5 border-destructive/20' :
      status === 'running' ? 'bg-secondary/5 border-secondary/20' :
      'bg-white/5 border-white/10'
    }`}>
      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {expanded ? <ChevronDown size={14} className="text-white/40 shrink-0" /> : <ChevronRight size={14} className="text-white/40 shrink-0" />}
          <span className="text-white/30 text-xs font-mono shrink-0">{index + 1}.</span>
          <span className="text-white text-xs font-medium font-mono truncate">{table.name}</span>
          <span className="text-white/40 text-xs truncate hidden sm:inline">{table.description}</span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'success' && <CheckCircle2 size={14} className="text-emerald-400" />}
          {status === 'error' && <XCircle size={14} className="text-destructive" />}
          {status === 'running' && <Loader2 size={14} className="text-secondary animate-spin" />}
          <button onClick={copySQL} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Copiar SQL">
            <Copy size={13} />
          </button>
          <button onClick={executeSQL} disabled={status === 'running' || manualOnly}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-secondary/20 text-secondary text-xs font-medium hover:bg-secondary/30 transition-colors disabled:opacity-50"
            title="Execute no SQL Editor do Supabase">
            <Play size={12} />
            SQL Editor
          </button>
        </div>
      </div>
      {message && (
        <div className={`mx-3 mb-2 px-2.5 py-1.5 rounded text-xs ${
          status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'
        }`}>
          {message}
        </div>
      )}
      {expanded && (
        <pre className="mx-3 mb-3 bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto max-h-60 overflow-y-auto font-mono whitespace-pre-wrap">
          {makeIdempotent(table.sql)}
        </pre>
      )}
    </div>
  );
}

type Tab = 'supabase' | 'database' | 'sync' | 'plans' | 'logs' | 'brand' | 'apis';

interface TableStatus {
  name: string;
  description: string;
  exists: boolean;
  creating?: boolean;
  error?: string;
}

interface SqlBlockStatus {
  status: 'idle' | 'running' | 'success' | 'error';
  message: string;
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>('supabase');
  const [settings, setSettings] = useState<AdminSettings>({ supabaseUrl: '', supabaseAnonKey: '', brandName: 'Velrix', brandLogo: '' });
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [copiedRlsFix, setCopiedRlsFix] = useState(false);

  // Database verification state
  const [tableStatuses, setTableStatuses] = useState<TableStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [copiedSQL, setCopiedSQL] = useState(false);

  // Run All SQL state
  const [runAllActive, setRunAllActive] = useState(false);
  const [runAllIndex, setRunAllIndex] = useState(-1);
  const [runAllStatuses, setRunAllStatuses] = useState<Record<string, SqlBlockStatus>>({});
  const runAllSuccessCount = Object.values(runAllStatuses).filter(s => s.status === 'success').length;
  const runAllErrorCount = Object.values(runAllStatuses).filter(s => s.status === 'error').length;

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({ name: '', price: '', annualPrice: '', currency: 'BRL' as 'BRL' | 'PYG' | 'USD', features: '' });

  useEffect(() => {
    const load = async () => {
      const [p, l, s] = await Promise.all([fetchPlans(), fetchActivityLogs(), fetchAdminSettings()]);
      setPlans(p);
      setLogs(l);
      setSettings(s);
    };
    load();
  }, []);

  const handleSaveSettings = async () => {
    setSaveError(null);
    const result = await updateAdminSettingsSupa(settings);
    if (result && result.hasError) {
      setSaveError(result.errorMessage || 'Erro de RLS ao salvar. Execute o SQL de correção abaixo.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleTestConnection = async () => {
    const supabaseUrl = settings.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || 'https://iapvzhetbytxafseyffx.supabase.co';
    const supabaseKey = settings.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM';

    setTestStatus('testing');
    setTestMessage('');
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?select=id&limit=1`, {
        method: 'HEAD',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      });
      if (res.ok || res.status === 200) {
        setTestStatus('success');
        setTestMessage('Conexão bem-sucedida! O banco de dados está acessível.');
      } else {
        setTestStatus('error');
        setTestMessage(`Falha na conexão (HTTP ${res.status}). Verifique as credenciais.`);
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Não foi possível conectar. Verifique a URL e tente novamente.');
    }
  };

  const handleSavePlan = async () => {
    if (!planForm.name || !planForm.price) return;
    const planData = { 
      name: planForm.name, 
      price: parseFloat(planForm.price), 
      annualPrice: planForm.annualPrice ? parseFloat(planForm.annualPrice) : undefined,
      currency: planForm.currency, 
      features: planForm.features 
    };

    if (editPlanId) {
      await updatePlanSupa(editPlanId, planData);
    } else {
      await createPlan(planData);
    }
    const p = await fetchPlans(); setPlans(p); setShowPlanForm(false); setEditPlanId(null);
    setPlanForm({ name: '', price: '', annualPrice: '', currency: 'BRL', features: '' });
  };

  // ===== Database Verification =====
  // Blocks that require superuser (must be run in SQL Editor manually)
  const superuserOnly = new Set(['_exec_sql', '_rls_functions', 'profiles', '_secure_views']);

  // Real table names mapped from allTables schema entries
  const realTableNames: Record<string, string> = {
    profiles_table: 'profiles',
    companies: 'companies',
    users: 'users',
    clients: 'clients',
    categories: 'categories',
    transactions: 'transactions',
    contracts: 'contracts',
    currencies: 'currencies',
    current_exchange_rates: 'current_exchange_rates',
    exchange_rate_history: 'exchange_rate_history',
    app_settings: 'app_settings',
    saas_companies: 'saas_companies',
    saas_payments: 'saas_payments',
    saas_plans: 'saas_plans',
    admin_users: 'admin_users',
    admin_activity_logs: 'admin_activity_logs',
    admin_settings: 'admin_settings',
    admin_roles: 'admin_roles',
    bank_accounts: 'bank_accounts',
    cash_movements: 'cash_movements',
    audit_logs: 'audit_logs',
    cobradores: 'cobradores',
  };

  const checkTables = async () => {
    const client = getSupabase();
    if (!client) {
      setTableStatuses(allTables.map(t => ({ name: t.name, description: t.description, exists: false, error: 'Supabase não configurado' })));
      return;
    }
    setChecking(true);
    try {
      const statuses: TableStatus[] = [];

      // Check functions by calling them (they return null without auth but won't 404)
      let functionsExist = false;
      let execSqlExists = false;
      try {
        const { error } = await client.rpc('get_user_role');
        functionsExist = !error || !error.message.includes('Could not find');
      } catch { functionsExist = false; }
      try {
        const { error } = await client.rpc('exec_sql', { sql_query: 'SELECT 1' });
        execSqlExists = !error || !error.message.includes('Could not find');
      } catch { execSqlExists = false; }

      // Check views
      let viewsExist = false;
      try {
        const { error } = await client.from('users_secure').select('id').limit(0);
        viewsExist = !error;
      } catch { viewsExist = false; }

      // Check if profiles RLS is set up: if functions exist AND profiles table exists, the block was applied
      // handle_new_user is a trigger function (not exposed as RPC), so we check get_user_company_id instead
      const profilesRlsExists = functionsExist; // If RLS functions work, the profiles RLS block was applied

      for (const table of allTables) {
        if (table.name === '_exec_sql') {
          statuses.push({ name: table.name, description: table.description, exists: execSqlExists, error: execSqlExists ? undefined : '⚠️ Requer SQL Editor (superusuário)' });
          continue;
        }
        // Special checks for non-table entries
        if (table.name === '_rls_functions') {
          statuses.push({ name: table.name, description: table.description, exists: functionsExist, error: functionsExist ? undefined : '⚠️ Requer SQL Editor (superusuário)' });
          continue;
        }
        if (table.name === 'profiles') {
          statuses.push({ name: table.name, description: table.description, exists: profilesRlsExists, error: profilesRlsExists ? undefined : '⚠️ Requer SQL Editor (superusuário — trigger em auth.users)' });
          continue;
        }
        if (table.name === '_secure_views') {
          statuses.push({ name: table.name, description: table.description, exists: viewsExist, error: viewsExist ? undefined : '⚠️ Requer SQL Editor (superusuário — REVOKE/GRANT)' });
          continue;
        }
        if (table.name === '_realtime') {
          const mainTablesExist = statuses.some(s => s.name === 'clients' && s.exists);
          statuses.push({ name: table.name, description: table.description, exists: mainTablesExist, error: mainTablesExist ? undefined : 'Criar tabelas primeiro' });
          continue;
        }
        // Migration blocks: check if columns were added successfully
        if (table.name === '_migrations_v2') {
          try {
            const { error } = await client.from('clients').select('address_complement').limit(0);
            const migrationApplied = !error;
            statuses.push({ name: table.name, description: table.description, exists: migrationApplied, error: migrationApplied ? undefined : 'Colunas ainda não adicionadas' });
          } catch {
            statuses.push({ name: table.name, description: table.description, exists: false, error: 'Verificar manualmente' });
          }
          continue;
        }

        const tableName = realTableNames[table.name];
        if (!tableName) {
          statuses.push({ name: table.name, description: table.description, exists: false, error: 'Verificar manualmente' });
          continue;
        }
        try {
          const { error: tableError } = await client.from(tableName).select('id').limit(0);
          statuses.push({ name: table.name, description: table.description, exists: !tableError, error: tableError ? tableError.message : undefined });
        } catch (e: any) {
          statuses.push({ name: table.name, description: table.description, exists: false, error: e.message });
        }
      }
      setTableStatuses(statuses);
      setLastCheck(new Date().toLocaleTimeString('pt-BR'));
    } catch (err: any) {
      setTableStatuses(allTables.map(t => ({ name: t.name, description: t.description, exists: false, error: err.message })));
    } finally {
      setChecking(false);
    }
  };

  const createSingleTable = async (table: TableSchema) => {
    const client = getSupabase();
    if (!client) return;
    setTableStatuses(prev => prev.map(s => s.name === table.name ? { ...s, creating: true, error: undefined } : s));
    try {
      const { error } = await client.rpc('exec_sql', { sql_query: makeIdempotent(table.sql) });
      if (error) {
        setTableStatuses(prev => prev.map(s => s.name === table.name ? { ...s, creating: false, error: error.message } : s));
      } else {
        setTableStatuses(prev => prev.map(s => s.name === table.name ? { ...s, creating: false, exists: true, error: undefined } : s));
      }
    } catch {
      setTableStatuses(prev => prev.map(s => s.name === table.name ? { ...s, creating: false, error: 'Use o SQL Editor do Supabase para criar esta tabela manualmente.' } : s));
    }
  };

  const createAllMissing = async () => {
    setCreatingAll(true);
    const missing = allTables.filter(t => {
      const status = tableStatuses.find(s => s.name === t.name);
      return status && !status.exists;
    });
    for (const table of missing) {
      await createSingleTable(table);
    }
    setCreatingAll(false);
    setTimeout(() => checkTables(), 1000);
  };

  // Generate SQL only for missing items
  const getMissingSQL = (): string => {
    const missing = allTables.filter(t => {
      const status = tableStatuses.find(s => s.name === t.name);
      return status && !status.exists;
    });
    if (missing.length === 0) return '';
    return missing.map(t => `-- ${t.description}\n${makeIdempotent(t.sql)}`).join('\n\n');
  };

  const [copiedMissingSQL, setCopiedMissingSQL] = useState(false);
  const copyMissingSQL = () => {
    const sql = getMissingSQL();
    if (!sql) return;
    navigator.clipboard.writeText(sql);
    setCopiedMissingSQL(true);
    setTimeout(() => setCopiedMissingSQL(false), 2000);
  };

  const existingCount = tableStatuses.filter(s => s.exists).length;
  const totalCount = allTables.length;
  const missingCount = tableStatuses.length > 0 ? totalCount - existingCount : 0;

  // ===== Run All SQL Blocks =====
  const runAllBlocks = async () => {
    const client = getSupabase();
    if (!client) return;
    setRunAllActive(true);
    const newStatuses: Record<string, SqlBlockStatus> = {};
    allTables.forEach(t => { newStatuses[t.name] = { status: 'idle', message: '' }; });
    setRunAllStatuses(newStatuses);

    for (let i = 0; i < allTables.length; i++) {
      const table = allTables[i];
      setRunAllIndex(i);

      if (superuserOnly.has(table.name)) {
        setRunAllStatuses(prev => ({ ...prev, [table.name]: { status: 'success', message: 'Executar manualmente no SQL Editor' } }));
        continue;
      }

      setRunAllStatuses(prev => ({ ...prev, [table.name]: { status: 'running', message: '' } }));

      try {
        const { error } = await client.rpc('exec_sql', { sql_query: makeIdempotent(table.sql) });
        if (error) {
          setRunAllStatuses(prev => ({ ...prev, [table.name]: { status: 'error', message: error.message } }));
        } else {
          setRunAllStatuses(prev => ({ ...prev, [table.name]: { status: 'success', message: 'OK' } }));
        }
      } catch {
        setRunAllStatuses(prev => ({ ...prev, [table.name]: { status: 'error', message: 'Falha na execução.' } }));
      }
    }

    setRunAllIndex(-1);
    setRunAllActive(false);
    // Re-check tables after running all
    setTimeout(() => checkTables(), 500);
  };

  const copyFullSQL = () => {
    navigator.clipboard.writeText(getFullSchemaSQL());
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  const tabs: { id: Tab; label: string; icon: typeof Database }[] = [
    { id: 'supabase', label: 'Supabase', icon: Database },
    { id: 'database', label: 'Tabelas', icon: Table2 },
    { id: 'sync', label: 'Diagnóstico', icon: BarChart3 },
    { id: 'plans', label: 'Planos', icon: CreditCard },
    { id: 'logs', label: 'Logs', icon: Clock },
    { id: 'brand', label: 'Marca', icon: Palette },
    { id: 'apis', label: 'APIs', icon: Wifi },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-white text-lg font-semibold flex items-center gap-2"><Settings size={20} /> Configurações</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.id ? 'bg-secondary/20 text-secondary' : 'text-white/50 hover:text-white'}`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Supabase */}
      {tab === 'supabase' && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/70 text-sm"><Database size={16} className="text-secondary" /> Configuração Supabase</div>
            <p className="text-white/40 text-xs">Configure as credenciais do projeto Supabase para conectar o banco de dados.</p>
            <div className="space-y-3">
              <div><label className="text-white/50 text-xs mb-1 block">Supabase URL</label><input value={settings.supabaseUrl} onChange={e => setSettings(s => ({ ...s, supabaseUrl: e.target.value }))} placeholder="https://xxxx.supabase.co" className={inputClass} /></div>
              <div><label className="text-white/50 text-xs mb-1 block">Supabase Anon Key</label><input value={settings.supabaseAnonKey} onChange={e => setSettings(s => ({ ...s, supabaseAnonKey: e.target.value }))} placeholder="eyJhbGciOi..." className={inputClass} /></div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleSaveSettings} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity"><Save size={14} /> Salvar</button>
              <button onClick={handleTestConnection} disabled={testStatus === 'testing'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-medium hover:bg-white/15 transition-colors disabled:opacity-50">
                {testStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                {testStatus === 'testing' ? 'Testando...' : 'Testar Conexão'}
              </button>
              {saved && <span className="text-emerald-400 text-xs">✓ Salvo com sucesso (local + banco)</span>}
            </div>
            {testStatus !== 'idle' && testStatus !== 'testing' && (
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                {testStatus === 'success' ? <Wifi size={14} /> : <WifiOff size={14} />}
                {testMessage}
              </div>
            )}
          </div>

          {/* RLS Error + Fix SQL */}
          {saveError && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                <XCircle size={16} /> Erro ao salvar no banco de dados
              </div>
              <p className="text-destructive/80 text-xs">{saveError}</p>
              <p className="text-white/50 text-xs">
                ⚠️ Os dados foram salvos localmente, mas falharam no Supabase por erro de RLS (Row Level Security).
                Copie e execute o SQL abaixo no <strong>SQL Editor</strong> do Supabase para corrigir:
              </p>
              <pre className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto max-h-60 overflow-y-auto font-mono whitespace-pre-wrap">
{`-- Corrigir RLS da tabela admin_settings para permitir acesso via admin_roles
DROP POLICY IF EXISTS "SaaS admin can view settings" ON admin_settings;
DROP POLICY IF EXISTS "SaaS admin can manage settings" ON admin_settings;
DROP POLICY IF EXISTS "Admin can view settings" ON admin_settings;
DROP POLICY IF EXISTS "Admin can manage settings" ON admin_settings;

CREATE POLICY "Admin can view settings"
  ON admin_settings FOR SELECT TO authenticated
  USING (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admin can manage settings"
  ON admin_settings FOR ALL TO authenticated
  USING (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  );`}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`-- Corrigir RLS da tabela admin_settings para permitir acesso via admin_roles
DROP POLICY IF EXISTS "SaaS admin can view settings" ON admin_settings;
DROP POLICY IF EXISTS "SaaS admin can manage settings" ON admin_settings;
DROP POLICY IF EXISTS "Admin can view settings" ON admin_settings;
DROP POLICY IF EXISTS "Admin can manage settings" ON admin_settings;

CREATE POLICY "Admin can view settings"
  ON admin_settings FOR SELECT TO authenticated
  USING (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admin can manage settings"
  ON admin_settings FOR ALL TO authenticated
  USING (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_saas_admin()
    OR public.is_admin(auth.uid())
  );`);
                  setCopiedRlsFix(true);
                  setTimeout(() => setCopiedRlsFix(false), 2000);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
              >
                <Copy size={14} /> {copiedRlsFix ? 'Copiado!' : 'Copiar SQL de Correção'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Database Verification */}
      {tab === 'database' && (
        <div className="space-y-4 max-w-3xl">
          {/* Bootstrap exec_sql alert */}
          <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-secondary text-sm font-medium">
              <Database size={16} /> ⚡ Pré-requisito: Função exec_sql
            </div>
            <p className="text-white/60 text-xs">
              Para criar tabelas diretamente pelo painel, é necessário que a função <code className="text-secondary font-mono">exec_sql</code> exista no banco.
              Copie o SQL abaixo e execute no <strong>SQL Editor do Supabase</strong> uma única vez.
            </p>
            <pre className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
              {EXEC_SQL_BOOTSTRAP}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(EXEC_SQL_BOOTSTRAP);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Copy size={14} /> Copiar SQL do exec_sql
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 text-white/70 text-sm"><Table2 size={16} className="text-secondary" /> Verificação de Tabelas</div>
                <p className="text-white/40 text-xs mt-1">Compare e sincronize as tabelas do banco de dados com o esquema do sistema.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={checkTables} disabled={checking}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {checking ? 'Verificando...' : 'Verificar Tabelas'}
                </button>
              </div>
            </div>

            {lastCheck && (
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <span className="text-white/40">Última verificação: {lastCheck}</span>
                <span className="text-emerald-400">{existingCount} sincronizadas</span>
                {missingCount > 0 && (
                  <>
                    {(() => {
                      const superuserMissing = tableStatuses.filter(s => !s.exists && superuserOnly.has(s.name)).length;
                      const rpcMissing = missingCount - superuserMissing;
                      return (
                        <>
                          {rpcMissing > 0 && <span className="text-amber-400">{rpcMissing} faltando (auto)</span>}
                          {superuserMissing > 0 && <span className="text-orange-400">{superuserMissing} faltando (SQL Editor)</span>}
                        </>
                      );
                    })()}
                  </>
                )}
                {existingCount === totalCount && tableStatuses.length > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400 font-medium"><CheckCircle2 size={14} /> Tudo sincronizado!</span>
                )}
              </div>
            )}

            {/* Table list */}
            {tableStatuses.length > 0 && (
              <div className="space-y-1.5">
                {tableStatuses.map(status => {
                  const isSuperuser = superuserOnly.has(status.name);
                  return (
                    <div key={status.name} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs ${
                      status.exists 
                        ? 'bg-emerald-500/5 border-emerald-500/20' 
                        : isSuperuser
                          ? 'bg-orange-500/5 border-orange-500/20'
                          : 'bg-amber-500/5 border-amber-500/20'
                    }`}>
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {status.creating ? (
                          <Loader2 size={14} className="text-secondary animate-spin shrink-0" />
                        ) : status.exists ? (
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle size={14} className="text-amber-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium font-mono">{status.name}</span>
                          <span className="text-white/40">{status.description}</span>
                          {isSuperuser && !status.exists && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-300">SQL Editor</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {status.exists ? (
                          <span className="text-emerald-400 text-xs">✓ Sincronizado</span>
                        ) : isSuperuser ? (
                          <button
                            onClick={() => {
                              const table = allTables.find(t => t.name === status.name);
                              if (table) {
                                navigator.clipboard.writeText(makeIdempotent(table.sql));
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-orange-500/20 text-orange-300 text-xs font-medium hover:bg-orange-500/30 transition-colors"
                          >
                            <span className="flex items-center gap-1"><Copy size={11} /> Copiar SQL</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => createSingleTable(allTables.find(t => t.name === status.name)!)}
                            disabled={status.creating}
                            className="px-2.5 py-1 rounded bg-secondary/20 text-secondary text-xs font-medium hover:bg-secondary/30 transition-colors disabled:opacity-50"
                          >
                            Criar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions for missing tables */}
            {missingCount > 0 && (
              <div className="space-y-3 pt-2">
                {/* Copyable SQL for missing */}
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-amber-400 font-medium">
                      {missingCount} item(ns) faltando — copie o SQL abaixo e cole no SQL Editor do Supabase
                    </div>
                    <button onClick={copyMissingSQL}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors">
                      <Copy size={13} /> {copiedMissingSQL ? 'Copiado!' : 'Copiar SQL Faltante'}
                    </button>
                  </div>
                  <pre className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
                    {getMissingSQL()}
                  </pre>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={createAllMissing} disabled={creatingAll}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                    {creatingAll ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {creatingAll ? 'Criando...' : `Criar ${missingCount} via exec_sql (requer função)`}
                  </button>
                  <button onClick={() => checkTables()} disabled={checking}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-medium hover:bg-white/15 transition-colors disabled:opacity-50">
                    <RefreshCw size={13} /> Re-verificar
                  </button>
                </div>
              </div>
            )}

            {tableStatuses.length === 0 && !checking && (
              <div className="text-center py-8">
                <Table2 size={32} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-xs">Clique em "Verificar Tabelas" para comparar o banco de dados com o esquema do sistema.</p>
              </div>
            )}
          </div>

          {/* Data Sync */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/70 text-sm"><RefreshCw size={16} className="text-secondary" /> Sincronização de Dados</div>
            <p className="text-white/40 text-xs">A sincronização manual Local ↔ Supabase foi desativada neste painel.</p>
          </div>

          {/* SQL Blocks - Execute Individually */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 text-white/70 text-sm"><Play size={16} className="text-secondary" /> Execução SQL por Bloco</div>
                <p className="text-white/40 text-xs mt-1">Execute cada bloco individualmente ou todos em sequência.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runAllBlocks} disabled={runAllActive}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {runAllActive ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {runAllActive ? `Executando ${runAllIndex + 1}/${allTables.length}...` : 'Executar Todos'}
                </button>
                <button onClick={copyFullSQL}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-medium hover:bg-white/15 transition-colors">
                  <Copy size={13} /> {copiedSQL ? 'Copiado!' : 'Copiar Tudo'}
                </button>
              </div>
            </div>

            {/* Run All progress bar */}
            {(runAllActive || Object.keys(runAllStatuses).length > 0) && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary rounded-full transition-all duration-300"
                      style={{ width: `${((runAllSuccessCount + runAllErrorCount) / allTables.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-white/60 shrink-0">
                    {runAllSuccessCount + runAllErrorCount}/{allTables.length}
                  </span>
                </div>
                {!runAllActive && runAllSuccessCount + runAllErrorCount === allTables.length && (
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                    runAllErrorCount === 0
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {runAllErrorCount === 0
                      ? <><CheckCircle2 size={14} /> Todos os {allTables.length} blocos executados com sucesso!</>
                      : <><XCircle size={14} /> {runAllSuccessCount} sucesso, {runAllErrorCount} erro(s). Verifique os blocos com falha.</>
                    }
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {allTables.map((table, index) => (
                <SqlBlockItem
                  key={table.name}
                  table={table}
                  index={index}
                  manualOnly={superuserOnly.has(table.name)}
                  externalStatus={superuserOnly.has(table.name)
                    ? undefined
                    : (runAllStatuses[table.name]?.status !== 'idle' ? runAllStatuses[table.name] : undefined)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sync Panel */}
      {tab === 'sync' && <DataSyncPanel />}

      {/* Plans */}
      {tab === 'plans' && (
        <div className="space-y-4 max-w-3xl">
          <div className="flex items-center justify-between">
            <p className="text-white/70 text-sm flex items-center gap-2"><CreditCard size={16} className="text-secondary" /> Planos Disponíveis</p>
            <button onClick={() => { setShowPlanForm(true); setEditPlanId(null); setPlanForm({ name: '', price: '', annualPrice: '', currency: 'BRL', features: '' }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity"><Plus size={14} /> Novo Plano</button>
          </div>

          {showPlanForm && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-white text-sm font-medium">{editPlanId ? 'Editar Plano' : 'Novo Plano'}</p>
                <button onClick={() => { setShowPlanForm(false); setEditPlanId(null); }} className="text-white/40 hover:text-white"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div><label className="text-white/50 text-xs mb-1 block">Nome *</label><input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Profissional" className={inputClass} /></div>
                <div><label className="text-white/50 text-xs mb-1 block">Preço Mensal *</label><input type="number" step="0.01" value={planForm.price} onChange={e => setPlanForm(f => ({ ...f, price: e.target.value }))} placeholder="299.90" className={inputClass} /></div>
                <div><label className="text-white/50 text-xs mb-1 block">Preço Anual</label><input type="number" step="0.01" value={planForm.annualPrice} onChange={e => setPlanForm(f => ({ ...f, annualPrice: e.target.value }))} placeholder="2990.00" className={inputClass} /></div>
                <div><label className="text-white/50 text-xs mb-1 block">Moeda</label>
                  <select value={planForm.currency} onChange={e => setPlanForm(f => ({ ...f, currency: e.target.value as any }))} className={`${inputClass} [&>option]:bg-gray-900`}>
                    <option value="BRL">R$ (BRL)</option><option value="PYG">₲ (PYG)</option><option value="USD">$ (USD)</option>
                  </select>
                </div>
              </div>

              {/* Advanced Features (Checkboxes) */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Recursos e Módulos Habilitados</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'multi', label: 'Gestão Multi-Moedas' },
                    { id: 'contratos', label: 'Contratos Simplificados' },
                    { id: 'bancos', label: 'Contas Bancárias' },
                    { id: 'auditoria', label: 'Módulo de Auditoria' },
                    { id: 'cobrador', label: 'Cobrador em Tempo Real' },
                    { id: 'ilimitado', label: 'Clientes Ilimitados' },
                  ].map(feat => (
                    <label key={feat.id} className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={planForm.features.toLowerCase().split(',').map(s => s.trim()).includes(feat.id)}
                        onChange={e => {
                          const isChecked = e.target.checked;
                          setPlanForm(prev => {
                            const current = prev.features.toLowerCase();
                            const featuresList = current.split(',').map(s => s.trim()).filter(Boolean);
                            let newList;
                            if (isChecked) {
                              if (!featuresList.includes(feat.id)) {
                                newList = [...featuresList, feat.id];
                              } else {
                                newList = featuresList;
                              }
                            } else {
                              newList = featuresList.filter(s => s !== feat.id);
                            }
                            return { ...prev, features: newList.join(', ') };
                          });
                        }}
                        className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-secondary focus:ring-offset-0 focus:ring-secondary" 
                      />
                      <span className="text-white/70 text-xs group-hover:text-white transition-colors">{feat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <label className="text-white/50 text-xs mb-1 block">Resumo Manual de Recursos (Exibido para o cliente)</label>
                <input value={planForm.features} onChange={e => setPlanForm(f => ({ ...f, features: e.target.value }))} placeholder="Até 50 usuários, Multi-moeda..." className={inputClass} />
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleSavePlan} className="px-5 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 shadow-lg shadow-secondary/20 transition-all flex items-center gap-2">
                  <Save size={14} />
                  {editPlanId ? 'Salvar Alterações' : 'Criar Plano agora'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {plans.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-4 hover:bg-white/10 transition-colors group">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-semibold">{p.name}</p>
                    {p.name.toLowerCase().includes('pro') && <span className="bg-secondary/20 text-secondary text-[8px] uppercase font-black px-1.5 py-0.5 rounded">Pro</span>}
                  </div>
                  <p className="text-white/40 text-xs line-clamp-1">{p.features}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-white font-bold text-sm">
                      {p.currency === 'PYG' ? `₲ ${p.price.toLocaleString('es-PY')}` : p.currency === 'USD' ? `$ ${p.price.toFixed(2)}` : `R$ ${p.price.toFixed(2)}`}
                      <span className="text-white/40 text-[10px] font-normal ml-1">/mês</span>
                    </p>
                    {p.annualPrice && (
                      <p className="text-emerald-400 text-[10px] font-medium">
                        {p.currency === 'PYG' ? `₲ ${p.annualPrice.toLocaleString('es-PY')}` : p.currency === 'USD' ? `$ ${p.annualPrice.toFixed(2)}` : `R$ ${p.annualPrice.toFixed(2)}`}
                        <span className="opacity-60 ml-1">/ano</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditPlanId(p.id); setPlanForm({ name: p.name, price: String(p.price), annualPrice: p.annualPrice ? String(p.annualPrice) : '', currency: p.currency, features: p.features }); setShowPlanForm(true); }}
                      className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Editar"><Edit2 size={15} /></button>
                    <button onClick={async () => { if(confirm('Excluir este plano?')) { await deletePlanSupa(p.id); const pl = await fetchPlans(); setPlans(pl); } }}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors" title="Excluir"><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      {tab === 'logs' && (
        <div className="space-y-3 max-w-3xl">
          <p className="text-white/70 text-sm flex items-center gap-2"><Clock size={16} className="text-secondary" /> Logs de Atividades</p>
          {logs.length === 0 ? (
            <p className="text-white/30 text-xs py-8 text-center">Nenhuma atividade registrada ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 bg-white/5 rounded-lg px-3 py-2 text-xs">
                  <span className="text-white/30 whitespace-nowrap">{format(new Date(log.timestamp), "dd/MM HH:mm", { locale: ptBR })}</span>
                  <span className="text-secondary font-medium whitespace-nowrap">{log.action}</span>
                  <span className="text-white/60">{log.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* APIs Config */}
      {tab === 'apis' && (
        <div className="space-y-6 max-w-3xl">
          {/* Brazil - Pix */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="text-xl">🇧🇷</span> Configuração PIX (Brasil)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-white/50 text-xs mb-1 block">Chave PIX (CPF, CNPJ, Email, Telefone ou Chave Aleatória)</label>
                <input value={settings.pixKey || ''} onChange={e => setSettings(s => ({ ...s, pixKey: e.target.value }))} className={inputClass} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Nome do Beneficiário</label>
                <input value={settings.pixMerchantName || ''} onChange={e => setSettings(s => ({ ...s, pixMerchantName: e.target.value }))} className={inputClass} placeholder="Minha Empresa LTDA" />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Cidade</label>
                <input value={settings.pixCity || ''} onChange={e => setSettings(s => ({ ...s, pixCity: e.target.value }))} className={inputClass} placeholder="Sao Paulo" />
              </div>
            </div>
          </div>

          {/* Paraguay - Pagopar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="text-xl">🇵🇾</span> Configuração Pagopar (Paraguay)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-white/50 text-xs mb-1 block">Public Key</label>
                <input value={settings.pagoparPublicKey || ''} onChange={e => setSettings(s => ({ ...s, pagoparPublicKey: e.target.value }))} className={inputClass} placeholder="Public Key" />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Private Key</label>
                <input type="password" value={settings.pagoparPrivateKey || ''} onChange={e => setSettings(s => ({ ...s, pagoparPrivateKey: e.target.value }))} className={inputClass} placeholder="••••••••" />
              </div>
            </div>
          </div>

          {/* Paraguay - Bancard */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <span className="text-xl">🇵🇾</span> Configuração Bancard (Paraguay)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-white/50 text-xs mb-1 block">Public Key</label>
                <input value={settings.bancardPublicKey || ''} onChange={e => setSettings(s => ({ ...s, bancardPublicKey: e.target.value }))} className={inputClass} placeholder="Public Key" />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Private Key</label>
                <input type="password" value={settings.bancardPrivateKey || ''} onChange={e => setSettings(s => ({ ...s, bancardPrivateKey: e.target.value }))} className={inputClass} placeholder="••••••••" />
              </div>
            </div>
          </div>

          {/* Mercado Pago */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-lg">💳</span> Mercado Pago — Cartão de Crédito Recorrente
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${settings.mpPublicKey?.startsWith('TEST-') ? 'bg-amber-500/20 text-amber-300' : settings.mpPublicKey ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                {settings.mpPublicKey?.startsWith('TEST-') ? '🧪 Modo Teste' : settings.mpPublicKey ? '✅ Produção' : 'Não configurado'}
              </span>
            </div>
            <p className="text-white/40 text-xs">
              Chaves disponíveis em <strong className="text-white/60">mercadopago.com → Seu negócio → Credenciais</strong>.
              Use chaves <code className="text-amber-300">TEST-</code> para testes e chaves de produção para cobranças reais.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-white/50 text-xs mb-1 block">Public Key <span className="text-amber-300">(obrigatório para tokenizar cartão)</span></label>
                <input
                  value={settings.mpPublicKey || ''}
                  onChange={e => setSettings(s => ({ ...s, mpPublicKey: e.target.value }))}
                  className={inputClass}
                  placeholder="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Secret Key (Access Token) <span className="text-white/30">(para processar cobranças no backend)</span></label>
                <input
                  type="password"
                  value={settings.mpSecretKey || ''}
                  onChange={e => setSettings(s => ({ ...s, mpSecretKey: e.target.value }))}
                  className={inputClass}
                  placeholder="TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
            </div>
            {settings.mpPublicKey && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${settings.mpPublicKey.startsWith('TEST-') ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'}`}>
                <span className="text-base leading-none">{settings.mpPublicKey.startsWith('TEST-') ? '🧪' : '✅'}</span>
                <span>
                  {settings.mpPublicKey.startsWith('TEST-')
                    ? 'Modo TESTE ativo — nenhuma cobrança real será feita. Troque pelas chaves de produção quando estiver pronto para ir ao ar.'
                    : 'Modo PRODUÇÃO ativo — cobranças reais serão processadas.'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleSaveSettings} className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Save size={16} /> Salvar Configurações de APIs
            </button>
            {saved && <span className="text-emerald-400 text-sm animate-fade-in">✓ Configurações salvas!</span>}
          </div>
        </div>
      )}

      {/* Branding */}
      {tab === 'brand' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4 max-w-2xl">
          <div className="flex items-center gap-2 text-white/70 text-sm"><Palette size={16} className="text-secondary" /> Personalização</div>
          <div className="space-y-3">
            <div><label className="text-white/50 text-xs mb-1 block">Nome do Sistema</label><input value={settings.brandName} onChange={e => setSettings(s => ({ ...s, brandName: e.target.value }))} placeholder="Velrix" className={inputClass} /></div>
            <div><label className="text-white/50 text-xs mb-1 block">URL do Logo</label><input value={settings.brandLogo} onChange={e => setSettings(s => ({ ...s, brandLogo: e.target.value }))} placeholder="https://..." className={inputClass} /></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveSettings} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity"><Save size={14} /> Salvar</button>
            {saved && <span className="text-emerald-400 text-xs">✓ Salvo com sucesso</span>}
          </div>
        </div>
      )}
    </div>
  );
}
