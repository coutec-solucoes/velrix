import { useState, useEffect, useMemo, useRef } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import CurrencyFlag from '@/components/CurrencyFlag';
import { addData, updateData, deleteData, getAppData, getDefaultCurrency, getUIShownCurrencies } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Transaction, Client, Category, Currency, BankAccount, Contract } from '@/types';
import { formatCurrency, formatDate, getStatusColor } from '@/utils/formatters';
import { useTranslation } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Pencil, Trash2, X, Filter, ArrowUpRight, ArrowDownRight, Wallet, Clock, Download, FileText, Search, ToggleLeft, ToggleRight, CheckCircle, CheckSquare, Square, RefreshCw, Printer } from 'lucide-react';
import ReceiptPrint, { ReceiptData } from '@/components/ReceiptPrint';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';
import { convertAmount, conversionDescription, getExchangeRate } from '@/utils/currencyConversion';

const emptyTransaction: Omit<Transaction, 'id' | 'createdAt'> = {
  type: 'receita', description: '', amount: 0, currency: getDefaultCurrency(), category: '', clientId: '',
  bankAccountId: '', dueDate: new Date().toISOString().split('T')[0], status: 'pendente',
  installments: undefined, recurrence: null,
};

const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
};
const monthEnd = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().split('T')[0];
};

interface InstallmentPreview {
  number: number;
  amount: number;
  dueDate: string;
  dayAdjusted?: boolean;
  originalDay?: number;
}

