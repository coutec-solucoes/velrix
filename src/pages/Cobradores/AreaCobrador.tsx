import { useState, useMemo } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useAuth } from '@/hooks/useAuth';
import { Transaction, Client, BankAccount } from '@/types';
import { updateData, addData, getAppData } from '@/services/storageService';
import { formatCurrency, formatDate, getStatusColor } from '@/utils/formatters';
import { useSyncToast } from '@/hooks/useSyncToast';
import { CheckCircle, Clock, CheckSquare, Square, Search, X, Loader2, Calendar, ClipboardList, Wallet, Landmark, CreditCard, Banknote, QrCode, Printer } from 'lucide-react';
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint';
import { convertAmount, conversionDescription } from '@/utils/currencyConversion';

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

  // Baixa Modal state
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [baixaTx, setBaixaTx] = useState<Transaction | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [bankAccountId, setBankAccountId] = useState('');

  // Print Ref
  const handlePrintFechamento = () => {
    window.print();
  };

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

  const handleBaixaClick = (tx: Transaction) => {
    setBaixaTx(tx);
    setPaymentMethod('dinheiro');
    // Default to a bank account of type 'caixa' if found
    const caixaAccount = bankAccounts.find(a => a.accountType === 'caixa');
    if (caixaAccount) {
      setBankAccountId(caixaAccount.id);
    } else {
      setBankAccountId('');
    }
    setShowBaixaModal(true);
  };

  const confirmBaixa = async () => {
    if (!baixaTx) return;
    setSaving(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      await updateData('transactions', baixaTx.id, {
        status: 'pago',
        paidAt: date,
        paymentMethod: paymentMethod,
        bankAccountId: bankAccountId || undefined,
        cobradorId: cobrador?.id
      } as any);

      if (bankAccountId) {
        const acc = bankAccounts.find(a => a.id === bankAccountId);
        const movType = (baixaTx.type === 'receita' || baixaTx.type === 'investimento') ? 'entrada' : 'saida';
        const conv = acc ? convertAmount(baixaTx.amount, baixaTx.currency, acc.currency) : null;
        const movAmount = conv ? conv.convertedAmount : baixaTx.amount;
        const movCurrency = acc ? acc.currency : baixaTx.currency;
        const convDesc = conv && conv.wasConverted ? conversionDescription(conv) : '';

        await addData('cashMovements', {
          id: crypto.randomUUID(),
          transactionId: baixaTx.id,
          bankAccountId: bankAccountId,
          type: movType,
          amount: movAmount,
          currency: movCurrency,
          description: `Baixa (Cobrador): ${baixaTx.description}${convDesc}`,
          date: date,
          userId: user?.id,
          userName: user?.name || cobrador?.name,
          createdAt: new Date().toISOString(),
        });
        if (acc) {
          const delta = movType === 'entrada' ? movAmount : -movAmount;
          await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + delta } as any);
        }
      }

      const acc = bankAccounts.find(a => a.id === bankAccountId);
      const auditConv = acc ? convertAmount(baixaTx.amount, baixaTx.currency, acc.currency) : null;

      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: (baixaTx.type === 'receita' || baixaTx.type === 'investimento') ? 'baixa_recebimento' : 'baixa_pagamento',
        transactionId: baixaTx.id,
        transactionDescription: baixaTx.description + (auditConv?.wasConverted ? conversionDescription(auditConv) : ''),
        clientId: baixaTx.clientId || '',
        clientName: selectedClient?.name || '',
        amount: baixaTx.amount,
        currency: baixaTx.currency,
        bankAccountId: bankAccountId || '',
        bankAccountName: acc?.name || '',
        userId: user?.id || '',
        userName: user?.name || '',
        date: date,
        cobradorId: cobrador?.id,
        createdAt: new Date().toISOString(),
      });

      showSyncResult({ success: true, localOnly: false }, 'Baixa realizada com sucesso');
      
      setReceiptData({
        transaction: { ...baixaTx, status: 'pago', paidAt: date, cobradorId: cobrador?.id, paymentMethod, bankAccountId } as Transaction,
        client: selectedClient || null,
        bankAccount: acc || null,
        paidDate: date,
        userName: user?.name || cobrador?.name || '',
      });
      setShowBaixaModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async (tx: Transaction) => {
    const newDateStr = prompt('Informe a nova data de vencimento (YYYY-MM-DD):', tx.dueDate);
    if (!newDateStr) return;
    
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

  const fecharCobrança = () => {
    handlePrintFechamento();
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

  // Group by Method / Currency / BankAccount for specific reporting
  const groupedCash = useMemo(() => {
    const cash: Record<string, number> = {};
    const pix: Record<string, number> = {};
    const cards: Record<string, number> = {};

    paidTodayTxs.forEach(tx => {
      const method = tx.paymentMethod || 'dinheiro';
      const isDinheiro = method === 'dinheiro';
      const isCard = method === 'cartao_credito' || method === 'cartao_debito';

      if (isDinheiro) {
        const key = tx.currency;
        cash[key] = (cash[key] || 0) + tx.amount;
      } else if (isCard) {
        const accId = tx.bankAccountId || 'n/a';
        cards[accId] = (cards[accId] || 0) + tx.amount;
      } else {
        const accId = tx.bankAccountId || 'n/a';
        pix[accId] = (pix[accId] || 0) + tx.amount;
      }
    });

    return { cash, pix, cards };
  }, [paidTodayTxs]);

  const paymentMethodLabel = (method?: string) => {
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'pix') return 'PIX';
    if (method === 'transferencia_bancaria') return 'Transferência';
    if (method === 'cartao_credito') return 'Cartão de Crédito';
    if (method === 'cartao_debito') return 'Cartão de Débito';
    return method || 'Dinheiro';
  };

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
                          onClick={() => handleBaixaClick(tx)}
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
        <div className="bg-card rounded-lg border border-border p-6 max-w-2xl mx-auto print:shadow-none print:border-none print:p-0">
          <div className="flex items-center justify-between mb-6 print:hidden">
            <h2 className="text-title-section font-semibold">Fechamento de Caixa</h2>
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={fechamentoDate} 
                onChange={e => setFechamentoDate(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
              />
              <button
                onClick={handlePrintFechamento}
                disabled={paidTodayTxs.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-body-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
                title="Imprimir Fechamento"
              >
                <Printer size={16} /> <span className="hidden sm:inline">Imprimir</span>
              </button>
            </div>
          </div>

          <div className="hidden print:block text-center mb-6">
            <h1 className="text-xl font-bold uppercase">{getAppData().settings?.companyName || 'Prestação de Contas'}</h1>
            <p className="text-sm">Cobrador: {cobrador.name}</p>
            <p className="text-sm">Data: {formatDate(fechamentoDate)}</p>
          </div>

          <div className="mb-6 border-b border-border pb-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Banknote size={18} /> Resumo Físico (Dinheiro em Espécie)</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(groupedCash.cash).map(([currency, amount]) => (
                <div key={currency} className="bg-card rounded-lg p-4 border border-border card-shadow align-middle">
                  <p className="text-sm text-muted-foreground font-medium uppercase">{currency}</p>
                  <p className="text-xl font-bold">{formatCurrency(amount, currency as any)}</p>
                </div>
              ))}
              {Object.keys(groupedCash.cash).length === 0 && (
                <p className="text-muted-foreground text-sm py-2 col-span-2">Nenhum recebimento em Dinheiro hoje.</p>
              )}
            </div>
          </div>

          <div className="mb-6 border-b border-border pb-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><QrCode size={18} /> PIX e Bancos Diferidos</h3>
            <div className="space-y-3">
              {Object.entries(groupedCash.pix).map(([accId, amount]) => {
                const acc = bankAccounts.find(a => a.id === accId);
                return (
                  <div key={accId} className="flex justify-between items-center bg-card rounded-lg p-3 border border-border">
                    <p className="font-medium text-sm">{acc?.name || 'Conta não identificada'}</p>
                    <p className="font-bold">{formatCurrency(amount, acc?.currency || 'BRL')}</p>
                  </div>
                );
              })}
              {Object.keys(groupedCash.pix).length === 0 && (
                <p className="text-muted-foreground text-sm py-2">Nenhum recebimento via digital hoje.</p>
              )}
            </div>
          </div>

          {Object.keys(groupedCash.cards).length > 0 && (
            <div className="mb-6 border-b border-border pb-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><CreditCard size={18} /> Cartões</h3>
              <div className="space-y-3">
                {Object.entries(groupedCash.cards).map(([accId, amount]) => {
                  const acc = bankAccounts.find(a => a.id === accId);
                  return (
                    <div key={accId} className="flex justify-between items-center bg-card rounded-lg p-3 border border-border">
                      <p className="font-medium text-sm">{acc?.name || 'Conta não identificada'}</p>
                      <p className="font-bold">{formatCurrency(amount, acc?.currency || 'BRL')}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4 mb-8">
            <h3 className="font-medium border-b border-border pb-2 text-lg">Detalhamento das Parcelas</h3>
            {paidTodayTxs.map(tx => {
              const client = clients.find(c => c.id === tx.clientId);
              return (
                <div key={tx.id} className="flex justify-between items-center text-sm py-2 border-b border-border border-dashed last:border-0">
                  <div>
                    <p className="font-medium">{client?.name || 'Cliente Removido'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-muted-foreground">{tx.description}</p>
                      <span className="text-[10px] font-semibold bg-secondary/10 text-secondary px-1.5 py-0.5 rounded-full uppercase">
                        {paymentMethodLabel(tx.paymentMethod)}
                      </span>
                    </div>
                  </div>
                  <p className="font-semibold text-success">{formatCurrency(tx.amount, tx.currency)}</p>
                </div>
              );
            })}
            {paidTodayTxs.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4 border border-border border-dashed rounded-lg">Nenhum recebimento registrado nesta data.</p>
            )}
          </div>

          <div className="hidden print:block mt-12 pt-12 border-t border-border border-dashed text-center">
            <div className="w-64 mx-auto border-b border-black mb-2"></div>
            <p className="text-sm font-medium">Assinatura do Cobrador ({cobrador.name})</p>
          </div>
        </div>
      )}

      {receiptData && (
        <ReceiptPrint
          receipt={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}

      {showBaixaModal && baixaTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in print:hidden">
          <div className="bg-card w-full max-w-md rounded-xl card-shadow border border-border animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-title-sm font-bold">Confirmar Pagamento</h2>
              <button onClick={() => setShowBaixaModal(false)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors hover:bg-accent rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="p-4 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm font-medium mb-1">{selectedClient?.name}</p>
                <div className="flex justify-between items-center">
                  <p className="text-muted-foreground text-sm">{baixaTx.description}</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(baixaTx.amount, baixaTx.currency)}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Forma de Pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('dinheiro')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${
                      paymentMethod === 'dinheiro' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Banknote size={20} className="mb-1" />
                    <span className="text-xs font-semibold">Dinheiro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${
                      paymentMethod === 'pix' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <QrCode size={20} className="mb-1" />
                    <span className="text-xs font-semibold">PIX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cartao_credito')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${
                      paymentMethod === 'cartao_credito' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <CreditCard size={20} className="mb-1" />
                    <span className="text-xs font-semibold">Cartão Cr.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transferencia_bancaria')}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${
                      paymentMethod === 'transferencia_bancaria' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Landmark size={20} className="mb-1" />
                    <span className="text-xs font-semibold">Bancário</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Recebido em (Conta) <span className="text-destructive">*</span>
                </label>
                <select 
                  value={bankAccountId} 
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none transition-colors"
                >
                  <option value="" disabled>Selecione a conta destino...</option>
                  {bankAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.currency}</option>
                  ))}
                </select>
                {paymentMethod === 'dinheiro' && bankAccounts.some(a => a.accountType === 'caixa') && (
                  <p className="text-xs text-muted-foreground mt-1">Sugerido: Conta classificada como Caixa Físico.</p>
                )}
              </div>
            </div>
            
            <div className="flex gap-2 p-4 border-t border-border bg-muted/30">
              <button 
                type="button" 
                onClick={() => setShowBaixaModal(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={confirmBaixa}
                disabled={saving || !bankAccountId}
                className="flex-1 px-4 py-2 bg-success text-success-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Confirmando...' : 'Confirmar e Receber'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
