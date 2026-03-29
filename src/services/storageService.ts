import { AppData, Currency } from '@/types';
import { generateMockData } from '@/utils/mockData';
import { getSupabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

// ===== React Query Cache (replaces localStorage & memoryCache) =====

let persistentMemoryCache: AppData | null = null;

function getDefaultData(): AppData {
  return generateMockData();
}

export function getAppData(): AppData {
  if (persistentMemoryCache) return persistentMemoryCache;
  
  const cached = queryClient.getQueryData<AppData>(['appData']);
  if (!cached) {
    const defaultData = getDefaultData();
    queryClient.setQueryData(['appData'], defaultData);
    persistentMemoryCache = defaultData;
    return defaultData;
  }
  
  persistentMemoryCache = cached;
  return cached;
}

function updateCache(data: AppData) {
  persistentMemoryCache = data;
  queryClient.setQueryData(['appData'], data);
  (Object.keys(data) as Array<keyof AppData>).forEach((k) => {
    queryClient.setQueryData(['appData', k], data[k]);
  });
}

export function getData<K extends keyof AppData>(key: K): AppData[K] {
  return getAppData()[key];
}

export function getDefaultCurrency(): 'BRL' | 'PYG' | 'USD' {
  const data = getAppData();
  const company = data.settings.company;
  if (company.currencyPriority && company.currencyPriority.length > 0) {
    return company.currencyPriority[0] as any;
  }
  if (company.activeCurrencies && company.activeCurrencies.length > 0) {
    return company.activeCurrencies[0] as any;
  }
  return company.country === 'PY' ? 'PYG' : 'BRL';
}

export function getAvailableCurrencies(): Currency[] {
  const data = getAppData();
  const company = data.settings.company;
  if (company.multiCurrency) {
    return ['BRL', 'PYG', 'USD'];
  }
  return [getDefaultCurrency()];
}

/**
 * Returns the list of currencies that should be shown in UI tabs/selectors.
 * If multi-currency is ON: returns [primary, ...others]
 * If multi-currency is OFF: returns [primary]
 */
export function getUIShownCurrencies(): Currency[] {
  const data = getAppData();
  const company = data.settings.company;
  const multiCurrency = company.multiCurrency ?? false;
  
  if (multiCurrency) {
    // Ensure all 3 are available if multi-currency is on, 
    // but follow priority if it exists. Filter out any empty/invalid values.
    const priority = (company.currencyPriority || []).filter(Boolean) as Currency[];
    const all: Currency[] = ['BRL', 'PYG', 'USD'];
    const result = [...priority];
    all.forEach(c => {
      if (!result.includes(c)) result.push(c);
    });
    return result;
  }
  
  return [getDefaultCurrency()];
}

// ===== Supabase table mapping =====

const tableMap: Record<string, string> = {
  users: 'users',
  clients: 'clients',
  transactions: 'transactions',
  contracts: 'contracts',
  categories: 'categories',
  bankAccounts: 'bank_accounts',
  cashMovements: 'cash_movements',
  auditLogs: 'audit_logs',
  cobradores: 'cobradores',
  appSettings: 'app_settings',
};

const UUID_FIELDS = new Set(['client_id', 'bank_account_id', 'transaction_id', 'installment_group_id', 'cobrador_id']);

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    // Convert empty strings to null for UUID columns
    result[snakeKey] = (UUID_FIELDS.has(snakeKey) && value === '') ? null : value;
  }
  return result;
}

// Columns that exist only client-side and must NOT be sent to Supabase
const STRIP_COLUMNS: Record<string, Set<string>> = {
  cash_movements: new Set(['user_id', 'user_name']),
};

function filterForTable(table: string, row: Record<string, any>): Record<string, any> {
  const stripSet = STRIP_COLUMNS[table];
  if (!stripSet) return row;
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!stripSet.has(key)) filtered[key] = value;
  }
  return filtered;
}

function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

const COMPANY_SCOPED_TABLES = new Set(['users', 'clients', 'transactions', 'contracts', 'categories', 'bank_accounts', 'cash_movements', 'audit_logs', 'cobradores']);
let cachedCompanyContext: { userId: string | null; companyId: string | null; companyName: string | null } | null = null;
let _companyContextPromise: Promise<{ companyId: string | null; companyName: string | null }> | null = null;

