import { useState, useEffect, useMemo } from 'react';
import { addData, updateData, deleteData, getAppData } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Currency, Client, Transaction, BankAccount, Contract } from '@/types';
import { formatCurrency, formatDate, getCountryFlag, getDocumentLabel, getStatusColor } from '@/utils/formatters';
import { useTranslation } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Pencil, Trash2, X, Eye, Search, AlertTriangle, CheckCircle, Clock, CheckSquare, Square, Loader2, Printer } from 'lucide-react';
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';
import { convertAmount, conversionDescription } from '@/utils/currencyConversion';
import { applyDocumentMask, applyPhoneMask } from '@/utils/masks';

const emptyClient: Omit<Client, 'id' | 'createdAt'> = {
  name: '', type: 'PF', personRole: 'cliente', country: 'BR', document: '', phone: '', phone2: '', email: '', address: '',
  addressNumber: '', addressComplement: '', neighborhood: '', city: '', state: '', zipCode: '',
  notes: '', tradeName: '', stateRegistration: '', municipalRegistration: '', contactPerson: '', contactPhone: '',
  cobradorId: '',
};

type ClientStatus = 'em_dia' | 'pendente' | 'atrasado';

interface CurrencyFinancialSummary {
  currency: Currency;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
}

interface ClientFinancialSummary {
  byCurrency: CurrencyFinancialSummary[];
  pendingCount: number;
  overdueCount: number;
  status: ClientStatus;
  total: number;
}

function getClientFinancialSummary(clientId: string, transactions: Transaction[]): ClientFinancialSummary {
  const txs = transactions.filter(t => t.clientId === clientId);
  const pendingCount = txs.filter(t => t.status !== 'pago').length;
  const overdueCount = txs.filter(t => t.status === 'atrasado').length;

  let status: ClientStatus = 'em_dia';
  if (overdueCount > 0) status = 'atrasado';
  else if (pendingCount > 0) status = 'pendente';

  // Group by currency
  const currencyMap: Record<string, CurrencyFinancialSummary> = {};
  txs.forEach(t => {
    if (!currencyMap[t.currency]) {
      currencyMap[t.currency] = { currency: t.currency as Currency, totalPaid: 0, totalPending: 0, totalOverdue: 0 };
    }
    const entry = currencyMap[t.currency];
    if (t.status === 'pago') entry.totalPaid += t.amount;
    else if (t.status === 'pendente') entry.totalPending += t.amount;
    else if (t.status === 'atrasado') entry.totalOverdue += t.amount;
  });

  return { byCurrency: Object.values(currencyMap), pendingCount, overdueCount, status, total: txs.length };
}

function StatusBadge({ status }: { status: ClientStatus }) {
  if (status === 'atrasado') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <AlertTriangle size={12} /> Atrasado
    </span>
  );
  if (status === 'pendente') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning">
      <Clock size={12} /> Pendente
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">
      <CheckCircle size={12} /> Em dia
    </span>
  );
}

