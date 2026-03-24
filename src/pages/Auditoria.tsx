import { useState, useMemo } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { AuditLog } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { useTranslation } from '@/hooks/useI18n';
import { Search, FileText, ArrowUpRight, ArrowDownRight, RotateCcw } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

const actionLabels: Record<string, { label: string; color: string; icon: typeof ArrowUpRight }> = {
  baixa_recebimento: { label: 'Recebimento', color: 'text-success', icon: ArrowUpRight },
  baixa_pagamento: { label: 'Pagamento', color: 'text-destructive', icon: ArrowDownRight },
  estorno: { label: 'Estorno', color: 'text-warning', icon: RotateCcw },
};

export default function Auditoria() {
  const [logs] = useRealtimeData('auditLogs');
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const { t } = useTranslation();

  const filtered = useMemo(() => {
    return (logs as AuditLog[])
      .filter(log => {
        if (dateFrom && log.date < dateFrom) return false;
        if (dateTo && log.date > dateTo) return false;
        if (filterAction && log.action !== filterAction) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (
            !log.transactionDescription.toLowerCase().includes(q) &&
            !(log.clientName || '').toLowerCase().includes(q) &&
            !log.userName.toLowerCase().includes(q) &&
            !(log.bankAccountName || '').toLowerCase().includes(q)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs, dateFrom, dateTo, searchQuery, filterAction]);

  const inputClass = "border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg flex items-center gap-2"><FileText size={24} /> Auditoria de Baixas</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg bg-muted/30 border border-border">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por descrição, cliente, usuário..." className={inputClass + ' pl-9 w-full'} />
        </div>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className={inputClass + ' sm:w-48'}>
          <option value="">Todas as ações</option>
          <option value="baixa_recebimento">Recebimentos</option>
          <option value="baixa_pagamento">Pagamentos</option>
          <option value="estorno">Estornos</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 card-shadow border border-border text-center">
          <p className="text-xs text-muted-foreground">Total Recebimentos</p>
          <p className="text-title-section font-bold text-success">
            {filtered.filter(l => l.action === 'baixa_recebimento').length}
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 card-shadow border border-border text-center">
          <p className="text-xs text-muted-foreground">Total Pagamentos</p>
          <p className="text-title-section font-bold text-destructive">
            {filtered.filter(l => l.action === 'baixa_pagamento').length}
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 card-shadow border border-border text-center">
          <p className="text-xs text-muted-foreground">Total Registros</p>
          <p className="text-title-section font-bold">{filtered.length}</p>
        </div>
      </div>

      {/* Log table */}
      <div className="bg-card rounded-lg card-shadow border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Data/Hora</th>
                <th className="text-left px-4 py-3 font-medium">Ação</th>
                <th className="text-left px-4 py-3 font-medium">Descrição</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="text-left px-4 py-3 font-medium">Conta</th>
                <th className="text-left px-4 py-3 font-medium">Usuário</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro de auditoria encontrado.</td></tr>
              ) : (
                filtered.map(log => {
                  const meta = actionLabels[log.action] || actionLabels.baixa_pagamento;
                  const Icon = meta.icon;
                  return (
                    <tr key={log.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium">{formatDate(log.date)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString('pt-BR')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${meta.color} bg-current/10`}>
                          <Icon size={12} /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{log.transactionDescription}</td>
                      <td className="px-4 py-3">{log.clientName || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(log.amount, log.currency)}</td>
                      <td className="px-4 py-3">{log.bankAccountName || '—'}</td>
                      <td className="px-4 py-3">{log.userName}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
