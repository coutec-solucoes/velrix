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
  const [showFechamentoModal, setShowFechamentoModal] = useState(false);
  const [fechamentoDestinations, setFechamentoDestinations] = useState<Record<string, string>>({});

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
    
    // Filtra parcelas pagas pelo cobrador em ESPÉCIE que não foram repassadas ao banco da matriz
    const txAbertas = transactions.filter(tx => 
      tx.status === 'pago' && 
      tx.cobradorId === cobrador.id && 
      !tx.fechamentoId && 
      tx.paymentMethod === 'dinheiro'
    );

    const saldosPorMoeda: Record<string, number> = {};
    txAbertas.forEach(tx => {
      if (!saldosPorMoeda[tx.currency]) saldosPorMoeda[tx.currency] = 0;
      if (tx.type === 'receita' || tx.type === 'investimento') saldosPorMoeda[tx.currency] += tx.amount;
      else if (tx.type === 'despesa' || tx.type === 'retirada') saldosPorMoeda[tx.currency] -= tx.amount;
    });

    return Object.entries(saldosPorMoeda).map(([currency, balance]) => ({
      id: `mochila-${currency}`,
      name: `Mochila ${cobrador.name} - ${currency}`,
      currency: currency as Currency,
      currentBalance: balance,
      txs: txAbertas.filter(t => t.currency === currency)
    }));
  }, [transactions, cobrador]);

  const companyAccounts = useMemo(() => {
    return bankAccounts.filter(a => !cobradores.some(c => a.name.includes(c.name) && a.accountType === 'caixa'));
  }, [bankAccounts, cobradores]);

  const activeCaixas = useMemo(() => myCaixas.filter(c => c.currentBalance > 0), [myCaixas]);

  const openFechamentoModal = () => {
    if (activeCaixas.length === 0) {
      alert("Suas mochilas já estão esvaziadas (saldo 0,00). Não há dinheiro físico para fechar no sistema.");
      return;
    }
    const initialDestinations: Record<string, string> = {};
    activeCaixas.forEach(caixa => {
      const fallback = companyAccounts.find(a => a.currency === caixa.currency)?.id || companyAccounts[0]?.id || '';
      initialDestinations[caixa.id] = fallback;
    });
    setFechamentoDestinations(initialDestinations);
    setShowFechamentoModal(true);
  };

  const confirmFechamentoSubmit = async () => {
    for (const caixa of activeCaixas) {
      if (!fechamentoDestinations[caixa.id]) {
         alert(`Selecione uma conta de destino para a mochila ${caixa.name}`);
         return;
      }
    }

    if (!window.confirm("Atenção! Isso irá transferir TODO o saldo em espécie do Lote de hoje para as contas selecionadas. Confirmar fechamento?")) return;
    setSaving(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const loteId = crypto.randomUUID();
      
      for (const caixa of activeCaixas) {
        const destAccountId = fechamentoDestinations[caixa.id];
        const targetMainCaixa = bankAccounts.find(a => a.id === destAccountId);
        
        if (!targetMainCaixa) continue;

        const amountToTransfer = caixa.currentBalance;
        const conv = convertAmount(amountToTransfer, caixa.currency, targetMainCaixa.currency);

        // 1. Marca todas as transações da mochila desta moeda como "Fechadas" nesse lote
        const txIds = caixa.txs.map((t: any) => t.id);
        for (const tid of txIds) {
          await updateData('transactions', tid, { fechamentoId: loteId } as any);
        }

        // 2. Cria UM movimento de Entrada no Caixa da Empresa (O Dinheiro Vivo finalmente caiu na conta!)
        await addData('cashMovements', {
          id: crypto.randomUUID(),
          bankAccountId: targetMainCaixa.id,
          type: 'entrada',
          amount: conv.convertedAmount,
          currency: targetMainCaixa.currency,
          description: `Repasse Dinheiro Fisico: Lote ${loteId.substring(0,6)}`,
          date, userId: user?.id, userName: user?.name || cobrador?.name,
          cobradorId: cobrador?.id,
          createdAt: new Date().toISOString()
        });
        await updateData('bankAccounts', targetMainCaixa.id, { currentBalance: targetMainCaixa.currentBalance + conv.convertedAmount } as any);
        
        // 3. Registra Log de Auditoria
        await addData('auditLogs', {
          id: crypto.randomUUID(),
          action: 'fechamento_caixa',
          transactionDescription: `Fechamento Lote Físico (${caixa.currency}) -> ${targetMainCaixa.name}`,
          amount: amountToTransfer,
          currency: caixa.currency,
          bankAccountId: targetMainCaixa.id,
          bankAccountName: targetMainCaixa.name,
          userId: user?.id || '',
          userName: user?.name || '',
          date,
          cobradorId: cobrador?.id,
          createdAt: new Date().toISOString(),
        });
      }
      showSyncResult({ success: true, localOnly: false }, 'Mochilas esvaziadas e dinheiro digitalizado no Caixa da Empresa!');
      setShowFechamentoModal(false);
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
    // Para dinheiro não preencherei banco (fica na mochila)
    setBankAccountId('');
    setShowBaixaModal(true);
  };

  const handleSangriaClick = () => {
    setSangriaForm({ amount: '', currency: 'BRL', description: '', bankAccountId: '' });
    setShowSangriaModal(true);
  };

  const confirmSangria = async () => {
    if (!sangriaForm.amount || !sangriaForm.description || !sangriaForm.currency) return;
    setSavingSangria(true);
    try {
      const numAmount = parseFloat(sangriaForm.amount);
      const date = new Date().toISOString().split('T')[0];
      const txId = crypto.randomUUID();

      // Sangria é apenas uma Transação Não Fechada que irá subtrair no Lote (Mochila)
      await addData('transactions', {
        id: txId,
        type: 'despesa',
        description: `Sangria na Rua: ${sangriaForm.description}`,
        amount: numAmount,
        currency: sangriaForm.currency as Currency,
        category: 'Despesa de Cobrador',
        dueDate: date,
        status: 'pago',
        paidAt: date,
        paymentMethod: 'dinheiro', // Requisito para entrar na Mochila
        bankAccountId: undefined,  // Não registra em banco
        fechamentoId: undefined,   // Segura em estado Aberto
        cobradorId: cobrador?.id,
        createdAt: new Date().toISOString(),
      });

      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: 'despesa',
        transactionId: txId,
        transactionDescription: `Sangria: ${sangriaForm.description}`,
        amount: numAmount,
        currency: sangriaForm.currency,
        bankAccountId: '',
        bankAccountName: 'Mochila Virtual',
        userId: user?.id || '',
        userName: user?.name || '',
        date: date,
        cobradorId: cobrador?.id,
        createdAt: new Date().toISOString(),
      });

      showSyncResult({ success: true, localOnly: false }, 'Sangria registrada com sucesso, descontada da sua mochila!');
      setShowSangriaModal(false);
    } finally {
      setSavingSangria(false);
    }
  };

  const confirmBaixa = async () => {
    if (!baixaTx) return;
    
    if (paymentMethod !== 'dinheiro' && !bankAccountId) {
       alert('Selecione uma conta bancária de destino para transferências que já vão direto ao banco (PIX, TED, Cartão).');
       return;
    }

    setSaving(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      
      const payload: any = {
        status: 'pago',
        paidAt: date,
        paymentMethod: paymentMethod,
        cobradorId: cobrador?.id
      };

      if (paymentMethod !== 'dinheiro') {
         payload.bankAccountId = bankAccountId;
         payload.fechamentoId = `digital_${crypto.randomUUID()}`; // Transações digitais já nascem fechadas
      } else {
         payload.bankAccountId = null; // Fica na mochila
         payload.fechamentoId = null; 
      }

      await updateData('transactions', baixaTx.id, payload);

      // SÓ cria movimentação de caixa se NÃO for dinheiro (já que dinheiro vai pra mochila)
      if (paymentMethod !== 'dinheiro' && bankAccountId) {
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
          description: `Baixa Digital (Cobrador): ${baixaTx.description}${convDesc}`,
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

      const acc = bankAccountId ? bankAccounts.find(a => a.id === bankAccountId) : null;
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
        bankAccountName: acc?.name || 'Mochila Físico',
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
      if (t.type === 'despesa') return false;
      if (t.cobradorId !== cobrador.id || t.status !== 'pago' || !t.paidAt) return false;
      const txPaidDate = t.paidAt.split('T')[0];
      return txPaidDate === fechamentoDate;
    });
  }, [transactions, cobrador, fechamentoDate]);
  
  const todaysSangrias = useMemo(() => {
    if (!cobrador) return [];
    return transactions.filter(t => {
      if (t.type !== 'despesa') return false;
      const txDate = t.paidAt?.split('T')[0] || t.createdAt.split('T')[0];
      return t.status === 'pago' && txDate === fechamentoDate && t.cobradorId === cobrador.id && t.paymentMethod === 'dinheiro';
    });
  }, [transactions, cobrador, fechamentoDate]);
  
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
                ...myCaixas.filter(c => c.currentBalance > 0).map(c => c.currency)
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
                               {txs.map(t => {
                                  const clientName = clients.find(c => c.id === t.clientId)?.name || 'Cliente';
                                  return (
                                  <li key={t.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-1.5 hover:bg-muted/30 transition-colors print:border-black">
                                    <span className="truncate pr-2 font-medium print:text-black" title={t.description || clientName}>
                                      {clientName} {t.installments > 1 ? `(${t.currentInstallment}/${t.installments})` : ''}
                                    </span>
                                    <span className="font-bold text-success tabular-nums print:text-black">{formatCurrency(t.amount, currency as Currency)}</span>
                                  </li>
                                  );
                               })}
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
                <p className="text-muted-foreground text-sm flex items-center justify-center gap-2"><CheckCircle size={16} className="text-success" /> Sua mochila física / lote encontra-se vazia, sem saldo pendente em espécie.</p>
              </div>
            )}
            {myCaixas.some(c => c.currentBalance > 0) && (
              <button 
                onClick={openFechamentoModal}
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

              {paymentMethod !== 'dinheiro' && (
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
                      .filter(a => a.accountType !== 'caixa')
                      .map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} - {acc.currency}</option>
                    ))}
                  </select>
                  
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
              )}
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
                disabled={saving || (paymentMethod !== 'dinheiro' && !bankAccountId)}
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
                <label className="block text-sm font-medium mb-1 text-foreground">Moeda da Sangria (Retirar da Mochila)</label>
                <select 
                  value={sangriaForm.currency} 
                  onChange={(e) => setSangriaForm({...sangriaForm, currency: e.target.value as any})}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none transition-colors"
                >
                  <option value="" disabled>Selecione a moeda...</option>
                  {myCaixas.map(mc => (
                    <option key={mc.currency} value={mc.currency}>{mc.currency} (Baixado hoje: {formatCurrency(mc.currentBalance, mc.currency)})</option>
                  ))}
                  {/* Fallbacks para caso tentem sangrar sem ter recebido nada hoje ainda */}
                  {['BRL', 'PYG', 'USD'].filter(curr => !myCaixas.some(m => m.currency === curr)).map(curr => (
                    <option key={curr} value={curr}>{curr}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Valor da Despesa</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    {sangriaForm.currency || 'BRL'}
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

      {/* Fechamento Destinos Modal */}
      {showFechamentoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowFechamentoModal(false)}>
          <div className="bg-card rounded-xl card-shadow w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="text-title-section">Repasse de Fechamento</h3>
              </div>
              <button onClick={() => setShowFechamentoModal(false)} className="p-1.5 rounded hover:bg-accent transition-colors">
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-body-sm text-muted-foreground mb-4">Escolha a conta destino onde o dinheiro físico desta mochila será entregue:</p>
              
              {activeCaixas.map(caixa => (
                <div key={caixa.id} className="p-3 border border-border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-body-sm font-medium">{caixa.name}</span>
                    <span className="text-body font-bold">{formatCurrency(caixa.currentBalance, caixa.currency)}</span>
                  </div>
                  <select
                    value={fechamentoDestinations[caixa.id] || ''}
                    onChange={(e) => setFechamentoDestinations({ ...fechamentoDestinations, [caixa.id]: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-secondary outline-none transition-colors"
                  >
                    <option value="">Selecione a conta destino...</option>
                    {companyAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
              ))}

            </div>
            <div className="flex gap-2 p-4 border-t border-border bg-muted/30">
              <button 
                type="button" 
                onClick={() => setShowFechamentoModal(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={confirmFechamentoSubmit}
                disabled={saving || activeCaixas.some(c => !fechamentoDestinations[c.id])}
                className="flex-1 px-4 py-2 bg-success text-success-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Registrando...' : 'Confirmar Fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