async function getCurrentCompanyId(): Promise<string | null> {
  const ctx = await getCompanyContext();
  return ctx?.companyId ?? null;
}

async function getCompanyContext(): Promise<{ companyId: string | null; companyName: string | null }> {
  if (_companyContextPromise) {
    return _companyContextPromise;
  }

  _companyContextPromise = (async () => {
    const supabase = getSupabase();
    if (!supabase) return { companyId: null, companyName: null };

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    if (cachedCompanyContext && cachedCompanyContext.userId === userId) {
      return { companyId: cachedCompanyContext.companyId, companyName: cachedCompanyContext.companyName };
    }

    if (!user) {
      return { companyId: null, companyName: null };
    }

    let { data: companyId, error } = await supabase.rpc('get_user_company_id');
    if (error) {
      console.error('[Supabase] get_user_company_id failed:', error.message);
      cachedCompanyContext = { userId, companyId: null, companyName: null };
      return { companyId: null, companyName: null };
    }

    if (!companyId) {
      console.warn('[Supabase] get_user_company_id returned NULL, attempting auto-repair for user:', userId);
      const { data: repairData } = await supabase.rpc('ensure_profile_exists');
      if (repairData?.success) {
        const { data: retryId } = await supabase.rpc('get_user_company_id');
        if (retryId) companyId = retryId;
      }
    }

    let companyName: string | null = null;
    if (companyId) {
      const { data: companyData } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle();
      companyName = companyData?.name ?? null;
    }

    cachedCompanyContext = { userId, companyId: companyId ?? null, companyName };
    return { companyId: companyId ?? null, companyName };
  })();

  try {
    return await _companyContextPromise;
  } finally {
    _companyContextPromise = null;
  }
}

export function clearCompanyCache() {
  cachedCompanyContext = null;
  persistentMemoryCache = null;
  queryClient.removeQueries({ queryKey: ['appData'] });
}

// ===== Realtime subscriptions =====

export type RealtimeStatus = 'connected' | 'reconnecting' | 'offline';
type StatusChangeCallback = (status: RealtimeStatus) => void;
const statusListeners = new Set<StatusChangeCallback>();
let currentRealtimeStatus: RealtimeStatus = 'offline';

export function getRealtimeStatus(): RealtimeStatus { return currentRealtimeStatus; }

export function onRealtimeStatusChange(cb: StatusChangeCallback): () => void {
  statusListeners.add(cb);
  return () => { statusListeners.delete(cb); };
}

function setRealtimeStatus(s: RealtimeStatus) {
  if (s === currentRealtimeStatus) return;
  currentRealtimeStatus = s;
  statusListeners.forEach(cb => cb(s));
}

type DataChangeCallback = (table: string) => void;
const realtimeListeners = new Set<DataChangeCallback>();

export type ContractSignedCallback = (contractData: { id: string; clientId: string; description?: string; signedAt?: string }) => void;
const contractSignedListeners = new Set<ContractSignedCallback>();

export function onContractSigned(cb: ContractSignedCallback): () => void {
  contractSignedListeners.add(cb);
  return () => { contractSignedListeners.delete(cb); };
}

let realtimeChannel: any = null;
let realtimeRetryTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeShouldRun = false;
const REALTIME_RETRY_MS = 3000;

function scheduleRealtimeRetry() {
  if (!realtimeShouldRun || realtimeRetryTimer) return;
  realtimeRetryTimer = setTimeout(() => {
    realtimeRetryTimer = null;
    void startRealtimeSync();
  }, REALTIME_RETRY_MS);
}

export function onDataChange(callback: DataChangeCallback): () => void {
  realtimeListeners.add(callback);
  return () => { realtimeListeners.delete(callback); };
}

function notifyListeners(table: string) {
  realtimeListeners.forEach(cb => cb(table));
}

