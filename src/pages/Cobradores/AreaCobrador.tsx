import { useState, useMemo } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useAuth } from '@/hooks/useAuth';
import { Transaction, Client, BankAccount, Currency } from '@/types';
import { updateData, addData, getAppData } from '@/services/storageService';
import { formatCurrency, formatDate, getStatusColor } from '@/utils/formatters';
import { useSyncToast } from '@/hooks/useSyncToast';
import { CheckCircle, Clock, CheckSquare, Square, Search, X, Loader2, Calendar, ClipboardList, Wallet, Landmark, CreditCard, Banknote, QrCode, Printer, ArrowUpCircle } from 'lucide-react';
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint';
import { convertAmount, conversionDescription } from '@/utils/currencyConversion';

export default function AreaCobrador() {
  const { user } = useAuth();
  const [cobradores] = useRealtimeData('cobradores');
  const [clients] = useRealtimeData('clients');
  const [transactions] = useRealtimeData('transactions');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const [cashMovements] = useRealtimeData('cashMovements');
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

  // Sangria Modal state
  const [showSangriaModal, setShowSangriaModal] = useState(false);
  const [sangriaForm, setSangriaForm] = useState({ amount: '', currency: 'BRL', description: '', bankAccountId: '' });
  const [savingSangria, setSavingSangria] = useState(false);

  // Print Ref
  const handlePrintFechamento = () => {
    window.print();
  };

  // Find the company user record by email
  const [allUsers] = useRealtimeData('users');
  const appUser = useMemo(() => allUsers.find(u => u.email === user?.email), [allUsers, user]);

  // Find the cobrador entity linked to this users.id
  const cobrador = useMemo(() => {
    // If we have an appUser, use its ID. Otherwise, fallback to the auth user.id (for legacy owners)
    const targetId = appUser?.id || user?.id;
    return cobradores.find(c => c.userId === targetId);
  }, [cobradores, appUser, user]);

  const myCaixas = useMemo(() => {
    if (!cobrador) return [];
    return bankAccounts.filter(a => a.accountType === 'caixa' && a.name.includes(cobrador.name));
  }, [bankAccounts, cobrador]);

  const handleFechamentoDefinitivo = async () => {
    if (!window.confirm("Atenção! Isso irá transferir TODO o saldo em espécie para o Caixa Principal da empresa. Você está com os valores físicos corretos para entregar?")) return;
    setSaving(true);
    try {
      const mainCaixaFallbacks = bankAccounts.filter(a => a.accountType === 'caixa' && !a.name.includes(cobrador?.name || ''));
      const date = new Date().toISOString().split('T')[0];
      
      for (const caixa of myCaixas) {
        if (caixa.currentBalance <= 0) continue;
        
        let targetMainCaixa = mainCaixaFallbacks.find(a => a.currency === caixa.currency);
        if (!targetMainCaixa) {
            targetMainCaixa = mainCaixaFallbacks[0]; // best effort se não houver da mesma moeda
        }
        if (!targetMainCaixa) {
           alert('Erro: Nenhum Caixa Financeiro da Empresa encontrado para receber o dinheiro. Fale com o Financeiro.');
           break;
        }

        const amountToTransfer = caixa.currentBalance;

        // Saída do Caixa do Cobrador
        await addData('cashMovements', {
          id: crypto.randomUUID(),
          bankAccountId: caixa.id,
          type: 'saida',
          amount: amountToTransfer,
          currency: caixa.currency,
          description: `Repasse de Fechamento de Caixa`,
          date, userId: user?.id, userName: user?.name || cobrador?.name,
          cobradorId: cobrador?.id,
          createdAt: new Date().toISOString()
        });
        await updateData('bankAccounts', caixa.id, { currentBalance: 0 } as any);

        // Entrada no Caixa Principal
        const conv = convertAmount(amountToTransfer, caixa.currency, targetMainCaixa.currency);
        await addData('cashMovements', {
          id: crypto.randomUUID(),
          bankAccountId: targetMainCaixa.id,
          type: 'entrada',
          amount: conv.convertedAmount,
          currency: targetMainCaixa.currency,
          description: `Recebimento Ref. Fechamento: ${cobrador?.name}`,
          date, userId: user?.id, userName: user?.name,
          createdAt: new Date().toISOString()
        });
        await updateData('bankAccounts', targetMainCaixa.id, { currentBalance: targetMainCaixa.currentBalance + conv.convertedAmount } as any);
        
        // Log do Fechamento
        await addData('auditLogs', {
          id: crypto.randomUUID(),
          action: 'fechamento_caixa',
          transactionDescription: `Definitivo de: ${caixa.name} para ${targetMainCaixa.name}`,
          amount: amountToTransfer,
          currency: caixa.currency,
          bankAccountId: caixa.id,
          bankAccountName: caixa.name,
          userId: user?.id || '',
          userName: user?.name || '',
          date,
          cobradorId: cobrador?.id,
          createdAt: new Date().toISOString(),
        });
      }
      showSyncResult({ success: true, localOnly: false }, 'Caixas físicos esvaziados e dinheiro repassado!');
    } finally { setSaving(false); }
  };

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
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [selectedClient, transactions]);

  const handleBaixaClick = (tx: Transaction) => {
    setBaixaTx(tx);
    setPaymentMethod('dinheiro');
    // Default to the cobrador's specific caixa if found, based on original currency
    const cobradorCaixa = bankAccounts.find(a => a.accountType === 'caixa' && a.name.includes(cobrador?.name || '') && a.currency === tx.currency);
    const fallbackCaixa = bankAccounts.find(a => a.accountType === 'caixa');
    
    if (cobradorCaixa) {
      setBankAccountId(cobradorCaixa.id);
    } else if (fallbackCaixa) {
      setBankAccountId(fallbackCaixa.id);
    } else {
      setBankAccountId('');
    }
    setShowBaixaModal(true);
  };

  const handleSangriaClick = () => {
    // Default to cobrador's caixa for PYG or BRL
    const fallbackCaixa = bankAccounts.find(a => a.accountType === 'caixa' && a.name.includes(cobrador?.name || ''));
    setSangriaForm({ amount: '', currency: fallbackCaixa?.currency || 'BRL', description: '', bankAccountId: fallbackCaixa?.id || '' });
    setShowSangriaModal(true);
  };

  const confirmSangria = async () => {
    if (!sangriaForm.amount || !sangriaForm.description || !sangriaForm.bankAccountId) return;
    setSavingSangria(true);
    try {
      const selectedAccount = bankAccounts.find(a => a.id === sangriaForm.bankAccountId);
      if (!selectedAccount) return;
      
      const numAmount = parseFloat(sangriaForm.amount);
      const date = new Date().toISOString().split('T')[0];
      
      const txId = crypto.randomUUID();

      // 1. Create a formal transaction of type 'despesa' so it shows up in Financial Reports
      await addData('transactions', {
        id: txId,
        type: 'despesa',
        description: `Sangria/Despesa na Rua: ${sangriaForm.description}`,
        amount: numAmount,
        currency: selectedAccount.currency,
        category: 'Despesa de Cobrador',
        dueDate: date,
        status: 'pago',
        paidAt: date,
        paymentMethod: 'dinheiro', // Sangrias from cobrador are usually cash
        bankAccountId: selectedAccount.id,
        cobradorId: cobrador?.id,
        userId: user?.id,
        createdAt: new Date().toISOString(),
      });

      // 2. Add the cash movement representing the physical money leaving the backpack
      await addData('cashMovements', {
        id: crypto.randomUUID(),
        transactionId: txId,
        bankAccountId: selectedAccount.id,
        type: 'saida',
        amount: numAmount,
        currency: selectedAccount.currency,
        description: `Sangria: ${sangriaForm.description}`,
        date: date,
        userId: user?.id,
        userName: user?.name || cobrador?.name,
        cobradorId: cobrador?.id,
        createdAt: new Date().toISOString(),
      });
      
      // 3. Update the cobrador's specific physical account balance
      await updateData('bankAccounts', selectedAccount.id, { currentBalance: selectedAccount.currentBalance - numAmount } as any);
      
      // 4. Log the action
      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: 'despesa',
        transactionId: txId,
        transactionDescription: `Sangria: ${sangriaForm.description}`,
        amount: numAmount,
        currency: selectedAccount.currency,
        bankAccountId: selectedAccount.id,
        bankAccountName: selectedAccount.name,
        userId: user?.id || '',
        userName: user?.name || '',
        date: date,
        cobradorId: cobrador?.id,
        createdAt: new Date().toISOString(),
      });

      showSyncResult({ success: true, localOnly: false }, 'Sangria registrada com sucesso');
      setShowSangriaModal(false);
    } finally {
      setSavingSangria(false);
    }
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
          cobradorId: cobrador?.id,
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

  // Hooks must be called unconditionally
  const paidTodayTxs = useMemo(() => {
    if (!cobrador) return [];
    return transactions.filter(t => {
      if (t.cobradorId !== cobrador.id || t.status !== 'pago' || !t.paidAt) return false;
      const txPaidDate = t.paidAt.split('T')[0];
      return txPaidDate === fechamentoDate;
    });
  }, [transactions, cobrador, fechamentoDate]);
  
  const todaysSangrias = useMemo(() => {
    if (!cobrador) return [];
    return cashMovements.filter(m => {
      if (m.type !== 'saida') return false;
      // Filter by the description we use for sangrias OR by the user's name just in case
      const isSangria = (m.description?.toLowerCase()?.includes('sangria') || m.description?.toLowerCase()?.includes('despesa'));
      const txDate = m.date?.split('T')[0] || m.createdAt.split('T')[0];
      return isSangria && txDate === fechamentoDate && (m.cobradorId === cobrador.id || m.userName === (user?.name || cobrador.name));
    });
  }, [cashMovements, cobrador, fechamentoDate, user]);
  
  const totalPaidToday = useMemo(() => {
    return paidTodayTxs.reduce((sum, tx) => sum + tx.amount, 0);
  }, [paidTodayTxs]);

  const groupedSangrias = useMemo(() => {
    const totals: Record<string, number> = {};
    todaysSangrias.forEach(s => {
      totals[s.currency] = (totals[s.currency] || 0) + s.amount;
    });
    return totals;
  }, [todaysSangrias]);

  // Group by Method / Currency / BankAccount for specific reporting
  const groupedCash = useMemo(() => {
    const cash: Record<string, number> = {};
    const pix: Record<string, number> = {};
    const cards: Record<string, number> = {};
    const deposits: Record<string, number> = {};

    paidTodayTxs.forEach(tx => {
      const method = tx.paymentMethod || 'dinheiro';
      const accId = tx.bankAccountId || 'n/a';

      if (method === 'dinheiro') {
        const key = tx.currency;
        cash[key] = (cash[key] || 0) + tx.amount;
      } else if (method === 'cartao_credito' || method === 'cartao_debito') {
        cards[accId] = (cards[accId] || 0) + tx.amount;
      } else if (method === 'pix') {
        pix[accId] = (pix[accId] || 0) + tx.amount;
      } else {
        deposits[accId] = (deposits[accId] || 0) + tx.amount;
      }
    });

    return { cash, pix, cards, deposits };
  }, [paidTodayTxs]);

  const paymentMethodLabel = (method?: string) => {
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'pix') return 'PIX';
    if (method === 'transferencia_bancaria') return 'Transferência';
    if (method === 'cartao_credito') return 'Cartão de Crédito';
    if (method === 'cartao_debito') return 'Cartão de Débito';
    return method || 'Dinheiro';
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

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">Área do Cobrador</h1>
        <div className="flex items-center gap-3">
          <p className="text-secondary font-medium px-3 py-1 bg-secondary/10 rounded-full">{cobrador.name}</p>
          <button onClick={handleSangriaClick} className="px-3 py-1 bg-warning/10 text-warning rounded-full font-medium text-sm flex items-center gap-1 hover:bg-warning/20 transition-colors">
            <Wallet size={14} /> Sangria / Despesas
          </button>
        </div>
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
            <h1 className="text-xl font-bold uppercase">{getAppData().settings?.company?.name || 'Prestação de Contas'}</h1>
            <p className="text-sm">Cobrador: {cobrador.name}</p>
            <p className="text-sm">Data: {formatDate(fechamentoDate)}</p>
          </div>

          <div className="mb-6 pb-2">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Banknote size={18} /> Resumo Físico e Conciliação</h3>
            
            {(() => {
              const cashCurrencies = Array.from(new Set([
                ...Object.keys(groupedCash.cash),
                ...Object.keys(groupedSangrias),
                ...myCaixas.map(c => c.currency)
              ]));
              
              if (cashCurrencies.length === 0) {
                return (
                  <div className="bg-card rounded-lg p-6 border border-border border-dashed text-center mb-6">
                    <p className="text-sm font-medium text-muted-foreground">Nenhuma movimentação física registrada ou caixas habilitados.</p>
                  </div>
                );
              }
              
              return cashCurrencies.map(currency => {
                const txs = paidTodayTxs.filter(t => (t.paymentMethod || 'dinheiro') === 'dinheiro' && t.currency === currency);
                const sangrias = todaysSangrias.filter(s => s.currency === currency);
                const totalArrecadado = groupedCash.cash[currency] || 0;
                const totalSangrias = groupedSangrias[currency] || 0;
                const caixa = myCaixas.find(c => c.currency === currency);
                
                return (
                  <div key={currency} className="mb-6 rounded-xl border border-border overflow-hidden card-shadow print:shadow-none print:border-black">
                    <div className="bg-muted p-4 border-b border-border flex flex-col md:flex-row items-center justify-between gap-4 print:bg-transparent">
                      <h4 className="font-bold text-lg flex items-center gap-2 uppercase tracking-wide">
                        <Banknote className="text-success print:text-black" /> {currency} (Em Espécie)
                      </h4>
                      <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-sm font-medium">
                        <div className="text-center px-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 print:text-black">Recebido (Bruto)</p>
                          <p className="text-success font-bold print:text-black">{formatCurrency(totalArrecadado, currency as Currency)}</p>
                        </div>
                        <div className="text-center px-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 print:text-black">Despesas</p>
                          <p className="text-destructive font-bold print:text-black">-{formatCurrency(totalSangrias, currency as Currency)}</p>
                        </div>
                        <div className="text-center bg-card rounded-lg px-4 py-1.5 shadow-sm border border-border/50 print:bg-transparent print:border-black">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 print:text-black">Líquido a Entregar</p>
                          <p className="text-lg font-black text-foreground print:text-black">{formatCurrency(caixa?.currentBalance || 0, currency as Currency)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 bg-card print:bg-transparent">
                       <div>
                          <h5 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2 border-b border-border/40 pb-2 print:text-black print:border-black"><CheckCircle size={14} className="text-success print:text-black"/> Lista de Recebimentos</h5>
                          {txs.length === 0 ? <p className="text-xs text-muted-foreground italic print:text-black">Nenhum recebimento.</p> : (
                             <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar print:max-h-none print:overflow-visible">
                               {txs.map(t => (
                                  <li key={t.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-1.5 hover:bg-muted/30 transition-colors print:border-black">
                                    <span className="truncate pr-2 font-medium print:text-black" title={t.description || t.clientName || 'Cobrança'}>
                                      {t.clientName || 'Cliente'} {t.installments > 1 ? `(${t.currentInstallment}/${t.installments})` : ''}
                                    </span>
                                    <span className="font-bold text-success tabular-nums print:text-black">{formatCurrency(t.amount, currency as Currency)}</span>
                                  </li>
                               ))}
                             </ul>
                          )}
                       </div>
                       
                       <div>
                          <h5 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2 border-b border-border/40 pb-2 print:text-black print:border-black"><ArrowUpCircle size={14} className="text-destructive print:text-black"/> Lista de Sangrias e Despesas</h5>
                          {sangrias.length === 0 ? <p className="text-xs text-muted-foreground italic print:text-black">Nenhuma despesa declarada.</p> : (
                             <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar print:max-h-none print:overflow-visible">
                               {sangrias.map(s => (
                                  <li key={s.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-1.5 hover:bg-muted/30 transition-colors print:border-black">
                                    <span className="truncate pr-2 font-medium print:text-black" title={s.description || 'Despesa/Sangria'}>{s.description || 'Despesa'}</span>
                                    <span className="font-bold text-destructive tabular-nums print:text-black">-{formatCurrency(s.amount, currency as Currency)}</span>
                                  </li>
                               ))}
                             </ul>
                          )}
                       </div>
                    </div>
                  </div>
                );
              });
            })()}

            {myCaixas.length === 0 && (
              <div className="mb-6 p-4 border border-dashed rounded-lg bg-muted/30 text-center">
                <p className="text-muted-foreground text-sm">Você não possui um "Caixa Físico" habilitado em seu nome para nenhuma moeda. Solicite ao administrador.</p>
              </div>
            )}
            {myCaixas.some(c => c.currentBalance > 0) && (
              <button 
                onClick={handleFechamentoDefinitivo}
                disabled={saving}
                className="w-full mb-2 bg-success text-success-foreground font-bold py-3.5 rounded-xl card-shadow hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 print:hidden"
              >
                <CheckCircle size={20} /> Entregar Valores (Esvaziar Caixas e Repassar)
              </button>
            )}
          </div>

          <div className="mb-6 border-b border-border pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-md mb-3 flex items-center gap-2"><QrCode size={16} /> Recebimentos em PIX</h3>
              <div className="space-y-2">
                {Object.entries(groupedCash.pix).map(([accId, amount]) => {
                  const acc = bankAccounts.find(a => a.id === accId);
                  return (
                    <div key={accId} className="flex justify-between items-center bg-card rounded-lg p-3 border border-border">
                      <p className="font-medium text-xs">{acc?.name || 'Conta não identificada'}</p>
                      <p className="font-bold text-sm">{formatCurrency(amount, (acc?.currency as Currency) || 'BRL')}</p>
                    </div>
                  );
                })}
                {Object.keys(groupedCash.pix).length === 0 && (
                  <p className="text-muted-foreground text-xs py-2 italic">Nenhum recebimento em PIX hoje.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-md mb-3 flex items-center gap-2"><Landmark size={16} /> Depósito / Transferência Bancária</h3>
              <div className="space-y-2">
                {Object.entries(groupedCash.deposits).map(([accId, amount]) => {
                  const acc = bankAccounts.find(a => a.id === accId);
                  return (
                    <div key={accId} className="flex justify-between items-center bg-card rounded-lg p-3 border border-border">
                      <p className="font-medium text-xs">{acc?.name || 'Conta não identificada'}</p>
                      <p className="font-bold text-sm">{formatCurrency(amount, (acc?.currency as Currency) || 'BRL')}</p>
                    </div>
                  );
                })}
                {Object.keys(groupedCash.deposits).length === 0 && (
                  <p className="text-muted-foreground text-xs py-2 italic">Nenhum depósito bancário hoje.</p>
                )}
              </div>
            </div>
          </div>

          {Object.keys(groupedCash.cards).length > 0 && (
            <div className="mb-6 border-b border-border pb-6">
              <h3 className="font-semibold text-md mb-3 flex items-center gap-2"><CreditCard size={16} /> Cartões</h3>
              <div className="space-y-2">
                {Object.entries(groupedCash.cards).map(([accId, amount]) => {
                  const acc = bankAccounts.find(a => a.id === accId);
                  return (
                    <div key={accId} className="flex justify-between items-center bg-card rounded-lg p-3 border border-border">
                      <p className="font-medium text-xs">{acc?.name || 'Conta não identificada'}</p>
                      <p className="font-bold text-sm">{formatCurrency(amount, (acc?.currency as Currency) || 'BRL')}</p>
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

          <div className="space-y-4 mb-8">
            <h3 className="font-medium border-b border-border pb-2 text-lg">Sangrias e Despesas Realizadas</h3>
            {todaysSangrias.map(m => {
              const accName = bankAccounts.find(a => a.id === m.bankAccountId)?.name || 'Caixa Físico';
              return (
                <div key={m.id} className="flex justify-between items-center text-sm py-2 border-b border-border border-dashed last:border-0">
                  <div>
                    <p className="font-medium">{m.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{accName}</p>
                  </div>
                  <p className="font-semibold text-warning">-{formatCurrency(m.amount, m.currency)}</p>
                </div>
              );
            })}
            {todaysSangrias.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4 border border-border border-dashed rounded-lg">Nenhuma sangria registrada nesta data.</p>
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
                  {bankAccounts
                    .filter(a => paymentMethod === 'dinheiro' ? myCaixas.some(mc => mc.id === a.id) : a.accountType !== 'caixa')
                    .map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.currency}</option>
                  ))}
                </select>
                {paymentMethod === 'dinheiro' && bankAccounts.some(a => a.accountType === 'caixa') && (
                  <p className="text-xs text-muted-foreground mt-1">Sugerido: Conta classificada como Caixa Físico.</p>
                )}
                
                {/* Live Currency Conversion Warning */}
                {bankAccountId && bankAccounts.find(a => a.id === bankAccountId)?.currency !== baixaTx.currency && (
                  <div className="mt-3 p-3 bg-warning/10 border border-warning/20 rounded-lg flex flex-col items-center">
                    <p className="text-xs text-muted-foreground mb-1 uppercase font-semibold text-warning">A conversão será aplicada na baixa</p>
                    <p className="text-lg font-bold text-warning">
                      {formatCurrency(
                        convertAmount(baixaTx.amount, baixaTx.currency, bankAccounts.find(a => a.id === bankAccountId)!.currency).convertedAmount,
                        bankAccounts.find(a => a.id === bankAccountId)!.currency as any
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">Baseado no câmbio configurado no sistema</p>
                  </div>
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

      {showSangriaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in print:hidden">
          <div className="bg-card w-full max-w-md rounded-xl card-shadow border border-border animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-title-sm font-bold flex items-center gap-2"><Wallet size={20} className="text-warning"/> Registrar Sangria</h2>
              <button onClick={() => setShowSangriaModal(false)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors hover:bg-accent rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-foreground">Retirar deste Caixa Físico</label>
                <select 
                  value={sangriaForm.bankAccountId} 
                  onChange={(e) => setSangriaForm({...sangriaForm, bankAccountId: e.target.value})}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none transition-colors"
                >
                  <option value="" disabled>Selecione a conta...</option>
                  {bankAccounts.filter(a => a.accountType === 'caixa' && a.name.includes(cobrador.name)).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.currency}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Valor da Despesa</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    {bankAccounts.find(a => a.id === sangriaForm.bankAccountId)?.currency || 'BRL'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={sangriaForm.amount}
                    onChange={(e) => setSangriaForm({...sangriaForm, amount: e.target.value})}
                    className="w-full border border-border rounded-lg pl-12 pr-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Motivo (ex: Gasolina, Almoço)</label>
                <input
                  type="text"
                  placeholder="Descreva a finalidade desta sangria"
                  value={sangriaForm.description}
                  onChange={(e) => setSangriaForm({...sangriaForm, description: e.target.value})}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none transition-colors"
                />
              </div>

            </div>
            <div className="flex gap-2 p-4 border-t border-border bg-muted/30">
              <button 
                type="button" 
                onClick={() => setShowSangriaModal(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={confirmSangria}
                disabled={savingSangria || !sangriaForm.amount || !sangriaForm.description || !sangriaForm.bankAccountId}
                className="flex-1 px-4 py-2 bg-warning text-warning-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingSangria ? 'Registrando...' : 'Confirmar Sangria'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
