import { useState, useEffect, useMemo, useRef } from 'react';
import CurrencyFlag from '@/components/CurrencyFlag';
import { addData, deleteData, updateData, getAppData, getDefaultCurrency, getUIShownCurrencies } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { CashMovement, BankAccount, Currency, Transaction, PAYMENT_METHODS, getPaymentMethodLabel } from '@/types';
import { formatCurrency, formatDate, getStatusColor } from '@/utils/formatters';
import { useTranslation } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Trash2, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Wallet, Search, CheckCircle, Clock, Calendar, AlertTriangle, ShieldCheck, Printer } from 'lucide-react';
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';
import { convertAmount, conversionDescription } from '@/utils/currencyConversion';

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; };

const getDueDateUrgency = (dueDate: string) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { bg: 'bg-destructive/15 border-destructive/30', label: 'Vencida', labelClass: 'text-destructive' };
  if (diffDays <= 3) return { bg: 'bg-warning/15 border-warning/30', label: `Vence em ${diffDays}d`, labelClass: 'text-warning' };
  return { bg: 'bg-accent/50', label: '', labelClass: '' };
};

export default function Caixa() {
  const [movements, refreshMovements] = useRealtimeData('cashMovements');
  const [transactions, refreshTransactions] = useRealtimeData('transactions');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const [clients] = useRealtimeData('clients');
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>(['BRL']);
  const [showModal, setShowModal] = useState(false);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [baixaTx, setBaixaTx] = useState<Transaction | null>(null);
  const [baixaBankAccountId, setBaixaBankAccountId] = useState('');
  const [baixaDate, setBaixaDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [filterBankAccount, setFilterBankAccount] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('');
  const [filterPendingCurrency, setFilterPendingCurrency] = useState('');
  const [filterDueDays, setFilterDueDays] = useState<'' | '7' | '15' | '30' | '60'>('');
  const [activeTab, setActiveTab] = useState<'movimentos' | 'pendentes'>('movimentos');
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canEdit: canEditCaixa, canDelete: canDeleteCaixa } = usePermissions();
  const { showSyncResult } = useSyncToast();
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const [form, setForm] = useState({
    type: 'entrada' as CashMovement['type'],
    amount: 0,
    currency: getDefaultCurrency(),
    description: '',
    bankAccountId: '',
    date: today(),
    paymentMethod: '',
  });
  const [baixaPaymentMethod, setBaixaPaymentMethod] = useState('');

  useEffect(() => {
    setActiveCurrencies(getUIShownCurrencies());
  }, []);

  const filtered = useMemo(() => {
    return movements
      .filter(m => (!dateFrom || m.date >= dateFrom) && (!dateTo || m.date <= dateTo))
      .filter(m => !filterBankAccount || m.bankAccountId === filterBankAccount)
      .filter(m => !filterType || m.type === filterType)
      .filter(m => !filterPaymentMethod || m.paymentMethod === filterPaymentMethod)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, dateFrom, dateTo, filterBankAccount, filterType]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, filterBankAccount, filterType, filterPaymentMethod, activeTab]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  // Unified summary: derive from VISIBLE cash movements
  const summary = useMemo(() => {
    const primaryCurrency = activeCurrencies[0] || 'BRL';

    const entradas = filtered
      .filter(m => m.type === 'entrada')
      .reduce((s, m) => {
        const conv = convertAmount(m.amount, m.currency || 'BRL', primaryCurrency);
        return s + conv.convertedAmount;
      }, 0);

    const saidas = filtered
      .filter(m => m.type === 'saida' || m.type === 'transferencia')
      .reduce((s, m) => {
        const conv = convertAmount(m.amount, m.currency || 'BRL', primaryCurrency);
        return s + conv.convertedAmount;
      }, 0);

    return { entradas, saidas, saldo: entradas - saidas };
  }, [filtered, activeCurrencies]);

  // Pending transactions (contas a pagar/receber)
  const pendingTransactions = useMemo(() => {
    let pending = transactions.filter(tx => tx.status !== 'pago');
    if (clientSearch.trim()) {
      const search = clientSearch.toLowerCase();
      pending = pending.filter(tx => {
        const client = clients.find(c => c.id === tx.clientId);
        return client?.name.toLowerCase().includes(search) || tx.description.toLowerCase().includes(search);
      });
    }
    if (filterPendingCurrency) {
      pending = pending.filter(tx => tx.currency === filterPendingCurrency);
    }
    if (filterDueDays) {
      const days = parseInt(filterDueDays);
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() + days);
      const limitStr = limitDate.toISOString().split('T')[0];
      pending = pending.filter(tx => tx.dueDate <= limitStr);
    }
    return pending.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [transactions, clients, clientSearch, filterPendingCurrency, filterDueDays]);

  const pendingReceber = pendingTransactions.filter(tx => tx.type === 'receita' || tx.type === 'investimento');
  const pendingPagar = pendingTransactions.filter(tx => tx.type === 'despesa' || tx.type === 'retirada');

  // Totals by currency for pending
  const pendingTotalsByCurrency = useMemo(() => {
    const receberMap: Record<string, number> = {};
    const pagarMap: Record<string, number> = {};
    pendingReceber.forEach(tx => {
      receberMap[tx.currency] = (receberMap[tx.currency] || 0) + tx.amount;
    });
    pendingPagar.forEach(tx => {
      pagarMap[tx.currency] = (pagarMap[tx.currency] || 0) + tx.amount;
    });
    const allCurrencies = [...new Set([...Object.keys(receberMap), ...Object.keys(pagarMap)])].sort();
    return allCurrencies.map(c => ({
      currency: c as Currency,
      receber: receberMap[c] || 0,
      pagar: pagarMap[c] || 0,
    }));
  }, [pendingReceber, pendingPagar]);


  const accountName = (id?: string) => bankAccounts.find(a => a.id === id)?.name || '—';
  const clientName = (id?: string) => clients.find(c => c.id === id)?.name || '—';

  const handleSave = async () => {
    if (!form.amount || !form.description) return;
    setSaving(true);
    try {
      const movement: CashMovement = {
        id: crypto.randomUUID(),
        type: form.type,
        amount: form.amount,
        currency: form.currency,
        description: form.description,
        bankAccountId: form.bankAccountId || undefined,
        date: form.date,
        paymentMethod: form.paymentMethod || undefined,
        userId: user?.id,
        userName: user?.name,
        createdAt: new Date().toISOString(),
      };
      const result = await addData('cashMovements', movement);
      if (result) showSyncResult(result);

      if (form.bankAccountId) {
        const acc = bankAccounts.find(a => a.id === form.bankAccountId);
        if (acc) {
          const delta = form.type === 'entrada' ? form.amount : -form.amount;
          await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + delta });
        }
      }

      setShowModal(false);
      setForm({ type: 'entrada', amount: 0, currency: getDefaultCurrency(), description: '', bankAccountId: '', date: today(), paymentMethod: '' });
      refreshMovements();
    } finally { setSaving(false); }
  };

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const confirmDeleteMovement = async () => {
    if (!deleteTarget) return;

    // Reverse bank account balance before deleting
    if (deleteTarget.bankAccountId) {
      const acc = bankAccounts.find(a => a.id === deleteTarget.bankAccountId);
      if (acc) {
        // If entry was 'entrada', removing it means subtract; if 'saida'/'transferencia', removing means add back
        const reverseDelta = deleteTarget.type === 'entrada' ? -deleteTarget.amount : deleteTarget.amount;
        await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + reverseDelta });
      }
    }

    // Also revert related transaction status if this movement was from a baixa
    if (deleteTarget.transactionId) {
      const tx = transactions.find(t => t.id === deleteTarget.transactionId);
      if (tx && tx.status === 'pago') {
        await updateData('transactions', deleteTarget.transactionId, {
          status: 'pendente',
          paidAt: null,
          bankAccountId: null,
        } as any);

        // Register estorno in audit log
        await addData('auditLogs', {
          id: crypto.randomUUID(),
          action: 'estorno' as any,
          transactionId: tx.id,
          transactionDescription: tx.description,
          clientId: tx.clientId || '',
          clientName: clients.find(c => c.id === tx.clientId)?.name || '',
          amount: tx.amount,
          currency: tx.currency,
          bankAccountId: deleteTarget.bankAccountId || '',
          bankAccountName: bankAccounts.find(a => a.id === deleteTarget.bankAccountId)?.name || '',
          userId: user?.id || '',
          userName: user?.name || '',
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
        });
      }
    }

    const result = await deleteData('cashMovements', deleteTarget.id);
    showSyncResult(result, 'Movimentação excluída e saldo revertido');
    setDeleteTarget(null);
    refreshMovements();
  };


  const handleBaixa = (tx: Transaction) => {
    setBaixaTx(tx);
    setBaixaBankAccountId('');
    setBaixaDate(today());
    setBaixaPaymentMethod('');
    setShowBaixaModal(true);
  };

  const confirmBaixa = async () => {
    if (!baixaTx) return;
    if (!baixaBankAccountId) {
      alert("Por favor, selecione a Conta Bancária de origem/destino da transação.");
      return;
    }
    setSaving(true);
    try {
      const result = await updateData('transactions', baixaTx.id, {
        status: 'pago',
        paidAt: baixaDate,
        bankAccountId: baixaBankAccountId || undefined,
        paymentMethod: baixaPaymentMethod || undefined,
      } as any);

      if (baixaBankAccountId) {
        const acc = bankAccounts.find(a => a.id === baixaBankAccountId);
        const movType = (baixaTx.type === 'receita' || baixaTx.type === 'investimento') ? 'entrada' : 'saida';
        // Convert currency if transaction and bank account differ
        const conv = acc ? convertAmount(baixaTx.amount, baixaTx.currency, acc.currency) : null;
        const movAmount = conv ? conv.convertedAmount : baixaTx.amount;
        const movCurrency = acc ? acc.currency : baixaTx.currency;
        const convDesc = conv && conv.wasConverted ? conversionDescription(conv) : '';

        const movResult = await addData('cashMovements', {
          id: crypto.randomUUID(),
          transactionId: baixaTx.id,
          bankAccountId: baixaBankAccountId,
          type: movType,
          amount: movAmount,
          currency: movCurrency,
          description: `Baixa: ${baixaTx.description}${convDesc}`,
          date: baixaDate,
          paymentMethod: baixaPaymentMethod || undefined,
          userId: user?.id,
          userName: user?.name,
          createdAt: new Date().toISOString(),
        });
        console.log('[Caixa] cashMovement addData result:', movResult);
        if (acc) {
          const delta = movType === 'entrada' ? movAmount : -movAmount;
          await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + delta } as any);
        }
      }

      // Audit log
      const acc = bankAccounts.find(a => a.id === baixaBankAccountId);
      const client = clients.find(c => c.id === baixaTx.clientId);
      const auditConv = acc ? convertAmount(baixaTx.amount, baixaTx.currency, acc.currency) : null;
      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: baixaTx.type === 'receita' ? 'baixa_recebimento' : 'baixa_pagamento',
        transactionId: baixaTx.id,
        transactionDescription: baixaTx.description + (auditConv?.wasConverted ? conversionDescription(auditConv) : ''),
        clientId: baixaTx.clientId || '',
        clientName: client?.name || '',
        amount: baixaTx.amount,
        currency: baixaTx.currency,
        bankAccountId: baixaBankAccountId || '',
        bankAccountName: acc?.name || '',
        userId: user?.id || '',
        userName: user?.name || '',
        date: baixaDate,
        createdAt: new Date().toISOString(),
      });

      if (result) showSyncResult(result, baixaTx.type === 'receita' ? 'Recebimento confirmado' : 'Pagamento confirmado');
      setShowBaixaModal(false);
      // Show receipt
      setReceiptData({
        transaction: { ...baixaTx, status: 'pago', paidAt: baixaDate, bankAccountId: baixaBankAccountId || undefined } as Transaction,
        client: clients.find(c => c.id === baixaTx.clientId) || null,
        bankAccount: bankAccounts.find(a => a.id === baixaBankAccountId) || null,
        paidDate: baixaDate,
        userName: user?.name || '',
      });
      refreshTransactions();
      refreshMovements();
    } finally { setSaving(false); }
  };

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    setForm({ ...form, amount: isNaN(num) ? 0 : num });
  };

  const typeIcon = (type: string) => {
    if (type === 'saida') return <ArrowDownRight size={16} className="text-destructive" />;
    if (type === 'transferencia') return <ArrowLeftRight size={16} className="text-warning" />;
    return <ArrowUpRight size={16} className="text-success" />;
  };

  const typeColor = (type: string) => {
    if (type === 'saida') return 'text-destructive';
    if (type === 'transferencia') return 'text-warning';
    return 'text-success';
  };

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">Caixa</h1>
        {canEditCaixa('caixa') && (
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> Nova Movimentação
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-5 card-shadow border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-body-sm text-muted-foreground">Entradas</span>
            <ArrowUpRight size={20} className="text-success" />
          </div>
          <p className="text-title-section font-bold text-success">{formatCurrency(summary.entradas, activeCurrencies[0])}</p>
        </div>
        <div className="bg-card rounded-lg p-5 card-shadow border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-body-sm text-muted-foreground">Saídas</span>
            <ArrowDownRight size={20} className="text-destructive" />
          </div>
          <p className="text-title-section font-bold text-destructive">{formatCurrency(summary.saidas, activeCurrencies[0])}</p>
        </div>
        <div className="bg-card rounded-lg p-5 card-shadow border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-body-sm text-muted-foreground">Saldo do Período</span>
            <Wallet size={20} className={summary.saldo >= 0 ? 'text-success' : 'text-destructive'} />
          </div>
          <p className={`text-title-section font-bold ${summary.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatCurrency(summary.saldo, activeCurrencies[0])}
          </p>
        </div>
      </div>


      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('movimentos')}
          className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors ${
            activeTab === 'movimentos' ? 'border-secondary text-secondary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Movimentações
        </button>
        <button
          onClick={() => setActiveTab('pendentes')}
          className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'pendentes' ? 'border-secondary text-secondary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock size={16} /> Pendências ({pendingReceber.length + pendingPagar.length})
        </button>

      </div>

      {activeTab === 'movimentos' && (
        <>
          {/* Bank account filter */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-body-sm text-muted-foreground">Conta:</label>
              <select
                value={filterBankAccount}
                onChange={e => setFilterBankAccount(e.target.value)}
                className={inputClass + ' w-auto'}
              >
                <option value="">Todas as contas</option>
                {bankAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-body-sm text-muted-foreground">Tipo:</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className={inputClass + ' w-auto'}
              >
                <option value="">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
                <option value="transferencia">Transferência</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-body-sm text-muted-foreground">Pagamento:</label>
              <select
                value={filterPaymentMethod}
                onChange={e => setFilterPaymentMethod(e.target.value)}
                className={inputClass + ' w-auto'}
              >
                <option value="">Todos</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-body-sm text-muted-foreground">De:</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass + ' w-auto'} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-body-sm text-muted-foreground">Até:</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass + ' w-auto'} />
            </div>
            {(dateFrom || dateTo || filterBankAccount || filterType || filterPaymentMethod) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setFilterBankAccount(''); setFilterType(''); setFilterPaymentMethod(''); }}
                className="text-body-sm text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* Movements table */}
          <div className="bg-card rounded-lg card-shadow border border-border overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-body-sm">Nenhuma movimentação no período.</div>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Descrição</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Conta</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Pagamento</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMovements.map(m => (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-muted-foreground">{formatDate(m.date)}</td>
                      <td className="p-3 font-medium">{m.description}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          {typeIcon(m.type)}
                          <span className={typeColor(m.type)}>{m.type === 'entrada' ? 'Entrada' : m.type === 'saida' ? 'Saída' : 'Transferência'}</span>
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{accountName(m.bankAccountId)}</td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">
                        {m.paymentMethod ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-foreground">{getPaymentMethodLabel(m.paymentMethod)}</span>
                        ) : '—'}
                      </td>
                      <td className={`p-3 text-right font-semibold ${m.type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <CurrencyFlag currency={m.currency} size="sm" showCode={false} />
                          {m.type === 'entrada' ? '+' : '-'}{formatCurrency(m.amount, m.currency)}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          {m.transactionId && (() => {
                            const tx = transactions.find(t => t.id === m.transactionId);
                            if (tx) return (
                              <button onClick={() => setReceiptData({
                                transaction: tx,
                                client: clients.find(c => c.id === tx.clientId) || null,
                                bankAccount: bankAccounts.find(a => a.id === m.bankAccountId) || null,
                                paidDate: tx.paidAt || m.date,
                                userName: user?.name || '',
                              })} className="p-1.5 rounded hover:bg-accent transition-colors" title="Reimprimir comprovante">
                                <Printer size={16} />
                              </button>
                            );
                            return null;
                          })()}
                          {canDeleteCaixa('caixa') && <button onClick={() => setDeleteTarget(m)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-border text-body-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
              >
                Anterior
              </button>
              <span className="text-body-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <button 
                disabled={currentPage === totalPages} 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-border text-body-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'pendentes' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por cliente ou descrição..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className={inputClass + ' pl-9'}
              />
            </div>
            <select
              value={filterPendingCurrency}
              onChange={e => setFilterPendingCurrency(e.target.value)}
              className={inputClass + ' w-auto min-w-[140px]'}
            >
              <option value="">Todas moedas</option>
              {activeCurrencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filterDueDays}
              onChange={e => setFilterDueDays(e.target.value as any)}
              className={inputClass + ' w-auto min-w-[170px]'}
            >
              <option value="">Todos os vencimentos</option>
              <option value="7">Vence em 7 dias</option>
              <option value="15">Vence em 15 dias</option>
              <option value="30">Vence em 30 dias</option>
              <option value="60">Vence em 60 dias</option>
            </select>
          </div>

          {/* Totalizador por moeda */}
          {pendingTotalsByCurrency.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingTotalsByCurrency.map(({ currency, receber, pagar }) => (
                <div key={currency} className="bg-card rounded-lg p-4 card-shadow border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <CurrencyFlag currency={currency} size="md" showCode={true} />
                  </div>
                  <div className="flex justify-between text-body-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">A Receber</p>
                      <p className="font-semibold text-success">{formatCurrency(receber, currency)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">A Pagar</p>
                      <p className="font-semibold text-destructive">{formatCurrency(pagar, currency)}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">Saldo Pendente</p>
                    <p className={`text-body-sm font-bold ${receber - pagar >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(receber - pagar, currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card rounded-lg p-5 card-shadow border border-border">
            <h3 className="text-body font-semibold mb-4 flex items-center gap-2">
              <ArrowUpRight size={18} className="text-success" /> Contas a Receber ({pendingReceber.length})
            </h3>
            <div className="space-y-2">
              {pendingReceber.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">Nenhuma conta a receber pendente.</p>
              ) : (
                pendingReceber.map(tx => {
                  const urgency = getDueDateUrgency(tx.dueDate);
                  return (
                  <div key={tx.id} className={`flex items-center justify-between p-3 rounded-md border gap-3 ${urgency.bg}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {clientName(tx.clientId)} · Vence: {formatDate(tx.dueDate)}
                        {urgency.label && <span className={`ml-2 font-semibold ${urgency.labelClass}`}>({urgency.label})</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-body-sm font-semibold text-success inline-flex items-center gap-1"><CurrencyFlag currency={tx.currency} size="sm" showCode={false} />{formatCurrency(tx.amount, tx.currency)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>{tx.status}</span>
                      </div>
                      <button
                        onClick={() => handleBaixa(tx)}
                        className="p-2 rounded-lg hover:bg-success/10 text-success transition-colors"
                        title="Receber / Dar baixa"
                      >
                        <CheckCircle size={20} />
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Contas a Pagar */}
          <div className="bg-card rounded-lg p-5 card-shadow border border-border">
            <h3 className="text-body font-semibold mb-4 flex items-center gap-2">
              <ArrowDownRight size={18} className="text-destructive" /> Contas a Pagar ({pendingPagar.length})
            </h3>
            <div className="space-y-2">
              {pendingPagar.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">Nenhuma conta a pagar pendente.</p>
              ) : (
                pendingPagar.map(tx => {
                  const urgency = getDueDateUrgency(tx.dueDate);
                  return (
                  <div key={tx.id} className={`flex items-center justify-between p-3 rounded-md border gap-3 ${urgency.bg}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {clientName(tx.clientId)} · Vence: {formatDate(tx.dueDate)}
                        {urgency.label && <span className={`ml-2 font-semibold ${urgency.labelClass}`}>({urgency.label})</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-body-sm font-semibold text-destructive inline-flex items-center gap-1"><CurrencyFlag currency={tx.currency} size="sm" showCode={false} />{formatCurrency(tx.amount, tx.currency)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>{tx.status}</span>
                      </div>
                      <button
                        onClick={() => handleBaixa(tx)}
                        className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                        title="Pagar / Dar baixa"
                      >
                        <CheckCircle size={20} />
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}



      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">Nova Movimentação de Caixa</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">Tipo</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })} className={inputClass}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Descrição</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Descrição da movimentação" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Valor</label>
                  <input type="text" inputMode="decimal" value={form.amount || ''} onChange={e => handleAmountChange(e.target.value)} placeholder="0,00" className={inputClass} />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Moeda</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as any })} className={inputClass}>
                    {activeCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Conta Bancária</label>
                  <select value={form.bankAccountId} onChange={e => setForm({ ...form, bankAccountId: e.target.value })} className={inputClass}>
                    <option value="">Nenhuma</option>
                    {bankAccounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Data</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Forma de Pagamento</label>
                <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className={inputClass}>
                  <option value="">Não informado</option>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={t('common_create')} />
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dar Baixa */}
      {showBaixaModal && baixaTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowBaixaModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{baixaTx.type === 'receita' ? 'Confirmar Recebimento' : 'Confirmar Pagamento'}</h2>
              <button onClick={() => setShowBaixaModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-accent/50 space-y-1">
                <p className="text-body-sm font-medium">{baixaTx.description}</p>
                <p className="text-xs text-muted-foreground">Cliente: {clientName(baixaTx.clientId)}</p>
                <p className={`text-body font-bold inline-flex items-center gap-1.5 ${baixaTx.type === 'receita' ? 'text-success' : 'text-destructive'}`}>
                  <CurrencyFlag currency={baixaTx.currency} size="sm" showCode={false} />
                  {formatCurrency(baixaTx.amount, baixaTx.currency)}
                </p>
                {(() => {
                  const selAcc = bankAccounts.find(a => a.id === baixaBankAccountId);
                  if (selAcc && selAcc.currency !== baixaTx.currency) {
                    const conv = convertAmount(baixaTx.amount, baixaTx.currency, selAcc.currency);
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        ≈ <CurrencyFlag currency={selAcc.currency} size="sm" showCode={false} /> {formatCurrency(conv.convertedAmount, selAcc.currency)}
                        <span className="ml-1">(taxa: {conv.rate.toFixed(4)})</span>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Conta Bancária</label>
                <select value={baixaBankAccountId} onChange={e => setBaixaBankAccountId(e.target.value)} className={inputClass}>
                  <option value="">Selecione a conta...</option>
                  {bankAccounts.filter(a => a.active).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.currentBalance, a.currency)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Data do {baixaTx.type === 'receita' ? 'Recebimento' : 'Pagamento'}</label>
                <input type="date" value={baixaDate} onChange={e => setBaixaDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Forma de Pagamento</label>
                <select value={baixaPaymentMethod} onChange={e => setBaixaPaymentMethod(e.target.value)} className={inputClass}>
                  <option value="">Não informado</option>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={confirmBaixa} saving={saving} label={baixaTx.type === 'receita' ? 'Confirmar Recebimento' : 'Confirmar Pagamento'} />
                <button onClick={() => setShowBaixaModal(false)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.description || ''}
        itemType="a movimentação de caixa"
        onConfirm={confirmDeleteMovement}
        onCancel={() => setDeleteTarget(null)}
      />
      {receiptData && (
        <ReceiptPrint receipt={receiptData} onClose={() => setReceiptData(null)} />
      )}
    </div>
  );
}