export default function Financeiro() {
  const [transactions, refreshTransactions] = useRealtimeData('transactions');
  const [clients] = useRealtimeData('clients');
  const [categories] = useRealtimeData('categories');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>(['BRL']);
  const [showModal, setShowModal] = useState(false);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [baixaTx, setBaixaTx] = useState<Transaction | null>(null);
  const [baixaBankAccountId, setBaixaBankAccountId] = useState('');
  const [baixaDate, setBaixaDate] = useState(new Date().toISOString().split('T')[0]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState(emptyTransaction);
  const [showFilters, setShowFilters] = useState(false);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canEdit: canEditFin, canDelete: canDeleteFin } = usePermissions();
  const [saving, setSaving] = useState(false);
  const { showSyncResult } = useSyncToast();
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchBaixaModal, setShowBatchBaixaModal] = useState(false);
  const [batchBaixaBankAccountId, setBatchBaixaBankAccountId] = useState('');
  const [batchBaixaDate, setBatchBaixaDate] = useState(new Date().toISOString().split('T')[0]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (txList: Transaction[]) => {
    const allSelected = txList.every(tx => selectedIds.has(tx.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(txList.map(tx => tx.id)));
    }
  };

  const selectedTransactions = useMemo(() =>
    transactions.filter(tx => selectedIds.has(tx.id)),
  [transactions, selectedIds]);

  const selectedPendentes = useMemo(() =>
    selectedTransactions.filter(tx => tx.status !== 'pago'),
  [selectedTransactions]);

  const processDeleteTransaction = async (tx: Transaction) => {
    // If transaction was paid and linked to a bank account, reverse the balance and remove the cash movement
    if (tx.status === 'pago' && tx.bankAccountId) {
      const acc = bankAccounts.find(a => a.id === tx.bankAccountId);
      if (acc) {
        const wasEntry = tx.type === 'receita' || tx.type === 'investimento';
        const conv = convertAmount(tx.amount, tx.currency, acc.currency);
        const reverseAmount = conv.convertedAmount;
        const reverseDelta = wasEntry ? -reverseAmount : reverseAmount;
        await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + reverseDelta } as any);
      }

      // Remove associated cash movement
      const data = getAppData();
      const cashMovements = data.cashMovements || [];
      const relatedMovement = cashMovements.find((m: any) => m.transactionId === tx.id);
      if (relatedMovement) {
        await deleteData('cashMovements', relatedMovement.id);
      }

      // Register estorno in audit log
      const client = clients.find(c => c.id === tx.clientId);
      await addData('auditLogs', {
        id: crypto.randomUUID(),
        action: 'estorno' as any,
        transactionId: tx.id,
        transactionDescription: tx.description,
        clientId: tx.clientId || '',
        clientName: client?.name || '',
        amount: tx.amount,
        currency: tx.currency,
        bankAccountId: tx.bankAccountId || '',
        bankAccountName: bankAccounts.find(a => a.id === tx.bankAccountId)?.name || '',
        userId: user?.id || '',
        userName: user?.name || '',
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      });
    }

    // Remover contrato associado caso exista
    const appData = getAppData();
    const allContracts = appData.contracts || [];
    const relatedContract = allContracts.find((c: any) => c.transactionIds && c.transactionIds.includes(tx.id));
    if (relatedContract) {
      await deleteData('contracts', relatedContract.id);
    }

    return deleteData('transactions', tx.id);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Deseja excluir ${selectedIds.size} movimentação(ões) selecionada(s)?`)) return;
    setSaving(true);
    try {
      const txsToDelete = transactions.filter(tx => selectedIds.has(tx.id));
      for (const tx of txsToDelete) {
        await processDeleteTransaction(tx);
      }
      showSyncResult({ error: null } as any, `${txsToDelete.length} movimentações excluídas`);
      setSelectedIds(new Set());
      load();
    } finally { setSaving(false); }
  };

  const handleBatchBaixa = () => {
    if (selectedPendentes.length === 0) return;
    setBatchBaixaBankAccountId('');
    setBatchBaixaDate(new Date().toISOString().split('T')[0]);
    setShowBatchBaixaModal(true);
  };

  const confirmBatchBaixa = async () => {
    if (selectedPendentes.length === 0) return;
    setSaving(true);
    try {
      for (const tx of selectedPendentes) {
        await updateData('transactions', tx.id, {
          status: 'pago',
          paidAt: batchBaixaDate,
          bankAccountId: batchBaixaBankAccountId || undefined,
        } as any);

        if (batchBaixaBankAccountId) {
          const acc = bankAccounts.find(a => a.id === batchBaixaBankAccountId);
          const movType = (tx.type === 'receita' || tx.type === 'investimento') ? 'entrada' : 'saida';
          const conv = acc ? convertAmount(tx.amount, tx.currency, acc.currency) : null;
          const movAmount = conv ? conv.convertedAmount : tx.amount;
          const movCurrency = acc ? acc.currency : tx.currency;
          const convDesc = conv && conv.wasConverted ? conversionDescription(conv) : '';
          await addData('cashMovements', {
            id: crypto.randomUUID(),
            transactionId: tx.id,
            bankAccountId: batchBaixaBankAccountId,
            type: movType,
            amount: movAmount,
            currency: movCurrency,
            description: `Baixa: ${tx.description}${convDesc}`,
            date: batchBaixaDate,
            userId: user?.id,
            userName: user?.name,
            createdAt: new Date().toISOString(),
          });
          if (acc) {
            const delta = movType === 'entrada' ? movAmount : -movAmount;
            await updateData('bankAccounts', acc.id, { currentBalance: acc.currentBalance + delta } as any);
          }
        }

        const acc = bankAccounts.find(a => a.id === batchBaixaBankAccountId);
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
          bankAccountId: batchBaixaBankAccountId || '',
          bankAccountName: acc?.name || '',
          userId: user?.id || '',
          userName: user?.name || '',
          date: batchBaixaDate,
          createdAt: new Date().toISOString(),
        });
      }
      setShowBatchBaixaModal(false);
      setSelectedIds(new Set());
      load();
    } finally { setSaving(false); }
  };

  // Installment state
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installmentDaysInterval, setInstallmentDaysInterval] = useState(30);
  const [installmentFixedDay, setInstallmentFixedDay] = useState(false);
  const [installmentPreviews, setInstallmentPreviews] = useState<InstallmentPreview[]>([]);
  const [amountMode, setAmountMode] = useState<'total' | 'parcela'>('total');

  // Generate contract state
  const [generateContract, setGenerateContract] = useState(false);
  const [contractDescription, setContractDescription] = useState('');
  const [contractTerms, setContractTerms] = useState('');
  const [contractInterestRate, setContractInterestRate] = useState(0);
  const [contractLateFee, setContractLateFee] = useState(0);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(monthEnd());
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const load = () => {
    refreshTransactions();
    setActiveCurrencies(getUIShownCurrencies());
  };
  useEffect(() => { load(); }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) setShowModal(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  // Close client dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredClientsForSearch = useMemo(() => {
    if (!clientSearch) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clients, clientSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyTransaction, currency: activeCurrencies[0] || 'BRL' });
    setIsInstallment(false);
    setInstallmentCount(2);
    setInstallmentDaysInterval(30);
    setInstallmentFixedDay(false);
    setInstallmentPreviews([]);
    setAmountMode('total');
    setClientSearch('');
    setAmountText('');
    setGenerateContract(false);
    setContractDescription('');
    setContractTerms('');
    setContractInterestRate(0);
    setContractLateFee(0);
    setShowModal(true);
  };
  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setForm({ ...tx });
    setIsInstallment(false);
    setInstallmentPreviews([]);
    setClientSearch(clients.find(c => c.id === tx.clientId)?.name || '');
    setAmountText(tx.amount ? String(tx.amount).replace('.', ',') : '');
    setGenerateContract(false);
    setShowModal(true);
  };

  // Generate installment previews
  const generateInstallments = () => {
    if (!form.amount || installmentCount < 2) return;

    let perInstallment: number;
    let remainder = 0;

    if (amountMode === 'total') {
      // Valor total: dividir pelas parcelas
      perInstallment = Math.floor((form.amount / installmentCount) * 100) / 100;
      remainder = Math.round((form.amount - perInstallment * installmentCount) * 100) / 100;
    } else {
      // Valor da parcela: cada parcela tem o mesmo valor informado
      perInstallment = form.amount;
    }

    const previews: InstallmentPreview[] = [];
    const startDate = new Date(form.dueDate + 'T12:00:00');

    for (let i = 0; i < installmentCount; i++) {
      let dueDate: Date;
      if (installmentFixedDay) {
        const targetDay = startDate.getDate();
        const baseMonth = startDate.getMonth() + i;
        const targetYear = startDate.getFullYear() + Math.floor(baseMonth / 12);
        const actualMonth = ((baseMonth % 12) + 12) % 12;
        const maxDay = new Date(targetYear, actualMonth + 1, 0).getDate();
        dueDate = new Date(targetYear, actualMonth, Math.min(targetDay, maxDay), 12, 0, 0);
      } else {
        dueDate = new Date(startDate);
        dueDate.setDate(startDate.getDate() + i * installmentDaysInterval);
      }
      const dayWasAdjusted = installmentFixedDay && i > 0 && dueDate.getDate() !== startDate.getDate();
      const [y, m, d] = [dueDate.getFullYear(), String(dueDate.getMonth() + 1).padStart(2, '0'), String(dueDate.getDate()).padStart(2, '0')];
      
      previews.push({
        number: i + 1,
        amount: (amountMode === 'total' && i === 0) ? perInstallment + remainder : perInstallment,
        dueDate: `${y}-${m}-${d}`,
        dayAdjusted: dayWasAdjusted,
        originalDay: dayWasAdjusted ? startDate.getDate() : undefined,
      });
    }
    setInstallmentPreviews(previews);
  };

  useEffect(() => {
    if (isInstallment && form.amount > 0 && installmentCount >= 2) {
      generateInstallments();
    } else {
      setInstallmentPreviews([]);
    }
  }, [isInstallment, installmentCount, installmentDaysInterval, installmentFixedDay, form.amount, form.dueDate, amountMode]);

  const updateInstallmentDate = (index: number, newDate: string) => {
    setInstallmentPreviews(prev => prev.map((p, i) => i === index ? { ...p, dueDate: newDate } : p));
  };

  const handleSave = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    try {
      let lastResult: any;
      const createdTxIds: string[] = [];
      let installmentGroupId: string | undefined;

      if (isInstallment && installmentPreviews.length > 0) {
        const groupId = crypto.randomUUID();
        installmentGroupId = groupId;
        for (const inst of installmentPreviews) {
          const txId = crypto.randomUUID();
          createdTxIds.push(txId);
          lastResult = await addData('transactions', {
            ...form,
            id: txId,
            amount: inst.amount,
            dueDate: inst.dueDate,
            installments: installmentCount,
            currentInstallment: inst.number,
            installmentGroupId: groupId,
            description: `${form.description} (${inst.number}/${installmentCount})`,
            createdAt: new Date().toISOString(),
          } as Transaction);
        }
      } else if (editing) {
        lastResult = await updateData('transactions', editing.id, form);
      } else {
        const txId = crypto.randomUUID();
        createdTxIds.push(txId);
        lastResult = await addData('transactions', { ...form, id: txId, createdAt: new Date().toISOString() } as Transaction);
      }

      // Generate contract if enabled and client is selected
      if (generateContract && form.clientId && !editing) {
        const totalAmount = isInstallment && installmentPreviews.length > 0
          ? installmentPreviews.reduce((s, p) => s + p.amount, 0)
          : form.amount;
        const lastDue = isInstallment && installmentPreviews.length > 0
          ? installmentPreviews[installmentPreviews.length - 1].dueDate
          : form.dueDate;

        await addData('contracts', {
          id: crypto.randomUUID(),
          clientId: form.clientId,
          amount: totalAmount,
          currency: form.currency,
          startDate: form.dueDate,
          endDate: lastDue,
          installments: isInstallment ? installmentCount : 1,
          description: contractDescription || form.description,
          terms: contractTerms || undefined,
          interestRate: contractInterestRate || undefined,
          lateFeePercent: contractLateFee || undefined,
          transactionIds: createdTxIds,
          installmentGroupId: installmentGroupId,
          status: 'aguardando_assinatura',
          createdAt: new Date().toISOString(),
        } as Contract);
      }

      if (lastResult) showSyncResult(lastResult);
      setShowModal(false);
      load();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setSaving(true);
    try {
      await processDeleteTransaction(deleteTarget);
      showSyncResult({ error: null } as any, 'Movimentação excluída');
      setDeleteTarget(null);
      load();
    } finally { setSaving(false); }
  };

  const handleBaixa = (tx: Transaction) => {
    setBaixaTx(tx);
    setBaixaBankAccountId('');
    setBaixaDate(new Date().toISOString().split('T')[0]);
    setShowBaixaModal(true);
  };

  const confirmBaixa = async () => {
    if (!baixaTx) return;
    setSaving(true);
    try {
      const result = await updateData('transactions', baixaTx.id, {
        status: 'pago',
        paidAt: baixaDate,
        bankAccountId: baixaBankAccountId || undefined,
      } as any);

      // Register cash movement and update bank balance (with currency conversion)
      if (baixaBankAccountId) {
        const acc = bankAccounts.find(a => a.id === baixaBankAccountId);
        const movType = (baixaTx.type === 'receita' || baixaTx.type === 'investimento') ? 'entrada' : 'saida';
        const conv = acc ? convertAmount(baixaTx.amount, baixaTx.currency, acc.currency) : null;
        const movAmount = conv ? conv.convertedAmount : baixaTx.amount;
        const movCurrency = acc ? acc.currency : baixaTx.currency;
        const convDesc = conv && conv.wasConverted ? conversionDescription(conv) : '';

        await addData('cashMovements', {
          id: crypto.randomUUID(),
          transactionId: baixaTx.id,
          bankAccountId: baixaBankAccountId,
          type: movType,
          amount: movAmount,
          currency: movCurrency,
          description: `Baixa: ${baixaTx.description}${convDesc}`,
          date: baixaDate,
          userId: user?.id,
          userName: user?.name,
          createdAt: new Date().toISOString(),
        });
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

      if (result) showSyncResult(result, 'Baixa realizada com sucesso');
      setShowBaixaModal(false);
      // Show receipt
      setReceiptData({
        transaction: { ...baixaTx, status: 'pago', paidAt: baixaDate, bankAccountId: baixaBankAccountId || undefined } as Transaction,
        client: clients.find(c => c.id === baixaTx.clientId) || null,
        bankAccount: bankAccounts.find(a => a.id === baixaBankAccountId) || null,
        paidDate: baixaDate,
        userName: user?.name || '',
      });
      load();
    } finally { setSaving(false); }
  };

  const clearFilters = () => {
    setDateFrom(monthStart());
    setDateTo(monthEnd());
    setFilterStatus('');
    setFilterClient('');
    setFilterCategory('');
  };

  const hasActiveFilters = Boolean(filterStatus || filterClient || filterCategory || dateFrom !== monthStart() || dateTo !== monthEnd());

  const currencyLabel: Record<string, string> = { BRL: '🇧🇷 BRL', PYG: '🇵🇾 PYG', USD: '🇺🇸 USD' };
  const currencyLabelPdf: Record<string, string> = { BRL: '[BRL]', PYG: '[PYG]', USD: '[USD]' };

  const exportCSV = (txList: Transaction[]) => {
    const headers = [t('fin_description'), t('fin_type'), t('fin_category'), t('fin_client'), t('fin_currency'), t('fin_value'), t('fin_status'), t('fin_due_date')];
    const rows = txList.map((tx) => [
      tx.description, t(`fin_type_${tx.type}` as any), tx.category, clientName(tx.clientId),
      currencyLabel[tx.currency] || tx.currency, formatCurrency(tx.amount, tx.currency), t(`fin_status_${tx.status}` as any), formatDate(tx.dueDate),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `financeiro_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const exportInstallmentsPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Cronograma de Parcelas', 14, 18);
    doc.setFontSize(10);
    doc.text(`Descrição: ${form.description || '-'}`, 14, 26);
    doc.text(`Moeda: ${form.currency}`, 14, 32);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 38);

    const total = installmentPreviews.reduce((s, p) => s + p.amount, 0);

    autoTable(doc, {
      startY: 44,
      head: [['Parcela', 'Valor', 'Vencimento', 'Obs']],
      body: installmentPreviews.map((inst) => [
        `${inst.number}/${installmentCount}`,
        formatCurrency(inst.amount, form.currency),
        formatDate(inst.dueDate),
        inst.dayAdjusted ? `Dia ajustado (original: ${inst.originalDay})` : '',
      ]),
      foot: [['Total', formatCurrency(total, form.currency), '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [50, 50, 50] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    });

    doc.save(`parcelas_${form.description || 'cronograma'}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportPDF = (txList: Transaction[]) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16); doc.text(t('fin_title'), 14, 18);
    doc.setFontSize(9); doc.text(`${t('fin_filter_date_from')}: ${dateFrom}  ${t('fin_filter_date_to')}: ${dateTo}`, 14, 25);
    const headers = [[t('fin_description'), t('fin_type'), t('fin_category'), t('fin_client'), t('fin_currency'), t('fin_value'), t('fin_status'), t('fin_due_date')]];
    const rows = txList.map((tx) => [
      tx.description, t(`fin_type_${tx.type}` as any), tx.category, clientName(tx.clientId),
      currencyLabelPdf[tx.currency] || tx.currency, formatCurrency(tx.amount, tx.currency), t(`fin_status_${tx.status}` as any), formatDate(tx.dueDate),
    ]);
    autoTable(doc, { head: headers, body: rows, startY: 30, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [30, 58, 95], textColor: 255 }, alternateRowStyles: { fillColor: [245, 247, 250] } });

    // Totalizadores por moeda no rodapé
    const totals: Record<string, { receita: number; despesa: number; investimento: number; retirada: number }> = {};
    txList.forEach((tx) => {
      if (!totals[tx.currency]) totals[tx.currency] = { receita: 0, despesa: 0, investimento: 0, retirada: 0 };
      totals[tx.currency][tx.type] += tx.amount;
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 40;
    let footerY = finalY + 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Totais por Moeda', 14, footerY);
    footerY += 8;

    const footerHeaders = [['Moeda', 'Receitas', 'Despesas', 'Investimentos', 'Retiradas', 'Saldo']];
    const footerRows = Object.entries(totals).map(([currency, t]) => {
      const saldo = t.receita - t.despesa - t.retirada;
      return [
        currencyLabelPdf[currency] || currency,
        formatCurrency(t.receita, currency as any),
        formatCurrency(t.despesa, currency as any),
        formatCurrency(t.investimento, currency as any),
        formatCurrency(t.retirada, currency as any),
        formatCurrency(saldo, currency as any),
      ];
    });

    autoTable(doc, {
      head: footerHeaders,
      body: footerRows,
      startY: footerY,
      styles: { fontSize: 9, cellPadding: 3, fontStyle: 'bold' },
      headStyles: { fillColor: [40, 80, 120], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 245, 250] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });

    doc.save(`financeiro_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (dateFrom && tx.dueDate < dateFrom) return false;
      if (dateTo && tx.dueDate > dateTo) return false;
      if (filterStatus && tx.status !== filterStatus) return false;
      if (filterClient && tx.clientId !== filterClient) return false;
      if (filterCategory && tx.category !== filterCategory) return false;
      return true;
    }).sort((a, b) => {
      // Sort by due date ascending (earliest first), then by description for installment order
      const dateCmp = a.dueDate.localeCompare(b.dueDate);
      if (dateCmp !== 0) return dateCmp;
      return a.description.localeCompare(b.description);
    });
  }, [transactions, dateFrom, dateTo, filterStatus, filterClient, filterCategory]);

  const txByCurrency = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    activeCurrencies.forEach((c) => { map[c] = []; });
    map['all'] = filteredTransactions;
    filteredTransactions.forEach((tx) => { if (map[tx.currency]) map[tx.currency].push(tx); });
    return map;
  }, [filteredTransactions, activeCurrencies]);

  const clientName = (id?: string) => clients.find((c) => c.id === id)?.name || '—';
  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";
  const filterSelectClass = "border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  const computeSummary = (txList: Transaction[], currency?: Currency) => {
    const displayCurrency = currency || activeCurrencies[0];

    // When showing "all" currencies (no specific currency), convert to primary using exchange rates
    const getAmount = (tx: Transaction): number => {
      if (currency || tx.currency === displayCurrency) return tx.amount;
      return convertAmount(tx.amount, tx.currency, displayCurrency).convertedAmount;
    };

    const invested = txList.filter((t) => t.type === 'investimento' && t.status === 'pago').reduce((s, t) => s + getAmount(t), 0);
    const revenue = txList.filter((t) => (t.type === 'receita' || t.type === 'investimento') && t.status === 'pago').reduce((s, t) => s + getAmount(t), 0);
    const expenses = txList.filter((t) => (t.type === 'despesa' || t.type === 'retirada') && t.status === 'pago').reduce((s, t) => s + getAmount(t), 0);
    const toReceive = txList.filter((t) => (t.type === 'receita' || t.type === 'investimento') && t.status !== 'pago').reduce((s, t) => s + getAmount(t), 0);
    const toPay = txList.filter((t) => (t.type === 'despesa' || t.type === 'retirada') && t.status !== 'pago').reduce((s, t) => s + getAmount(t), 0);
    const pending = txList.filter((t) => t.status === 'pendente').reduce((s, t) => s + getAmount(t), 0);
    return { invested, revenue, expenses, balance: revenue - expenses, pending, toReceive, toPay, displayCurrency };
  };

  const renderSummary = (txList: Transaction[], currency?: Currency) => {
    const s = computeSummary(txList, currency);
    const cards = [
      { label: t('fin_summary_revenue'), value: formatCurrency(s.revenue, s.displayCurrency), icon: ArrowUpRight, color: 'text-success' },
      { label: t('fin_summary_expenses'), value: formatCurrency(s.expenses, s.displayCurrency), icon: ArrowDownRight, color: 'text-destructive' },
      { label: 'A Receber', value: formatCurrency(s.toReceive, s.displayCurrency), icon: Clock, color: 'text-warning' },
      { label: 'A Pagar', value: formatCurrency(s.toPay, s.displayCurrency), icon: Clock, color: 'text-destructive' },
      { label: t('fin_summary_balance'), value: formatCurrency(s.balance, s.displayCurrency), icon: Wallet, color: s.balance >= 0 ? 'text-success' : 'text-destructive' },
    ];
    return (
      <div className="space-y-3 mb-4">
        {currency && (
          <div className="flex items-center gap-2">
            <CurrencyFlag currency={currency} size="md" showCode={true} showLabel={true} />
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="bg-card rounded-lg p-4 card-shadow border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <c.icon size={18} className={c.color} />
              </div>
              <p className="text-body font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTabContent = (txList: Transaction[], currency?: Currency) => (
    <>
      {renderSummary(txList, currency)}
      {renderTableInner(txList)}
    </>
  );

  const renderTableInner = (txList: Transaction[]) => {
    const allSelected = txList.length > 0 && txList.every(tx => selectedIds.has(tx.id));
    const someSelected = txList.some(tx => selectedIds.has(tx.id));

    return (
    <div className="bg-card rounded-lg card-shadow border border-border overflow-x-auto">
      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-secondary/10 border-b border-border animate-fade-in">
          <span className="text-body-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <div className="flex items-center gap-2 ml-auto">
            {selectedPendentes.length > 0 && (
              <button onClick={handleBatchBaixa} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success text-body-sm font-medium hover:bg-success/20 transition-colors disabled:opacity-50">
                <CheckCircle size={14} /> Baixar ({selectedPendentes.length})
              </button>
            )}
            {canDeleteFin('financeiro') && (
              <button onClick={handleBatchDelete} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-body-sm font-medium hover:bg-destructive/20 transition-colors disabled:opacity-50">
                <Trash2 size={14} /> Excluir ({selectedIds.size})
              </button>
            )}
            <button onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors" title="Limpar seleção">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {txList.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-body-sm">{t('fin_no_results')}</div>
      ) : (
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-3 w-10">
                <button onClick={() => toggleSelectAll(txList)} className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground">
                  {allSelected ? <CheckSquare size={16} className="text-secondary" /> : someSelected ? <CheckSquare size={16} className="text-secondary/50" /> : <Square size={16} />}
                </button>
              </th>
              <th className="text-left p-3 font-medium text-muted-foreground">{t('fin_description')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground">{t('fin_category')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">{t('fin_client')}</th>
              <th className="text-right p-3 font-medium text-muted-foreground">{t('fin_value')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground hidden sm:table-cell">{t('fin_status')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">{t('fin_due_date')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground">{t('fin_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {txList.map((tx) => {
              const isSelected = selectedIds.has(tx.id);
              return (
              <tr key={tx.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? 'bg-secondary/5' : ''}`}>
                <td className="p-3">
                  <button onClick={() => toggleSelect(tx.id)} className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground">
                    {isSelected ? <CheckSquare size={16} className="text-secondary" /> : <Square size={16} />}
                  </button>
                </td>
                <td className="p-3">
                  <span className="font-medium">{tx.description}</span>
                  <span className="block text-xs text-muted-foreground capitalize">{t(`fin_type_${tx.type}` as any)}</span>
                </td>
                <td className="p-3 text-muted-foreground">{tx.category}</td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">{clientName(tx.clientId)}</td>
                <td className="p-3 text-right font-semibold">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <CurrencyFlag currency={tx.currency} size="sm" showCode={false} />
                    {formatCurrency(tx.amount, tx.currency)}
                  </span>
                </td>
                <td className="p-3 text-center hidden sm:table-cell">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusColor(tx.status)}`}>
                    {t(`fin_status_${tx.status}` as any)}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground hidden lg:table-cell">{formatDate(tx.dueDate)}</td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    {tx.status !== 'pago' && (
                      <button onClick={() => handleBaixa(tx)} className="p-1.5 rounded hover:bg-success/10 text-success transition-colors" title="Dar baixa">
                        <CheckCircle size={16} />
                      </button>
                    )}
                    {tx.status === 'pago' && (
                      <button onClick={() => setReceiptData({
                        transaction: tx,
                        client: clients.find(c => c.id === tx.clientId) || null,
                        bankAccount: bankAccounts.find(a => a.id === tx.bankAccountId) || null,
                        paidDate: tx.paidAt || tx.dueDate,
                        userName: user?.name || '',
                      })} className="p-1.5 rounded hover:bg-accent transition-colors" title="Reimprimir comprovante">
                        <Printer size={16} />
                      </button>
                    )}
                    {canEditFin('financeiro') && <button onClick={() => openEdit(tx)} className="p-1.5 rounded hover:bg-accent transition-colors"><Pencil size={16} /></button>}
                    {canDeleteFin('financeiro') && <button onClick={() => setDeleteTarget(tx)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={16} /></button>}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
    );
  };

  // Local string state for amount input to allow natural decimal typing
  const [amountText, setAmountText] = useState('');

  const handleAmountChange = (value: string) => {
    // Allow digits, comma, dot
    const cleaned = value.replace(/[^0-9.,]/g, '');
    setAmountText(cleaned);
    const normalized = cleaned.replace(',', '.');
    const num = parseFloat(normalized);
    setForm((prev) => ({ ...prev, amount: isNaN(num) ? 0 : num }));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">{t('fin_title')}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(filteredTransactions)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-body-sm font-medium border border-border hover:bg-accent transition-colors" title={t('fin_export_csv')}>
            <Download size={16} /> CSV
          </button>
          <button onClick={() => exportPDF(filteredTransactions)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-body-sm font-medium border border-border hover:bg-accent transition-colors" title={t('fin_export_pdf')}>
            <FileText size={16} /> PDF
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm font-medium border transition-colors ${showFilters || hasActiveFilters ? 'bg-secondary text-secondary-foreground border-secondary' : 'border-border hover:bg-accent'}`}>
            <Filter size={16} />
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-warning" />}
          </button>
          {canEditFin('financeiro') && (
            <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
              <Plus size={18} /> {t('fin_new')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-card rounded-lg p-4 card-shadow border border-border animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('fin_filter_date_from')}</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={filterSelectClass + ' w-full'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('fin_filter_date_to')}</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={filterSelectClass + ' w-full'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('fin_status')}</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={filterSelectClass + ' w-full'}>
                <option value="">{t('fin_filter_all_status')}</option>
                <option value="pendente">{t('fin_status_pendente')}</option>
                <option value="pago">{t('fin_status_pago')}</option>
                <option value="atrasado">{t('fin_status_atrasado')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('fin_client')}</label>
              <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className={filterSelectClass + ' w-full'}>
                <option value="">{t('fin_filter_all_clients')}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('fin_category')}</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={filterSelectClass + ' w-full'}>
                <option value="">{t('fin_filter_all_categories')}</option>
                {[...new Set(categories.map((c) => c.name))].map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {hasActiveFilters && (
              <div>
                <button onClick={clearFilters} className="w-full px-3 py-2 rounded-lg text-body-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors">
                  {t('fin_clear_filters')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Consolidated Summary - multi-currency converted to primary */}
      {activeCurrencies.length > 1 && (() => {
        const data = getAppData();
        const company = data.settings.company;
        const primaryCurrency = activeCurrencies[0];
        const rates = company.exchangeRates || [];

        const convert = (amount: number, currency: Currency) => convertAmount(amount, currency, primaryCurrency).convertedAmount;

        const txs = filteredTransactions;
        const totalRevenue = txs.filter(t => (t.type === 'receita' || t.type === 'investimento') && t.status === 'pago').reduce((s, t) => s + convert(t.amount, t.currency), 0);
        const totalExpenses = txs.filter(t => (t.type === 'despesa' || t.type === 'retirada') && t.status === 'pago').reduce((s, t) => s + convert(t.amount, t.currency), 0);
        const totalToReceive = txs.filter(t => (t.type === 'receita' || t.type === 'investimento') && t.status !== 'pago').reduce((s, t) => s + convert(t.amount, t.currency), 0);
        const totalToPay = txs.filter(t => (t.type === 'despesa' || t.type === 'retirada') && t.status !== 'pago').reduce((s, t) => s + convert(t.amount, t.currency), 0);
        const balance = totalRevenue - totalExpenses;

        const consolidatedCards = [
          { label: t('fin_summary_revenue'), value: formatCurrency(totalRevenue, primaryCurrency), icon: ArrowUpRight, color: 'text-success' },
          { label: t('fin_summary_expenses'), value: formatCurrency(totalExpenses, primaryCurrency), icon: ArrowDownRight, color: 'text-destructive' },
          { label: 'A Receber', value: formatCurrency(totalToReceive, primaryCurrency), icon: Clock, color: 'text-warning' },
          { label: 'A Pagar', value: formatCurrency(totalToPay, primaryCurrency), icon: Clock, color: 'text-destructive' },
          { label: t('fin_summary_balance'), value: formatCurrency(balance, primaryCurrency), icon: Wallet, color: balance >= 0 ? 'text-success' : 'text-destructive' },
        ];

        // Build active rate pairs for display
        const activeRatePairs = activeCurrencies
          .filter(c => c !== primaryCurrency)
          .map(c => {
            const pair = `${c}_${primaryCurrency}`;
            const rate = getExchangeRate(c, primaryCurrency);
            const found = rates.find((r: any) => r.pair === pair || r.pair === `${primaryCurrency}_${c}`);
            const updatedAt = (found as any)?.updatedAt;
            return { from: c, to: primaryCurrency, rate, updatedAt };
          });

        // Build per-currency breakdown
        const currencyBreakdown = activeCurrencies
          .filter(c => c !== primaryCurrency)
          .map(c => {
            const ctxs = txs.filter(t => t.currency === c);
            const originalTotal = ctxs.reduce((s, t) => s + t.amount, 0);
            const convertedTotal = ctxs.reduce((s, t) => s + convert(t.amount, t.currency), 0);
            return { currency: c, count: ctxs.length, originalTotal, convertedTotal, rate: getExchangeRate(c, primaryCurrency) };
          })
          .filter(b => b.count > 0);

        return (
          <div className="bg-card rounded-xl p-5 card-shadow border-2 border-secondary/30 space-y-4">
            <h2 className="text-title-section font-bold flex items-center gap-2">
              <RefreshCw size={18} className="text-secondary" />
              Consolidado (convertido para <CurrencyFlag currency={primaryCurrency} size="sm" />)
            </h2>

            {/* Exchange rates used */}
            <div className="flex flex-wrap gap-3">
              {activeRatePairs.map(r => (
                <div key={r.from} className="inline-flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 border border-border/50 text-xs">
                  <CurrencyFlag currency={r.from} size="sm" />
                  <span className="text-muted-foreground">→</span>
                  <CurrencyFlag currency={r.to} size="sm" />
                  <span className="font-semibold">{r.rate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                  {r.updatedAt && (
                    <span className="text-muted-foreground/60 text-[10px]">
                      ({new Date(r.updatedAt).toLocaleDateString('pt-BR')})
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {consolidatedCards.map((c) => (
                <div key={c.label} className="bg-accent/30 rounded-lg p-4 border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <c.icon size={18} className={c.color} />
                  </div>
                  <p className="text-body font-bold">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Conversion breakdown per currency */}
            {currencyBreakdown.length > 0 && (
              <div className="border-t border-border/50 pt-3">
                <p className="text-xs text-muted-foreground font-medium mb-2">Detalhamento da conversão</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {currencyBreakdown.map(b => (
                    <div key={b.currency} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 border border-border/30 text-xs">
                      <div className="flex items-center gap-2">
                        <CurrencyFlag currency={b.currency} size="sm" showCode />
                        <span className="text-muted-foreground">({b.count} lançam.)</span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground">{formatCurrency(b.originalTotal, b.currency as Currency)}</span>
                        <span className="mx-1.5 text-muted-foreground/50">→</span>
                        <span className="font-semibold">{formatCurrency(b.convertedTotal, primaryCurrency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Currency Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-muted">
          <TabsTrigger value="all" className="gap-1.5">
            {t('fin_all_currencies')} <span className="text-xs text-muted-foreground">({txByCurrency['all']?.length || 0})</span>
          </TabsTrigger>
          {activeCurrencies.map((c) => (
            <TabsTrigger key={c} value={c} className="gap-1.5">
              <CurrencyFlag currency={c} size="sm" showCode={true} showLabel={false} />
              <span className="text-xs text-muted-foreground">({txByCurrency[c]?.length || 0})</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="all" className="mt-4">{renderTabContent(txByCurrency['all'] || [])}</TabsContent>
        {activeCurrencies.map((c) => (
          <TabsContent key={c} value={c} className="mt-4">{renderTabContent(txByCurrency[c] || [], c)}</TabsContent>
        ))}
      </Tabs>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? t('fin_edit') : t('fin_new')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">{t('fin_type')}</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className={inputClass}>
                  <option value="investimento">{t('fin_type_investimento')}</option>
                  <option value="despesa">{t('fin_type_despesa')}</option>
                  <option value="receita">{t('fin_type_receita')}</option>
                  <option value="retirada">{t('fin_type_retirada')}</option>
                </select>
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">{t('fin_description')}</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('fin_value')}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountText}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0,00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('fin_currency')}</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as any })} className={inputClass}>
                    {activeCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('fin_category')}</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                    <option value="">{t('fin_select')}</option>
                    {categories.filter((c) => c.type === form.type).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                {/* Searchable client dropdown */}
                <div ref={clientDropdownRef} className="relative">
                  <label className="block text-body-sm font-medium mb-1">{t('fin_client')}</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setShowClientDropdown(true);
                        if (!e.target.value) setForm({ ...form, clientId: '' });
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder={t('fin_search_client')}
                      className={inputClass + ' pl-8'}
                    />
                  </div>
                  {showClientDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setForm({ ...form, clientId: '' }); setClientSearch(''); setShowClientDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-body-sm hover:bg-accent transition-colors text-muted-foreground"
                      >
                        {t('fin_none')}
                      </button>
                      {filteredClientsForSearch.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setForm({ ...form, clientId: c.id }); setClientSearch(c.name); setShowClientDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-body-sm hover:bg-accent transition-colors ${form.clientId === c.id ? 'bg-secondary/10 font-medium' : ''}`}
                        >
                          {c.name}
                        </button>
                      ))}
                      {filteredClientsForSearch.length === 0 && (
                        <p className="px-3 py-2 text-body-sm text-muted-foreground">{t('cli_no_transactions')}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('fin_due_date')}</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('fin_status')}</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={inputClass}>
                    <option value="pendente">{t('fin_status_pendente')}</option>
                    <option value="pago">{t('fin_status_pago')}</option>
                    <option value="atrasado">{t('fin_status_atrasado')}</option>
                  </select>
                </div>
              </div>

              {/* Installment toggle */}
              {!editing && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-medium">{t('fin_installment_toggle')}</span>
                    </div>
                    <button onClick={() => setIsInstallment(!isInstallment)} className="flex items-center gap-2 transition-colors">
                      {isInstallment ? <ToggleRight size={32} className="text-secondary" /> : <ToggleLeft size={32} className="text-muted-foreground" />}
                    </button>
                  </div>

                  {isInstallment && (
                    <div className="space-y-3">
                      {/* Amount mode selector */}
                      <div>
                        <label className="block text-body-sm font-medium mb-1.5">O valor informado é:</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setAmountMode('total')}
                            className={`px-3 py-2 rounded-lg text-body-sm font-medium border transition-colors ${
                              amountMode === 'total'
                                ? 'bg-secondary text-secondary-foreground border-secondary'
                                : 'border-border hover:bg-accent'
                            }`}
                          >
                            💰 Valor Total
                          </button>
                          <button
                            type="button"
                            onClick={() => setAmountMode('parcela')}
                            className={`px-3 py-2 rounded-lg text-body-sm font-medium border transition-colors ${
                              amountMode === 'parcela'
                                ? 'bg-secondary text-secondary-foreground border-secondary'
                                : 'border-border hover:bg-accent'
                            }`}
                          >
                            📋 Valor da Parcela
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {amountMode === 'total'
                            ? `${formatCurrency(form.amount, form.currency)} ÷ ${installmentCount} = ${formatCurrency(installmentCount > 0 ? form.amount / installmentCount : 0, form.currency)}/parcela`
                            : `${formatCurrency(form.amount, form.currency)} × ${installmentCount} = ${formatCurrency(form.amount * installmentCount, form.currency)} total`}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-body-sm font-medium mb-1">{t('fin_installment_count')}</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={installmentCount || ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              setInstallmentCount(raw ? parseInt(raw) : 0);
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-body-sm font-medium mb-1">{t('fin_installment_days_interval')}</label>
                          <select value={installmentDaysInterval} onChange={(e) => setInstallmentDaysInterval(Number(e.target.value))} className={inputClass}>
                            <option value={7}>7 {t('fin_installment_days')}</option>
                            <option value={10}>10 {t('fin_installment_days')}</option>
                            <option value={15}>15 {t('fin_installment_days')}</option>
                            <option value={20}>20 {t('fin_installment_days')}</option>
                            <option value={30}>30 {t('fin_installment_days')}</option>
                            <option value={45}>45 {t('fin_installment_days')}</option>
                            <option value={60}>60 {t('fin_installment_days')}</option>
                            <option value={90}>90 {t('fin_installment_days')}</option>
                          </select>
                        </div>
                      </div>

                      {/* Fixed day toggle */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                        <button
                          type="button"
                          onClick={() => setInstallmentFixedDay(!installmentFixedDay)}
                          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${installmentFixedDay ? 'bg-secondary' : 'bg-border'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${installmentFixedDay ? 'translate-x-5' : ''}`} />
                        </button>
                        <div>
                          <p className="text-body-sm font-medium">Manter mesmo dia do mês</p>
                          <p className="text-xs text-muted-foreground">
                            {installmentFixedDay
                              ? `Todas as parcelas vencem no dia ${new Date(form.dueDate + 'T12:00:00').getDate()} de cada mês`
                              : `Intervalo de ${installmentDaysInterval} dias entre parcelas`}
                          </p>
                        </div>
                      </div>

                      {installmentPreviews.length > 0 && (
                        <div className="border border-border rounded-lg overflow-hidden">
                          <div className="bg-muted/50 px-3 py-2 border-b border-border">
                            <p className="text-body-sm font-semibold">{t('fin_installment_preview')}</p>
                          </div>
                          <div className="divide-y divide-border">
                            {installmentPreviews.map((inst, idx) => (
                              <div key={idx} className={`flex items-center gap-3 px-3 py-2 ${inst.dayAdjusted ? 'bg-warning/10' : ''}`}>
                                <span className="text-xs font-medium text-muted-foreground w-16">
                                  {inst.number}/{installmentCount}
                                </span>
                                <span className="text-body-sm font-semibold flex-1">
                                  {formatCurrency(inst.amount, form.currency)}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="date"
                                    value={inst.dueDate}
                                    onChange={(e) => updateInstallmentDate(idx, e.target.value)}
                                    className={`border rounded px-2 py-1 text-xs bg-background focus:ring-1 focus:ring-secondary outline-none ${inst.dayAdjusted ? 'border-warning text-warning' : 'border-border'}`}
                                  />
                                  {inst.dayAdjusted && (
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-[10px] text-warning font-medium whitespace-nowrap cursor-help">
                                            ⚠ Ajustado
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[220px] text-xs">
                                          <p>O dia {inst.originalDay} não existe neste mês. Ajustado para o dia {new Date(inst.dueDate + 'T12:00:00').getDate()}, último dia disponível.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="px-3 py-2 bg-muted/50 border-t border-border flex justify-between items-center">
                            <span className="text-body-sm font-semibold">Total</span>
                            <div className="flex items-center gap-3">
                              <span className="text-body-sm font-bold">
                                {formatCurrency(installmentPreviews.reduce((s, p) => s + p.amount, 0), form.currency)}
                              </span>
                              <button
                                type="button"
                                onClick={exportInstallmentsPDF}
                                className="flex items-center gap-1 text-[10px] text-secondary hover:text-secondary/80 font-medium"
                              >
                                <Download className="w-3 h-3" /> PDF
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Recurrence (only when not installment) */}
              {!isInstallment && (
                <div>
                  <label className="block text-body-sm font-medium mb-1">{t('fin_recurrence')}</label>
                  <select value={form.recurrence || ''} onChange={(e) => setForm({ ...form, recurrence: (e.target.value as any) || null })} className={inputClass}>
                    <option value="">{t('fin_recurrence_none')}</option>
                    <option value="semanal">{t('fin_recurrence_semanal')}</option>
                    <option value="mensal">{t('fin_recurrence_mensal')}</option>
                    <option value="anual">{t('fin_recurrence_anual')}</option>
                  </select>
                </div>
              )}

              {/* Generate Contract toggle - only for new transactions with client */}
              {!editing && form.clientId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-secondary" />
                      <span className="text-body-sm font-medium">Gerar Contrato</span>
                    </div>
                    <button onClick={() => setGenerateContract(!generateContract)} className="flex items-center gap-2 transition-colors">
                      {generateContract ? <ToggleRight size={32} className="text-secondary" /> : <ToggleLeft size={32} className="text-muted-foreground" />}
                    </button>
                  </div>

                  {generateContract && (
                    <div className="space-y-3 p-3 rounded-lg border border-secondary/30 bg-secondary/5">
                      <div>
                        <label className="block text-body-sm font-medium mb-1">Descrição do Contrato</label>
                        <input value={contractDescription} onChange={(e) => setContractDescription(e.target.value)} placeholder={form.description || 'Ex: Empréstimo pessoal'} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-body-sm font-medium mb-1">Juros % mês</label>
                          <input type="number" step="0.1" value={contractInterestRate} onChange={(e) => setContractInterestRate(Number(e.target.value))} className={inputClass} />
                        </div>
                        <div>
                          <label className="block text-body-sm font-medium mb-1">Multa atraso %</label>
                          <input type="number" step="0.1" value={contractLateFee} onChange={(e) => setContractLateFee(Number(e.target.value))} className={inputClass} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-body-sm font-medium mb-1">Termos (opcional)</label>
                        <textarea value={contractTerms} onChange={(e) => setContractTerms(e.target.value)} rows={3} placeholder="Cláusulas específicas..." className={inputClass} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? t('common_save') : generateContract ? 'Criar + Contrato' : t('common_create')} />
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Baixa Modal */}
      {showBaixaModal && baixaTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowBaixaModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-md mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">Dar Baixa</h2>
              <button onClick={() => setShowBaixaModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <p className="text-body-sm font-medium">{baixaTx.description}</p>
                <p className="text-body font-bold mt-1">{formatCurrency(baixaTx.amount, baixaTx.currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {baixaTx.type === 'receita' ? 'Recebimento' : 'Pagamento'} · Vencimento: {formatDate(baixaTx.dueDate)}
                </p>
                {(() => {
                  const selAcc = bankAccounts.find(a => a.id === baixaBankAccountId);
                  if (selAcc && selAcc.currency !== baixaTx.currency) {
                    const conv = convertAmount(baixaTx.amount, baixaTx.currency, selAcc.currency);
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        ≈ {formatCurrency(conv.convertedAmount, selAcc.currency)} (taxa: {conv.rate.toFixed(4)})
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Data do Pagamento</label>
                <input type="date" value={baixaDate} onChange={e => setBaixaDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Conta Bancária (opcional)</label>
                <select value={baixaBankAccountId} onChange={e => setBaixaBankAccountId(e.target.value)} className={inputClass}>
                  <option value="">Nenhuma</option>
                  {bankAccounts.filter(a => a.active).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={confirmBaixa} saving={saving} label={baixaTx.type === 'receita' ? 'Confirmar Recebimento' : 'Confirmar Pagamento'} />
                <button onClick={() => setShowBaixaModal(false)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Baixa Modal */}
      {showBatchBaixaModal && selectedPendentes.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowBatchBaixaModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">Baixa em Lote</h2>
              <button onClick={() => setShowBatchBaixaModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border max-h-48 overflow-y-auto space-y-2">
                {selectedPendentes.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-body-sm">
                    <span className="truncate mr-2">{tx.description}</span>
                    <span className="font-semibold shrink-0">{formatCurrency(tx.amount, tx.currency)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 mt-2 flex items-center justify-between font-bold text-body-sm">
                  <span>Total ({selectedPendentes.length} itens)</span>
                  <span>{selectedPendentes.length} movimentações</span>
                </div>
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Data do Pagamento</label>
                <input type="date" value={batchBaixaDate} onChange={e => setBatchBaixaDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Conta Bancária (opcional)</label>
                <select value={batchBaixaBankAccountId} onChange={e => setBatchBaixaBankAccountId(e.target.value)} className={inputClass}>
                  <option value="">Nenhuma</option>
                  {bankAccounts.filter(a => a.active).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={confirmBatchBaixa} saving={saving} label={`Confirmar Baixa (${selectedPendentes.length})`} />
                <button onClick={() => setShowBatchBaixaModal(false)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.description || ''}
        itemType="a movimentação"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      {receiptData && (
        <ReceiptPrint receipt={receiptData} onClose={() => setReceiptData(null)} />
      )}
    </div>
  );
}