export async function startRealtimeSync() {
  const supabase = getSupabase();
  realtimeShouldRun = true;
  if (!supabase || realtimeChannel) return;

  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    scheduleRealtimeRetry();
    return;
  }

  if (realtimeRetryTimer) {
    clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer = null;
  }

  realtimeChannel = supabase
    .channel(`app-realtime-${companyId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('clients', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cobradores', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('cobradores', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('transactions', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('contracts', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('categories', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('users', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('companies', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('bank_accounts', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('cash_movements', payload); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs', filter: `company_id=eq.${companyId}` },
      (payload: any) => { handleRealtimeEvent('audit_logs', payload); })
    .subscribe((status: string) => {
      console.log('[Realtime] Status:', status);
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtimeStatus('reconnecting');
        if (realtimeChannel) {
          const ch = realtimeChannel;
          realtimeChannel = null;
          // Run asynchronously to prevent Supabase JS Infinite Loop (RangeError)
          setTimeout(() => {
            supabase.removeChannel(ch).catch(() => {});
          }, 0);
        }
        scheduleRealtimeRetry();
      }
    });
}

export function stopRealtimeSync() {
  realtimeShouldRun = false;
  if (realtimeRetryTimer) {
    clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer = null;
  }

  const supabase = getSupabase();
  if (supabase && realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  setRealtimeStatus('offline');
}

const reverseTableMap: Record<string, string> = {};
for (const [localKey, table] of Object.entries(tableMap)) {
  reverseTableMap[table] = localKey;
}

function handleRealtimeEvent(table: string, payload: any) {
  const localKey = reverseTableMap[table] || table;
  const data = getAppData();
  const collection = (data as any)[localKey];

  if (!Array.isArray(collection)) {
    if (table === 'companies' && payload.new) {
      const c = payload.new;
      const newData = { ...data, settings: { ...data.settings, company: {
        id: c.id, name: c.name, logo: c.logo, country: c.country,
        language: c.language, multiCurrency: c.multi_currency,
        currencyPriority: c.currency_priority, activeCurrencies: c.active_currencies,
        exchangeRates: c.exchange_rates,
      }}};
      updateCache(newData);
      notifyListeners('companies');
    }
    return;
  }

  const eventType = payload.eventType;
  const newRow = payload.new ? toCamelCase(payload.new) : null;
  const oldRow = payload.old ? toCamelCase(payload.old) : null;

  let updatedCollection = [...collection];

  if (eventType === 'INSERT' && newRow) {
    if (!updatedCollection.some((item: any) => item.id === newRow.id)) {
      updatedCollection.push(newRow);
    }
  } else if (eventType === 'UPDATE' && newRow) {
    const idx = updatedCollection.findIndex((item: any) => item.id === newRow.id);
    const oldItem = idx !== -1 ? updatedCollection[idx] : null;
    if (idx !== -1) updatedCollection[idx] = { ...updatedCollection[idx], ...newRow };
    else updatedCollection.push(newRow);

    // Detect contract signed externally (by client on public page)
    if (table === 'contracts' && newRow.status === 'assinado' && oldItem && oldItem.status !== 'assinado') {
      contractSignedListeners.forEach(cb => cb({
        id: newRow.id,
        clientId: newRow.clientId,
        description: newRow.description,
        signedAt: newRow.signedAt,
      }));
    }
  } else if (eventType === 'DELETE' && oldRow) {
    updatedCollection = updatedCollection.filter((item: any) => item.id !== oldRow.id);
  }

  const newData = { ...data, [localKey]: updatedCollection };
  updateCache(newData);
  notifyListeners(table);
}

async function ensureTenantRow(table: string, row: Record<string, any>): Promise<Record<string, any> | null> {
  const { companyId, companyName } = await getCompanyContext();
  if (!companyId) return null;
  if (table === 'companies') return { ...row, id: companyId };
  if (COMPANY_SCOPED_TABLES.has(table)) return { ...row, company_id: companyId, company_name: companyName || '' };
  return row;
}

async function isCurrentUserSaasAdmin(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return false;
  const { data, error } = await supabase.rpc('is_admin', { _user_id: authData.user.id });
  if (error) return false;
  return !!data;
}

// ===== WRITE OPERATIONS (Supabase-first, then in-memory cache) =====

export interface SyncResult {
  success: boolean;
  localOnly: boolean;
  error?: string;
}

export async function addData<K extends keyof AppData>(key: K, item: any): Promise<SyncResult> {
  const supabase = getSupabase();
  const table = tableMap[key as string];
  let syncOk = false;
  let syncError: string | undefined;

  if (supabase && table) {
    try {
      let snakeRow = toSnakeCase(item);
      if (table !== 'users') delete snakeRow.password;
      snakeRow = filterForTable(table, snakeRow);
      const scopedRow = await ensureTenantRow(table, snakeRow);
      if (scopedRow) {
        const query = table === 'users'
          ? supabase.from(table).insert(scopedRow)
          : supabase.from(table).upsert(scopedRow, { onConflict: 'id' });
        const { error } = await query;
        if (error) { syncError = error.message; }
        else { syncOk = true; }
      } else { syncError = 'company_id não encontrado'; }
    } catch (err: any) { syncError = err?.message || 'Erro de conexão'; }
  }

  const data = getAppData();
  const collection = data[key];
  if (Array.isArray(collection)) {
    const newCollection = [...collection, item];
    const newData = { ...data, [key]: newCollection };
    updateCache(newData);
    notifyListeners(tableMap[key as string] || key as string);
  }

  return { success: syncOk, localOnly: !syncOk, error: syncError };
}

export async function updateData<K extends keyof AppData>(
  key: K, id: string,
  updates: Partial<AppData[K] extends Array<infer U> ? U : never>
): Promise<SyncResult> {
  const data = getAppData();
  const collection = data[key];
  if (!Array.isArray(collection)) return { success: false, localOnly: true, error: 'Coleção inválida' };

  const index = collection.findIndex((item: any) => item.id === id);
  if (index === -1) return { success: false, localOnly: true, error: 'Item não encontrado' };

  const updated = { ...collection[index], ...updates };
  let syncOk = false;
  let syncError: string | undefined;

  const supabase = getSupabase();
  const table = tableMap[key as string];
  if (supabase && table) {
    try {
      let snakeRow = toSnakeCase(updated);
      if (table !== 'users') delete snakeRow.password;
      snakeRow = filterForTable(table, snakeRow);
      const scopedRow = await ensureTenantRow(table, snakeRow);
      if (scopedRow) {
        let query: any;
        if (table === 'users') {
          query = supabase.from(table).update(scopedRow).eq('id', id);
          if (COMPANY_SCOPED_TABLES.has(table)) {
            const companyId = await getCurrentCompanyId();
            if (companyId) query = query.eq('company_id', companyId);
          }
        } else {
          query = supabase.from(table).upsert(scopedRow, { onConflict: 'id' });
        }
        const { error } = await query;
        if (error) { syncError = error.message; }
        else { syncOk = true; }
      } else { syncError = 'company_id não encontrado'; }
    } catch (err: any) { syncError = err?.message || 'Erro de conexão'; }
  }

  const newCollection = [...collection];
  newCollection[index] = updated;
  const newData = { ...data, [key]: newCollection };
  updateCache(newData);
  notifyListeners(tableMap[key as string] || key as string);
  return { success: syncOk, localOnly: !syncOk, error: syncError };
}

export async function deleteData<K extends keyof AppData>(key: K, id: string): Promise<SyncResult> {
  const supabase = getSupabase();
  const table = tableMap[key as string];
  let syncOk = false;
  let syncError: string | undefined;

  if (supabase && table) {
    try {
      let query: any = supabase.from(table).delete().eq('id', id);
      if (COMPANY_SCOPED_TABLES.has(table)) {
        const companyId = await getCurrentCompanyId();
        if (companyId) query = query.eq('company_id', companyId);
      }
      const { error } = await query;
      if (error) { syncError = error.message; }
      else { syncOk = true; }
    } catch (err: any) { syncError = err?.message || 'Erro de conexão'; }
  }

  const data = getAppData();
  const collection = data[key];
  if (Array.isArray(collection)) {
    const newCollection = collection.filter((item: any) => item.id !== id);
    const newData = { ...data, [key]: newCollection };
    updateCache(newData);
    notifyListeners(tableMap[key as string] || key as string);
  }

  return { success: syncOk, localOnly: !syncOk, error: syncError };
}

export async function saveData<K extends keyof AppData>(key: K, value: AppData[K]): Promise<void> {
  const supabase = getSupabase();
  const table = tableMap[key as string];
  if (supabase && table && Array.isArray(value)) {
    try {
      const sourceRows: any[] = table === 'companies' ? (value as any[]).slice(0, 1) : (value as any[]);
      const rows = (await Promise.all(sourceRows.map(async (item: any) => {
        let row = toSnakeCase(item);
        if (table !== 'users') delete row.password;
        row = filterForTable(table, row);
        return ensureTenantRow(table, row);
      }))).filter((row): row is Record<string, any> => !!row);
      if (rows.length > 0) {
        await supabase.from(table).upsert(rows, { onConflict: 'id' });
      }
    } catch (err) {
      console.warn(`[Supabase] ❌ SaveData ${table} failed:`, err);
    }
  }
  const data = getAppData();
  data[key] = value;
  updateCache(data);
}

export async function updateSettings(settings: Partial<AppData['settings']>): Promise<void> {
  const data = getAppData();
  data.settings = { ...data.settings, ...settings };
  await syncSettingsToSupabase(data.settings);
  updateCache(data);
}

export async function addExchangeRateSnapshot(rates: { pair: string; rate: number }[]): Promise<void> {
  const data = getAppData();
  if (!data.exchangeRateHistory) data.exchangeRateHistory = [];
  const today = new Date().toISOString().split('T')[0];
  const idx = data.exchangeRateHistory.findIndex((s) => s.date === today);
  const snapshot = { date: today, rates };
  if (idx !== -1) data.exchangeRateHistory[idx] = snapshot;
  else data.exchangeRateHistory.push(snapshot);
  await syncExchangeRateToSupabase(snapshot);
  updateCache(data);
}

export function getExchangeRateHistory() {
  return getAppData().exchangeRateHistory || [];
}

// ===== Supabase sync helpers =====

async function syncSettingsToSupabase(settings: AppData['settings']) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const companyId = await getCurrentCompanyId();
    if (!companyId) return;

    const company = settings.company;
    const { error: compErr } = await supabase.from('companies').upsert({
      id: companyId, name: company.name, logo: company.logo || null,
      country: company.country, language: company.language,
      multi_currency: company.multiCurrency, currency_priority: company.currencyPriority,
      active_currencies: company.activeCurrencies, exchange_rates: company.exchangeRates,
      // Extra fields stored in companies table too
      document: company.document || null,
      phone: company.phone || null,
      email: company.email || null,
      address: company.address || null,
    }, { onConflict: 'id' });

    if (compErr) {
      console.warn('[Supabase] companies sync warning (some columns may not exist):', compErr.message);
    } else {
      console.log('[Supabase] ✅ companies synced');
    }

    // Also sync back to saas_companies so admin panel stays in sync
    if (company.document || company.phone || company.email) {
      await supabase.from('saas_companies').update({
        document: company.document || null,
        contact_phone: company.phone || null,
        contact_email: company.email || null,
      }).eq('id', companyId);
    }

    // Sync current exchange rates to dedicated table
    if (Array.isArray(company.exchangeRates) && company.exchangeRates.length > 0) {
      const rateRows = company.exchangeRates.map((r) => ({
        company_id: companyId,
        pair: r.pair,
        rate: r.rate,
        updated_at: r.updatedAt || new Date().toISOString(),
      }));
      const { error: rateErr } = await supabase.from('current_exchange_rates')
        .upsert(rateRows, { onConflict: 'company_id,pair' });
      if (rateErr) {
        console.warn('[Supabase] current_exchange_rates sync failed (table may not exist yet):', rateErr.message);
      } else {
        console.log('[Supabase] ✅ current_exchange_rates synced:', rateRows.length, 'pairs');
      }
    }

    if (settings.lateFees || settings.cobradoresEnabled !== undefined) {
      await supabase.from('app_settings').upsert({
        company_id: companyId,
        late_fee_enabled: settings.lateFees?.enabled ?? false,
        late_fee_percent: settings.lateFees?.feePercent ?? 0,
        interest_per_day: settings.lateFees?.interestPerDay ?? 0,
        cobradores_enabled: settings.cobradoresEnabled ?? false,
      }, { onConflict: 'company_id' });
    }
  } catch (err) {
    console.warn('[Supabase] Settings sync failed:', err);
  }
}

async function syncExchangeRateToSupabase(snapshot: { date: string; rates: { pair: string; rate: number }[] }) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const companyId = await getCurrentCompanyId();
    if (!companyId) return;
    await supabase.from('exchange_rate_history').upsert({
      company_id: companyId, date: snapshot.date, rates: snapshot.rates,
    }, { onConflict: 'company_id,date' });
  } catch (err) {
    console.warn('[Supabase] Exchange rate sync failed:', err);
  }
}

// ===== Pull from Supabase (populate in-memory cache) =====

let pullInProgress: Promise<boolean> | null = null;

export async function pullFromSupabase(): Promise<boolean> {
  // Prevent concurrent pulls — second call reuses the first's promise
  if (pullInProgress) return pullInProgress;
  pullInProgress = doPullFromSupabase();
  try { return await pullInProgress; }
  finally { pullInProgress = null; }
}

async function doPullFromSupabase(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      console.warn('[Supabase] Pull failed: no company_id found for current session.');
      return false;
    }
    console.log('[Supabase] Starting pull for company:', companyId);

    // Map tables that need secure views for reading (password columns revoked)
    const readSource: Record<string, string> = { users: 'users_secure' };

    // Pull tables in parallel and collect results to avoid race conditions in cache updates
    const tableEntries = Object.entries(tableMap);
    const pullResults = await Promise.all(tableEntries.map(async ([localKey, table]) => {
      const source = readSource[table] || table;
      let query: any = supabase.from(source).select('*');
      query = table === 'companies' ? query.eq('id', companyId) : query.eq('company_id', companyId);
      
      const { data: rows, error } = await query;
      if (error) {
        console.warn(`[Supabase] ⚠️ Pull ${source} failed:`, error.message);
        return { localKey, items: null };
      }
      return { localKey, items: rows ? rows.map((r: any) => toCamelCase(r)) : [] };
    }));

    const freshData = { ...getAppData() };
    pullResults.forEach(({ localKey, items }) => {
      if (items) {
        // Merge by ID: keep local-only items that haven't replicated yet
        const pulledIds = new Set(items.map((i: any) => i.id));
        const currentItems: any[] = (freshData as any)[localKey] || [];
        const localOnlyItems = currentItems.filter((i: any) => !pulledIds.has(i.id));
        (freshData as any)[localKey] = [...items, ...localOnlyItems];
      }
    });

    updateCache(freshData);
    pullResults.forEach(({ localKey, items }) => {
      if (items) notifyListeners(tableMap[localKey] || localKey);
    });

    // Pull company settings and history in parallel
    const [compRes, saasCompRes, histRes, appSetRes] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).limit(1),
      supabase.from('saas_companies').select('plan_id').eq('id', companyId).limit(1),
      supabase.from('exchange_rate_history').select('*').eq('company_id', companyId).order('date', { ascending: true }),
      supabase.from('app_settings').select('*').eq('company_id', companyId).limit(1),
    ]);

    if (compRes.data && compRes.data.length > 0) {
      const c = compRes.data[0];
      let exchangeRates = c.exchange_rates;

      // If exchange_rates in companies table is empty, try dedicated table
      if (!Array.isArray(exchangeRates) || exchangeRates.length === 0) {
        const { data: currentRates } = await supabase
          .from('current_exchange_rates')
          .select('*')
          .eq('company_id', companyId);
        if (currentRates && currentRates.length > 0) {
          exchangeRates = currentRates.map((r: any) => ({
            pair: r.pair,
            rate: Number(r.rate),
            updatedAt: r.updated_at,
          }));
        }
      }

      const saasC = saasCompRes.data?.[0];
      const planId = saasC?.plan_id;
      let planFeatures = '';
      let planName = '';

      if (planId) {
        const { data: planData } = await supabase
          .from('saas_plans')
          .select('name, features')
          .eq('id', planId)
          .single();
        if (planData) {
          planFeatures = planData.features || '';
          planName = planData.name || '';
        }
      }

      // Also fetch document/phone/email from saas_companies (filled at registration)
      const { data: saasCompFull } = await supabase
        .from('saas_companies')
        .select('document, contact_phone, contact_email, contact_name')
        .eq('id', companyId)
        .single();

      const currentData = getAppData();
      currentData.settings = { ...currentData.settings, company: {
        id: c.id, name: c.name, logo: c.logo, country: c.country,
        language: c.language, multiCurrency: c.multi_currency,
        currencyPriority: c.currency_priority, activeCurrencies: c.active_currencies,
        exchangeRates: exchangeRates || [],
        planId,
        planName,
        planFeatures,
        // From saas_companies — filled at registration
        document: c.document || saasCompFull?.document || '',
        phone: c.phone || saasCompFull?.contact_phone || '',
        email: c.email || saasCompFull?.contact_email || '',
        address: c.address || '',
      }};
      updateCache(currentData);
      notifyListeners('companies');
    }

    if (histRes.data) {
      const currentData = getAppData();
      currentData.exchangeRateHistory = histRes.data.map((h: any) => ({ date: h.date, rates: h.rates }));
      updateCache(currentData);
    }

    if (appSetRes.data && appSetRes.data.length > 0) {
      const s = appSetRes.data[0];
      const currentData = getAppData();
      currentData.settings = {
        ...currentData.settings,
        lateFees: { enabled: s.late_fee_enabled, feePercent: s.late_fee_percent, interestPerDay: s.interest_per_day },
        cobradoresEnabled: s.cobradores_enabled,
      };
      updateCache(currentData);
    }

    console.log('[Supabase] ✅ Full pull complete');
    return true;
  } catch (err) {
    console.warn('[Supabase] ❌ Pull failed:', err);
    return false;
  }
}

export async function pushToSupabase(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const companyId = await getCurrentCompanyId();
    if (!companyId) return false;
    const data = getAppData();
    for (const [localKey, table] of Object.entries(tableMap)) {
      const collection = (data as any)[localKey];
      if (!Array.isArray(collection) || collection.length === 0) continue;
      const rows = (await Promise.all(collection.map(async (item: any) => {
        let row = toSnakeCase(item);
        if (table !== 'users') delete row.password;
        row = filterForTable(table, row);
        return ensureTenantRow(table, row);
      }))).filter((row): row is Record<string, any> => !!row);
      if (rows.length > 0) await supabase.from(table).upsert(rows, { onConflict: 'id' });
    }
    await syncSettingsToSupabase(data.settings);
    return true;
  } catch (err) {
    console.warn('[Supabase] ❌ Push failed:', err);
    return false;
  }
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
}

export async function fetchClientsPaginated(page: number, limit: number, search?: string): Promise<PaginatedResult<any>> {
  const supabase = getSupabase();
  const companyId = await getCurrentCompanyId();
  if (!supabase || !companyId) return { data: [], count: 0 };

  let query = supabase.from('clients').select('*', { count: 'exact' }).eq('company_id', companyId);
  
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query.range(from, to).order('name', { ascending: true });

  if (error) {
    console.error('[Supabase] fetchClientsPaginated error', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []).map((r: any) => toCamelCase(r)), count: count || 0 };
}

export async function fetchTransactionsPaginated(
  page: number, 
  limit: number, 
  filters?: { status?: string; type?: string; month?: string; search?: string }
): Promise<PaginatedResult<any>> {
  const supabase = getSupabase();
  const companyId = await getCurrentCompanyId();
  if (!supabase || !companyId) return { data: [], count: 0 };

  let query = supabase.from('transactions').select('*', { count: 'exact' }).eq('company_id', companyId);

  if (filters?.status && filters.status !== 'todos') query = query.eq('status', filters.status);
  if (filters?.type && filters.type !== 'todos') query = query.eq('type', filters.type);
  if (filters?.search) query = query.ilike('description', `%${filters.search}%`);
  
  if (filters?.month) {
    const [year, m] = filters.month.split('-');
    const startDate = `${year}-${m}-01`;
    const nextMonth = parseInt(m) === 12 ? '01' : String(parseInt(m) + 1).padStart(2, '0');
    const nextYear = parseInt(m) === 12 ? parseInt(year) + 1 : year;
    const endDate = `${nextYear}-${nextMonth}-01`;
    query = query.gte('due_date', startDate).lt('due_date', endDate);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query.range(from, to).order('due_date', { ascending: false });

  if (error) {
    console.error('[Supabase] fetchTransactionsPaginated error', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []).map((r: any) => toCamelCase(r)), count: count || 0 };
}
