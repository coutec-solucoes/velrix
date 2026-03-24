import { useEffect, useState, useCallback } from 'react';
import { onDataChange, getData, startRealtimeSync } from '@/services/storageService';
import { AppData } from '@/types';

/**
 * Hook that auto-refreshes data when Supabase Realtime events arrive.
 * Usage: const [clients, refresh] = useRealtimeData('clients');
 */
export function useRealtimeData<K extends keyof AppData>(key: K): [AppData[K], () => void] {
  const [data, setData] = useState<AppData[K]>(() => getData(key));

  const refresh = useCallback(() => {
    setData(getData(key));
  }, [key]);

  useEffect(() => {
    // Sync current cache immediately (handles case where pull already completed)
    setData(getData(key));

    void startRealtimeSync();

    const tableMap: Record<string, string> = {
      users: 'users',
      clients: 'clients',
      transactions: 'transactions',
      contracts: 'contracts',
      categories: 'categories',
      bankAccounts: 'bank_accounts',
      cashMovements: 'cash_movements',
      auditLogs: 'audit_logs',
    };
    const table = tableMap[key as string];

    // Listen for ALL table changes — covers both realtime events and pullFromSupabase notifications
    const unsubscribe = onDataChange((changedTable) => {
      if (changedTable === table || changedTable === 'companies' || !changedTable) {
        setData(getData(key));
      }
    });

    // Also poll once after a short delay to catch any pull that completed during mount
    const timer = setTimeout(() => setData(getData(key)), 500);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [key]);

  return [data, refresh];
}
