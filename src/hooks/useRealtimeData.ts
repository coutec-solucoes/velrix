import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startRealtimeSync, getAppData, onDataChange } from '@/services/storageService';
import { AppData } from '@/types';
import { queryClient } from '@/lib/queryClient';

/**
 * Hook that auto-refreshes data when Supabase Realtime events arrive.
 * Migrated to use React Query for scalable, robust in-memory caching.
 */
export function useRealtimeData<K extends keyof AppData>(key: K): [AppData[K], () => void] {
  const { data, refetch } = useQuery({
    queryKey: ['appData', key],
    queryFn: () => getAppData()[key],
    initialData: () => getAppData()[key],
    staleTime: Infinity, // The cache is synchronously updated by storageService
  });

  const refresh = useCallback(() => {
    // Explicit refresh updates the React Query cache
    queryClient.setQueryData(['appData', key], getAppData()[key]);
    refetch();
  }, [key, refetch]);

  useEffect(() => {
    // We start the realtime sync on mount if it hasn't been started
    void startRealtimeSync();

    // Ensure React Query has the latest snapshot on mount
    refresh();

    // Minor fallback listener in case a realtime event triggers a pull but React Query misses the granular update
    const tableMap: Record<string, string> = {
      users: 'users', clients: 'clients', transactions: 'transactions',
      contracts: 'contracts', categories: 'categories',
      bankAccounts: 'bank_accounts', cashMovements: 'cash_movements', auditLogs: 'audit_logs',
    };
    const unsubscribe = onDataChange((changedTable) => {
      if (!changedTable || changedTable === tableMap[key as string] || changedTable === 'companies') {
        refresh();
      }
    });

    return unsubscribe;
  }, [key, refresh]);

  return [data as AppData[K], refresh];
}
