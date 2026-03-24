import { useState, useMemo } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useAuth } from '@/hooks/useAuth';
import { Transaction, Client, BankAccount } from '@/types';
import { updateData, addData, getAppData } from '@/services/storageService';
import { formatCurrency, formatDate, getStatusColor } from '@/utils/formatters';
import { useSyncToast } from '@/hooks/useSyncToast';
import { CheckCircle, Clock, CheckSquare, Square, Search, X, Loader2, Calendar, ClipboardList } from 'lucide-react';
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint';

export default function AreaCobrador() {
  const { user } = useAuth();
  const [cobradores] = useRealtimeData('cobradores');
  const [clients] = useRealtimeData('clients');
  const [transactions] = useRealtimeData('transactions');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const { showSyncResult } = useSyncToast();

  const [activeTab, setActiveTab] = useState<'cobrar' | 'fechamento'>('cobrar');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [saving, setSaving] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Fechamento stats
  const [fechamentoDate, setFechamentoDate] = useState(new Date().toISOString().split('T')[0]);

  // Find the cobrador entity for the logged in user
  const cobrador = useMemo(() => cobradores.find(c => c.userId === user?.id), [cobradores, user]);

  // Clients assigned to this cobrador
  const myClients = useMemo(() => {
    if (!cobrador) return [];
    return clients.filter(c => c.cobradorId === cobrador.id);
  }, [clients, cobrador]);

  // Filter clients by search
  const filteredClients = useMemo(() => {
    return myClients.filter(c => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.document.includes(searchQuery)) return false;
      return true;
    });
  }, [myClients, searchQuery]);

  // Transactions for selected client
  const clientTxs = useMemo(() => {
    if (!selectedClient) return [];
    return transactions
      .filter(tx => tx.clientId === selectedClient.id && tx.status !== 'pago')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [selectedClient, transactions]);

  const handleBaixa = async (tx: Transaction) => {
    if (!confirm(`Confirmar recebimento de ${formatCurrency(tx.amount, tx.currency)}?`)) return;
    
    setSaving(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      await updateData('transactions', tx.id, {
        status: 'pago',
        paidAt: date,
        cobradorId: cobrador?.id // record that this cobrador received it
      } as any);

      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: (tx.type === 'receita' || tx.type === 'investimento') ? 'baixa_recebimento' : 'baixa_pagamento',
        transactionId: tx.id,
        transactionDescription: tx.description,
        clientId: tx.clientId || '',
        clientName: selectedClient?.name || '',
        amount: tx.amount,
        currency: tx.currency,
        userId: user?.id || '',
        userName: user?.name || '',
        date: date,
        cobradorId: cobrador?.id,
        createdAt: new Date().toISOString(),
      });

      showSyncResult({ success: true, localOnly: false }, 'Baixa realizada com sucesso');
      
      setReceiptData({
        transaction: { ...tx, status: 'pago', paidAt: date, cobradorId: cobrador?.id } as Transaction,
        client: selectedClient || null,
        bankAccount: null,
        paidDate: date,
        userName: user?.name || '',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async (tx: Transaction) => {
    const newDateStr = prompt('Informe a nova data de vencimento (YYYY-MM-DD):', tx.dueDate);
    if (!newDateStr) return;
    
    // basic validation
    if (!newDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      alert('Formato de data inválido. Use YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      await updateData('transactions', tx.id, {
        dueDate: newDateStr,
        description: `${tx.description} (Reagendado por ${cobrador?.name})`
      } as any);
      showSyncResult({ success: true, localOnly: false }, 'Parcela reagendada');
    } finally {
      setSaving(false);
    }
  };

  // Fechamento da cobrança
  const fecharCobrança = () => {
    if (!cobrador) return;
    const txsHoje = transactions.filter(t => t.cobradorId === cobrador.id && t.paidAt === fechamentoDate && t.status === 'pago');
    
    const total = txsHoje.reduce((sum, tx) => sum + tx.amount, 0);
    // In real app we might send an email, create a consolidated "Fechamento" record, or just print it.
    alert(`Fechamento do dia ${formatDate(fechamentoDate)}\n\nTotal Recebido: ${formatCurrency(total, 'BRL')}\nQuantidade: ${txsHoje.length} parcelas.\n\nPreste contas com o financeiro informando este valor.`);
  };

  if (!getAppData().settings?.cobradoresEnabled) {
    return <div className="p-8 text-center bg-card rounded-lg mt-10">Módulo de cobradores está desativado.</div>;
  }

  if (!cobrador) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-card rounded-lg border border-border mt-10 max-w-md mx-auto">
        <h2 className="text-title-section font-semibold mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground text-center">Seu usuário não está vinculado a um perfil de Cobrador ativo. Contate o administrador.</p>
      </div>
    );
  }

  // Calculate stats for fechamento
  const paidTodayTxs = transactions.filter(t => t.cobradorId === cobrador.id && t.paidAt === fechamentoDate && t.status === 'pago');
  const totalPaidToday = paidTodayTxs.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">Área do Cobrador</h1>
        <p className="text-secondary font-medium px-3 py-1 bg-secondary/10 rounded-full">{cobrador.name}</p>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-border bg-card">
        <button
          onClick={() => { setActiveTab('cobrar'); setSelectedClient(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            activeTab === 'cobrar' ? 'bg-secondary/10 text-secondary border-b-2 border-secondary' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Search size={18} /> Clientes e Cobranças
        </button>
        <button
          onClick={() => setActiveTab('fechamento')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            activeTab === 'fechamento' ? 'bg-secondary/10 text-secondary border-b-2 border-secondary' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <ClipboardList size={18} /> Fechamento de Caixa
        </button>
      </div>

      {activeTab === 'cobrar' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar cliente..." className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-body-sm bg-card focus:ring-2 focus:ring-secondary outline-none transition-shadow" />
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden h-[600px] flex flex-col">
              <div className="p-3 bg-muted/50 border-b border-border font-medium text-body-sm text-muted-foreground">
                Meus Clientes ({filteredClients.length})
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredClients.map(c => {
                  const hasDue = transactions.some(t => t.clientId === c.id && t.status !== 'pago' && t.dueDate <= new Date().toISOString().split('T')[0]);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClient(c)}
                      className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between ${
                        selectedClient?.id === c.id ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-medium truncate text-sm">{c.name}</p>
                        <p className={`text-xs ${selectedClient?.id === c.id ? 'text-secondary-foreground/70' : 'text-muted-foreground'} truncate`}>
                          {c.phone || c.document}
                        </p>
                      </div>
                      {hasDue && <div className={`w-2 h-2 rounded-full shrink-0 ${selectedClient?.id === c.id ? 'bg-white' : 'bg-destructive'}`} title="Possui pendências" />}
                    </button>
                  );
                })}
                {filteredClients.length === 0 && (
                  <p className="text-center text-muted-foreground p-4 text-sm">Nenhum cliente encontrado.</p>
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            {selectedClient ? (
              <div className="bg-card rounded-lg border border-border overflow-hidden flex flex-col h-[660px]">
                <div className="p-5 border-b border-border flex justify-between items-start bg-secondary/5">
                  <div>
                    <h3 className="text-title-sm font-semibold">{selectedClient.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedClient.phone && `📱 ${selectedClient.phone}`} {selectedClient.city && `📍 ${selectedClient.city}`}</p>
                  </div>
                  <button onClick={() => setSelectedClient(null)} className="p-1 rounded-full hover:bg-black/10 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-2">
                    <Clock size={16} /> Parcelas Pendentes ({clientTxs.length})
                  </h4>

                  {clientTxs.map(tx => (
                    <div key={tx.id} className="border border-border rounded-lg p-4 hover:border-secondary/50 transition-colors bg-background">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold">{tx.description}</p>
                          <p className="text-sm text-muted-foreground">Vencimento: {formatDate(tx.dueDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-secondary">{formatCurrency(tx.amount, tx.currency)}</p>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>{tx.status}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleBaixa(tx)}
                          disabled={saving}
                          className="flex-1 inline-flex justify-center items-center gap-2 bg-success text-success-foreground py-2 px-3 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          <CheckCircle size={16} /> Receber Pago
                        </button>
                        <button
                          onClick={() => handleReschedule(tx)}
                          disabled={saving}
                          className="flex-1 inline-flex justify-center items-center gap-2 bg-warning text-warning-foreground py-2 px-3 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          <Calendar size={16} /> Reagendar
                        </button>
                      </div>
                    </div>
                  ))}

                  {clientTxs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckCircle size={48} className="text-success/50 mb-4" />
                      <p className="font-medium">Nenhuma parcela pendente!</p>
                      <p className="text-sm text-muted-foreground">O cliente está em dia.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border border-dashed h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <Search size={48} className="mb-4 opacity-20" />
                <p className="font-medium">Selecione um cliente ao lado</p>
                <p className="text-sm mt-1">Para visualizar as parcelas pendentes e registrar pagamentos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'fechamento' && (
        <div className="bg-card rounded-lg border border-border p-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-title-section font-semibold">Fechamento de Caixa</h2>
            <input 
              type="date" 
              value={fechamentoDate} 
              onChange={e => setFechamentoDate(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-success/10 rounded-xl p-5 border border-success/20">
              <p className="text-success text-sm font-medium">Total Recebido</p>
              <p className="text-2xl font-bold text-success mt-1">{formatCurrency(totalPaidToday, 'BRL')}</p>
            </div>
            <div className="bg-secondary/10 rounded-xl p-5 border border-secondary/20">
              <p className="text-secondary text-sm font-medium">Parcelas Baixadas</p>
              <p className="text-2xl font-bold text-secondary mt-1">{paidTodayTxs.length}</p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <h3 className="font-medium border-b border-border pb-2">Detalhamento ({formatDate(fechamentoDate)})</h3>
            {paidTodayTxs.map(tx => {
              const client = clients.find(c => c.id === tx.clientId);
              return (
                <div key={tx.id} className="flex justify-between items-center text-sm py-2 border-b border-border border-dashed last:border-0">
                  <div>
                    <p className="font-medium">{client?.name || 'Cliente Removido'}</p>
                    <p className="text-xs text-muted-foreground">{tx.description}</p>
                  </div>
                  <p className="font-semibold text-success">{formatCurrency(tx.amount, tx.currency)}</p>
                </div>
              );
            })}
            {paidTodayTxs.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum recebimento registrado nesta data.</p>
            )}
          </div>

          <button
            onClick={fecharCobrança}
            disabled={paidTodayTxs.length === 0}
            className="w-full bg-secondary text-secondary-foreground py-3 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
          >
            <CheckSquare size={20} /> Fechar Expediente
          </button>
        </div>
      )}

      {receiptData && (
        <ReceiptPrint
          receipt={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  );
}
