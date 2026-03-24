import { useToast } from '@/hooks/use-toast';
import { SyncResult } from '@/services/storageService';

export function useSyncToast() {
  const { toast } = useToast();

  const showSyncResult = (result: SyncResult, successMsg?: string) => {
    if (result.success) {
      toast({
        title: '✅ Salvo com sucesso',
        description: successMsg || 'Dados salvos no servidor.',
      });
    } else if (result.localOnly) {
      toast({
        variant: 'destructive',
        title: '⚠️ Salvo apenas localmente',
        description: result.error
          ? `Falha na sincronização: ${result.error}. Os dados serão sincronizados quando possível.`
          : 'Sem conexão com o servidor. Os dados foram salvos localmente.',
      });
    }
  };

  return { showSyncResult };
}