export default function Clientes() {
  const [clients, refreshClients] = useRealtimeData('clients');
  const [transactions] = useRealtimeData('transactions');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const [cobradores] = useRealtimeData('cobradores');
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [filterStatus, setFilterStatus] = useState<ClientStatus | ''>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'cadastro' | 'transacoes' | 'contratos'>('cadastro');
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canEdit: canEditClientes, canDelete: canDeleteClientes } = usePermissions();

  const [historyStatus, setHistoryStatus] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  // Baixa state for client history
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set());
  const [showHistoryBaixaModal, setShowHistoryBaixaModal] = useState(false);
  const [historyBaixaBankAccountId, setHistoryBaixaBankAccountId] = useState('');
  const [historyBaixaDate, setHistoryBaixaDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyBaixaSaving, setHistoryBaixaSaving] = useState(false);
  // Single baixa from history
  const [singleBaixaTx, setSingleBaixaTx] = useState<Transaction | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const load = () => { refreshClients(); };
  const [saving, setSaving] = useState(false);
  const { showSyncResult } = useSyncToast();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHistory) setShowHistory(null);
        else if (showModal) setShowModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showHistory, showModal]);

  const clientSummaries = useMemo(() => {
    const map: Record<string, ReturnType<typeof getClientFinancialSummary>> = {};
    clients.forEach(c => { map[c.id] = getClientFinancialSummary(c.id, transactions); });
    return map;
  }, [clients, transactions]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.document.includes(searchQuery)) return false;
      if (filterCountry && c.country !== filterCountry) return false;
      if (filterStatus && clientSummaries[c.id]?.status !== filterStatus) return false;
      if (filterRole) {
        const role = c.personRole || 'cliente';
        if (filterRole === 'ambos') {
          if (role !== 'ambos') return false;
        } else {
          if (role !== filterRole && role !== 'ambos') return false;
        }
      }
      return true;
    });
  }, [clients, searchQuery, filterCountry, filterStatus, filterRole, clientSummaries]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyClient }); setShowModal(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ ...emptyClient, ...c }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const dataToSave = { ...form, cobradorId: form.cobradorId || undefined };
      const result = editing
        ? await updateData('clients', editing.id, dataToSave)
        : await addData('clients', { ...dataToSave, id: crypto.randomUUID(), createdAt: new Date().toISOString() } as Client);
      showSyncResult(result);
      setShowModal(false); load();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteData('clients', deleteTarget.id);
    showSyncResult(result, 'Pessoa excluída');
    setDeleteTarget(null);
    load();
  };

  const openHistory = (c: Client) => {
    setShowHistory(c);
    setHistoryStatus('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistorySelectedIds(new Set());
  };

  const toggleHistorySelect = (id: string) => {
    setHistorySelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const performBaixa = async (txList: Transaction[], bankAccountId: string, date: string) => {
    for (const tx of txList) {
      await updateData('transactions', tx.id, {
        status: 'pago',
        paidAt: date,
        bankAccountId: bankAccountId || undefined,
      } as any);

      if (bankAccountId) {
        const acc = bankAccounts.find(a => a.id === bankAccountId);
        const movType = (tx.type === 'receita' || tx.type === 'investimento') ? 'entrada' : 'saida';
        // Convert currency if transaction and bank account differ
        const conv = acc ? convertAmount(tx.amount, tx.currency, acc.currency) : null;
        const movAmount = conv ? conv.convertedAmount : tx.amount;
        const movCurrency = acc ? acc.currency : tx.currency;
        const convDesc = conv && conv.wasConverted ? conversionDescription(conv) : '';

        await addData('cashMovements', {
          id: crypto.randomUUID(),
          transactionId: tx.id,
          bankAccountId: bankAccountId,
          type: movType,
          amount: movAmount,
          currency: movCurrency,
          description: `Baixa: ${tx.description}${convDesc}`,
          date: date,
          createdAt: new Date().toISOString(),
        });
        if (acc) {
          const delta = movType === 'entrada' ? movAmount : -movAmount;
          await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + delta } as any);
        }
      }

      const acc = bankAccounts.find(a => a.id === bankAccountId);
      const client = clients.find(c => c.id === tx.clientId);
      const auditConv = acc ? convertAmount(tx.amount, tx.currency, acc.currency) : null;
      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: (tx.type === 'receita' || tx.type === 'investimento') ? 'baixa_recebimento' : 'baixa_pagamento',
        transactionId: tx.id,
        transactionDescription: tx.description + (auditConv?.wasConverted ? conversionDescription(auditConv) : ''),
        clientId: tx.clientId || '',
        clientName: client?.name || '',
        amount: tx.amount,
        currency: tx.currency,
        bankAccountId: bankAccountId || '',
        bankAccountName: acc?.name || '',
        userId: user?.id || '',
        userName: user?.name || '',
        date: date,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const confirmHistoryBaixa = async () => {
    const pendentes = transactions.filter(tx => historySelectedIds.has(tx.id) && tx.status !== 'pago');
    if (pendentes.length === 0) return;
    setHistoryBaixaSaving(true);
    try {
      await performBaixa(pendentes, historyBaixaBankAccountId, historyBaixaDate);
      showSyncResult({ success: true, localOnly: false }, 'Baixa realizada com sucesso');
      setShowHistoryBaixaModal(false);
      // Show receipt for last item
      if (pendentes.length === 1) {
        const tx = pendentes[0];
        setReceiptData({
          transaction: { ...tx, status: 'pago', paidAt: historyBaixaDate, bankAccountId: historyBaixaBankAccountId || undefined } as Transaction,
          client: clients.find(c => c.id === tx.clientId) || null,
          bankAccount: bankAccounts.find(a => a.id === historyBaixaBankAccountId) || null,
          paidDate: historyBaixaDate,
          userName: user?.name || '',
        });
      }
      setHistorySelectedIds(new Set());
      load();
    } finally { setHistoryBaixaSaving(false); }
  };

  const confirmSingleBaixa = async () => {
    if (!singleBaixaTx) return;
    setHistoryBaixaSaving(true);
    try {
      await performBaixa([singleBaixaTx], historyBaixaBankAccountId, historyBaixaDate);
      showSyncResult({ success: true, localOnly: false }, 'Baixa realizada com sucesso');
      // Show receipt
      setReceiptData({
        transaction: { ...singleBaixaTx, status: 'pago', paidAt: historyBaixaDate, bankAccountId: historyBaixaBankAccountId || undefined } as Transaction,
        client: clients.find(c => c.id === singleBaixaTx.clientId) || null,
        bankAccount: bankAccounts.find(a => a.id === historyBaixaBankAccountId) || null,
        paidDate: historyBaixaDate,
        userName: user?.name || '',
      });
      setSingleBaixaTx(null);
      load();
    } finally { setHistoryBaixaSaving(false); }
  };

  const openBaixaModal = (tx?: Transaction) => {
    setHistoryBaixaBankAccountId('');
    setHistoryBaixaDate(new Date().toISOString().split('T')[0]);
    if (tx) {
      setSingleBaixaTx(tx);
    } else {
      setShowHistoryBaixaModal(true);
    }
  };

  const clientTransactions = (id: string) => {
    return transactions.filter((tx) => {
      if (tx.clientId !== id) return false;
      if (historyStatus && tx.status !== historyStatus) return false;
      if (historyDateFrom && tx.dueDate < historyDateFrom) return false;
      if (historyDateTo && tx.dueDate > historyDateTo) return false;
      return true;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  };

  const groupInstallments = (txList: Transaction[]) => {
    const groups: Record<string, Transaction[]> = {};
    const standalone: Transaction[] = [];
    txList.forEach(tx => {
      if (tx.installmentGroupId) {
        if (!groups[tx.installmentGroupId]) groups[tx.installmentGroupId] = [];
        groups[tx.installmentGroupId].push(tx);
      } else {
        standalone.push(tx);
      }
    });
    return { groups, standalone };
  };

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  const isPJ = form.type === 'PJ';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">{t('cli_title')}</h1>
        {canEditClientes('clientes') && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> {t('cli_new')}
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nome ou documento..." className={inputClass + ' pl-9'} />
        </div>
        <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none sm:w-40">
          <option value="">{t('cli_filter_all_countries')}</option>
          <option value="BR">🇧🇷 {t('cli_brazil')}</option>
          <option value="PY">🇵🇾 {t('cli_paraguay')}</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none sm:w-40">
          <option value="">Todos os status</option>
          <option value="em_dia">✅ Em dia</option>
          <option value="pendente">⏳ Pendente</option>
          <option value="atrasado">⚠️ Atrasado</option>
        </select>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none sm:w-40">
          <option value="">Todas as classificações</option>
          <option value="cliente">Clientes</option>
          <option value="fornecedor">Fornecedores</option>
          <option value="ambos">Ambos</option>
        </select>
      </div>

      {/* Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map((c) => {
          const summary = clientSummaries[c.id];
          return (
            <div key={c.id} className="bg-card rounded-lg p-5 card-shadow border border-border hover:card-shadow-hover transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{getCountryFlag(c.country)} {c.name}</p>
                    {summary && <StatusBadge status={summary.status} />}
                  </div>
                  <p className="text-body-sm text-muted-foreground">
                    <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mr-1 ${
                      c.personRole === 'fornecedor' ? 'bg-secondary/10 text-secondary' : 
                      c.personRole === 'ambos' ? 'bg-accent text-foreground' : 
                      'bg-primary/10 text-primary'
                    }`}>
                      {c.personRole === 'fornecedor' ? 'Fornecedor' : c.personRole === 'ambos' ? 'Cliente/Fornecedor' : 'Cliente'}
                    </span>
                    {c.type === 'PJ' ? 'Empresa' : 'Pessoa Física'} · {getDocumentLabel(c.country, c.type)}: {c.document}
                  </p>
                  {c.type === 'PJ' && c.tradeName && (
                    <p className="text-xs text-muted-foreground">Fantasia: {c.tradeName}</p>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => openHistory(c)} className="p-1.5 rounded hover:bg-accent transition-colors"><Eye size={16} /></button>
                  {canEditClientes('clientes') && <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-accent transition-colors"><Pencil size={16} /></button>}
                  {canDeleteClientes('clientes') && <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={16} /></button>}
                </div>
              </div>

              {/* Contact info */}
              <div className="text-body-sm text-muted-foreground space-y-0.5 mb-3">
                {c.email && <p className="truncate">📧 {c.email}</p>}
                {c.phone && <p>📱 {c.phone}</p>}
                {(c.city || c.state) && <p>📍 {[c.city, c.state].filter(Boolean).join(' - ')}</p>}
              </div>

              {/* Financial Summary - Per Currency */}
              {summary && summary.total > 0 && (
                <div className="border-t border-border pt-3 space-y-2">
                  {summary.byCurrency.map((cs) => (
                    <div key={cs.currency} className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Pago ({cs.currency})</p>
                        <p className="text-body-sm font-semibold text-success">{formatCurrency(cs.totalPaid, cs.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pendente</p>
                        <p className="text-body-sm font-semibold text-warning">{formatCurrency(cs.totalPending, cs.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Atrasado</p>
                        <p className="text-body-sm font-semibold text-destructive">{formatCurrency(cs.totalOverdue, cs.currency)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredClients.length === 0 && (
          <p className="text-muted-foreground text-body-sm col-span-full text-center py-8">{t('cli_no_transactions')}</p>
        )}
      </div>

      {/* ======= CREATE/EDIT MODAL ======= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? t('cli_edit') : t('cli_new')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Classificação e Tipo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Classificação</label>
                  <select value={form.personRole || 'cliente'} onChange={(e) => setForm({ ...form, personRole: e.target.value as any })} className={inputClass}>
                    <option value="cliente">Cliente</option>
                    <option value="fornecedor">Fornecedor</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('cli_type')}</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className={inputClass}>
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica / Empresa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('cli_country')}</label>
                  <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value as any })} className={inputClass}>
                    <option value="BR">🇧🇷 {t('cli_brazil')}</option>
                    <option value="PY">🇵🇾 {t('cli_paraguay')}</option>
                  </select>
                </div>
              </div>

              {getAppData().settings?.cobradoresEnabled && (
                <div>
                  <label className="block text-body-sm font-medium mb-1">Cobrador</label>
                  <select value={form.cobradorId || ''} onChange={(e) => setForm({ ...form, cobradorId: e.target.value })} className={inputClass}>
                    <option value="">Nenhum cobrador vinculado</option>
                    {cobradores.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.region ? `(${c.region})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nome / Razão Social */}
              <div>
                <label className="block text-body-sm font-medium mb-1">{isPJ ? 'Razão Social' : t('cli_name')}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder={isPJ ? 'Razão Social da Empresa' : 'Nome completo'} />
              </div>

              {/* PJ: Nome Fantasia */}
              {isPJ && (
                <div>
                  <label className="block text-body-sm font-medium mb-1">Nome Fantasia</label>
                  <input value={form.tradeName || ''} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} className={inputClass} placeholder="Nome fantasia" />
                </div>
              )}

              {/* Documento */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">{getDocumentLabel(form.country, form.type)}</label>
                  <input value={form.document} onChange={(e) => setForm({ ...form, document: applyDocumentMask(e.target.value, form.country, form.type === 'PJ' ? 'empresa' : 'pessoal') })} className={inputClass} placeholder={form.country === 'BR' ? (form.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00') : (form.type === 'PJ' ? '00000000-0' : '0.000.000')} />
                </div>
                {isPJ && (
                  <div>
                    <label className="block text-body-sm font-medium mb-1">Inscrição Estadual</label>
                    <input value={form.stateRegistration || ''} onChange={(e) => setForm({ ...form, stateRegistration: e.target.value })} className={inputClass} placeholder="IE" />
                  </div>
                )}
              </div>

              {isPJ && (
                <div>
                  <label className="block text-body-sm font-medium mb-1">Inscrição Municipal</label>
                  <input value={form.municipalRegistration || ''} onChange={(e) => setForm({ ...form, municipalRegistration: e.target.value })} className={inputClass} placeholder="IM" />
                </div>
              )}

              {/* Contato */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('cli_phone')}</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: applyPhoneMask(e.target.value, form.country) })} className={inputClass} placeholder={form.country === 'BR' ? '(00) 00000-0000' : '(0000) 000-000'} />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Telefone 2</label>
                  <input value={form.phone2 || ''} onChange={(e) => setForm({ ...form, phone2: applyPhoneMask(e.target.value, form.country) })} className={inputClass} placeholder={form.country === 'BR' ? '(00) 00000-0000' : '(0000) 000-000'} />
                </div>
              </div>

              <div>
                <label className="block text-body-sm font-medium mb-1">{t('cli_email')}</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="email@exemplo.com" />
              </div>

              {/* PJ: Contato responsável */}
              {isPJ && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-body-sm font-medium mb-1">Pessoa de Contato</label>
                    <input value={form.contactPerson || ''} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className={inputClass} placeholder="Nome do responsável" />
                  </div>
                  <div>
                    <label className="block text-body-sm font-medium mb-1">Telefone do Contato</label>
                    <input value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: applyPhoneMask(e.target.value, form.country) })} className={inputClass} placeholder={form.country === 'BR' ? '(00) 00000-0000' : '(0000) 000-000'} />
                  </div>
                </div>
              )}

              {/* Endereço completo */}
              <p className="text-body-sm font-semibold text-muted-foreground pt-1">Endereço</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-body-sm font-medium mb-1">Logradouro</label>
                  <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} placeholder="Rua, Avenida..." />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Número</label>
                  <input value={form.addressNumber || ''} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} className={inputClass} placeholder="Nº" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Complemento</label>
                  <input value={form.addressComplement || ''} onChange={(e) => setForm({ ...form, addressComplement: e.target.value })} className={inputClass} placeholder="Sala, Bloco..." />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Bairro</label>
                  <input value={form.neighborhood || ''} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} className={inputClass} placeholder="Bairro" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Cidade</label>
                  <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} placeholder="Cidade" />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Estado / Dept.</label>
                  <input value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputClass} placeholder="UF" />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">{form.country === 'BR' ? 'CEP' : 'Código Postal'}</label>
                  <input value={form.zipCode || ''} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} className={inputClass} placeholder={form.country === 'BR' ? '00000-000' : 'Código'} />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-body-sm font-medium mb-1">Observações</label>
                <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass + ' min-h-[60px]'} placeholder="Anotações internas sobre esta pessoa..." />
              </div>

              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? t('common_save') : t('common_create')} />
                <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">{t('common_cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======= HISTORY MODAL ======= */}
      {showHistory && (() => {
        const txList = clientTransactions(showHistory.id);
        const { groups, standalone } = groupInstallments(txList);
        const allTxs = transactions.filter(t => t.clientId === showHistory.id);
        const sumPaid = allTxs.filter(t => t.status === 'pago').reduce((s, t) => s + t.amount, 0);
        const sumPending = allTxs.filter(t => t.status === 'pendente').reduce((s, t) => s + t.amount, 0);
        const sumOverdue = allTxs.filter(t => t.status === 'atrasado').reduce((s, t) => s + t.amount, 0);
        const pendentesSelected = txList.filter(tx => historySelectedIds.has(tx.id) && tx.status !== 'pago');
        const allPendentes = txList.filter(tx => tx.status !== 'pago');

        const renderTxRow = (tx: Transaction, showInstallment?: boolean) => {
          const isPending = tx.status !== 'pago';
          const isSelected = historySelectedIds.has(tx.id);
          return (
            <div key={tx.id} className={`flex items-center gap-2 px-4 py-2 ${isSelected ? 'bg-secondary/5' : ''}`}>
              {isPending && (
                <button onClick={() => toggleHistorySelect(tx.id)} className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground shrink-0">
                  {isSelected ? <CheckSquare size={16} className="text-secondary" /> : <Square size={16} />}
                </button>
              )}
              {!isPending && <div className="w-[20px]" />}
              <div className="flex-1 min-w-0">
                <p className="text-body-sm font-medium">
                  {showInstallment ? `${tx.currentInstallment}/${tx.installments}` : tx.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {showInstallment ? formatDate(tx.dueDate) : `${tx.type} · ${formatDate(tx.dueDate)}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-body-sm font-semibold">{formatCurrency(tx.amount, tx.currency)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(tx.status)}`}>{tx.status}</span>
              </div>
              {isPending && (
                <button onClick={() => openBaixaModal(tx)} className="p-1.5 rounded hover:bg-success/10 text-success transition-colors shrink-0" title="Dar baixa">
                  <CheckCircle size={16} />
                </button>
              )}
              {!isPending && (
                <button onClick={() => setReceiptData({
                  transaction: tx,
                  client: showHistory || null,
                  bankAccount: bankAccounts.find(a => a.id === tx.bankAccountId) || null,
                  paidDate: tx.paidAt || tx.dueDate,
                  userName: user?.name || '',
                })} className="p-1.5 rounded hover:bg-accent transition-colors shrink-0" title="Reimprimir comprovante">
                  <Printer size={16} />
                </button>
              )}
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40" onClick={() => setShowHistory(null)}>
            <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-title-section">{t('cli_history')}: {showHistory.name}</h2>
                <button onClick={() => setShowHistory(null)} className="p-1 rounded hover:bg-accent"><X size={20} /></button>
              </div>

              {/* Summary cards inside history */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-success/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-success font-medium">Pago</p>
                  <p className="text-body font-bold text-success">{formatCurrency(sumPaid, 'BRL')}</p>
                </div>
                <div className="bg-warning/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-warning font-medium">Pendente</p>
                  <p className="text-body font-bold text-warning">{formatCurrency(sumPending, 'BRL')}</p>
                </div>
                <div className="bg-destructive/10 rounded-lg p-3 text-center">
                  <p className="text-xs text-destructive font-medium">Atrasado</p>
                  <p className="text-body font-bold text-destructive">{formatCurrency(sumOverdue, 'BRL')}</p>
                </div>
              </div>

              {/* History Filters */}
              <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/30 border border-border">
                <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-body-sm bg-background focus:ring-1 focus:ring-secondary outline-none">
                  <option value="">{t('cli_all_status')}</option>
                  <option value="pendente">{t('fin_status_pendente')}</option>
                  <option value="pago">{t('fin_status_pago')}</option>
                  <option value="atrasado">{t('fin_status_atrasado')}</option>
                </select>
                <input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-body-sm bg-background focus:ring-1 focus:ring-secondary outline-none" />
                <input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-body-sm bg-background focus:ring-1 focus:ring-secondary outline-none" />
                {(historyStatus || historyDateFrom || historyDateTo) && (
                  <button onClick={() => { setHistoryStatus(''); setHistoryDateFrom(''); setHistoryDateTo(''); }} className="px-3 py-1.5 text-body-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10">
                    Limpar
                  </button>
                )}
              </div>

              {/* Batch action bar */}
              {historySelectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 mb-3 bg-secondary/10 border border-secondary/30 rounded-lg animate-fade-in">
                  <span className="text-body-sm font-medium">{historySelectedIds.size} selecionado(s)</span>
                  {pendentesSelected.length > 0 && (
                    <button onClick={() => openBaixaModal()} disabled={historyBaixaSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success text-body-sm font-medium hover:bg-success/20 transition-colors disabled:opacity-50 ml-auto">
                      <CheckCircle size={14} /> Baixar ({pendentesSelected.length})
                    </button>
                  )}
                  <button onClick={() => setHistorySelectedIds(new Set())}
                    className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors" title="Limpar seleção">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Select all pendentes shortcut */}
              {allPendentes.length > 0 && historySelectedIds.size === 0 && (
                <div className="mb-3">
                  <button onClick={() => setHistorySelectedIds(new Set(allPendentes.map(tx => tx.id)))}
                    className="text-body-sm text-secondary hover:underline">
                    Selecionar todas as pendências ({allPendentes.length})
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {txList.length === 0 ? (
                  <p className="text-muted-foreground text-body-sm">{t('cli_no_transactions')}</p>
                ) : (
                  <>
                    {Object.entries(groups).map(([groupId, groupTxs]) => {
                      const sorted = groupTxs.sort((a, b) => (a.currentInstallment || 0) - (b.currentInstallment || 0));
                      const baseDesc = sorted[0]?.description?.replace(/\s*\(\d+\/\d+\)$/, '') || '';
                      const totalAmount = sorted.reduce((s, t) => s + t.amount, 0);
                      return (
                        <div key={groupId} className="border border-secondary/30 rounded-lg overflow-hidden">
                          <div className="bg-secondary/10 px-4 py-2 flex items-center justify-between">
                            <span className="text-body-sm font-semibold">{t('cli_installment_group')}: {baseDesc}</span>
                            <span className="text-body-sm font-bold">{formatCurrency(totalAmount, sorted[0]?.currency || 'BRL')}</span>
                          </div>
                          <div className="divide-y divide-border">
                            {sorted.map((tx) => renderTxRow(tx, true))}
                          </div>
                        </div>
                      );
                    })}
                    {standalone.map((tx) => (
                      <div key={tx.id} className="rounded-md bg-accent/50">
                        {renderTxRow(tx)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======= BAIXA MODAL (batch or single from history) ======= */}
      {(showHistoryBaixaModal || singleBaixaTx) && (() => {
        const pendentesSelected = transactions.filter(tx => historySelectedIds.has(tx.id) && tx.status !== 'pago');
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => { setShowHistoryBaixaModal(false); setSingleBaixaTx(null); }}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-title-section font-semibold flex items-center gap-2">
                <CheckCircle size={20} className="text-success" />
                {singleBaixaTx ? 'Dar Baixa' : `Baixar ${pendentesSelected.length} parcela(s)`}
              </h3>
              <button onClick={() => { setShowHistoryBaixaModal(false); setSingleBaixaTx(null); }} className="p-1 rounded hover:bg-accent"><X size={18} /></button>
            </div>

            {singleBaixaTx && (
              <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border text-body-sm">
                <p className="font-medium">{singleBaixaTx.description}</p>
                <p className="text-muted-foreground">{formatCurrency(singleBaixaTx.amount, singleBaixaTx.currency)} · {formatDate(singleBaixaTx.dueDate)}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">Conta Bancária</label>
                <select value={historyBaixaBankAccountId} onChange={e => setHistoryBaixaBankAccountId(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none">
                  <option value="">Sem conta bancária</option>
                  {bankAccounts.filter(a => a.active).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.currentBalance, a.currency)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Data da Baixa</label>
                <input type="date" value={historyBaixaDate} onChange={e => setHistoryBaixaDate(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={singleBaixaTx ? confirmSingleBaixa : confirmHistoryBaixa} disabled={historyBaixaSaving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-success text-success-foreground text-body-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {historyBaixaSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {historyBaixaSaving ? 'Processando...' : 'Confirmar Baixa'}
                </button>
                <button onClick={() => { setShowHistoryBaixaModal(false); setSingleBaixaTx(null); }} disabled={historyBaixaSaving}
                  className="px-4 py-2.5 rounded-lg border border-border text-body-sm font-medium hover:bg-accent transition-colors disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.name || ''}
        itemType="a pessoa"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {receiptData && (
        <ReceiptPrint receipt={receiptData} onClose={() => setReceiptData(null)} />
      )}
    </div>
  );
}
