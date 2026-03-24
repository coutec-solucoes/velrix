import { useState, useMemo } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { getAppData } from '@/services/storageService';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Currency, Transaction, Client, BankAccount, CashMovement } from '@/types';
import CurrencyFlag from '@/components/CurrencyFlag';
import { useTranslation } from '@/hooks/useI18n';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FileText, Users, Truck, Landmark, DollarSign, BookOpen,
  Download, Calendar, ArrowUpRight, ArrowDownRight,
  TrendingUp, TrendingDown, Printer,
} from 'lucide-react';
import { convertAmount } from '@/utils/currencyConversion';

type ReportTab = 'clientes' | 'fornecedores' | 'financeiro' | 'caixa' | 'bancos';

const tabs: { key: ReportTab; label: string; icon: any }[] = [
  { key: 'clientes', label: 'Clientes', icon: Users },
  { key: 'fornecedores', label: 'Fornecedores', icon: Truck },
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { key: 'caixa', label: 'Caixa', icon: BookOpen },
  { key: 'bancos', label: 'Contas Bancárias', icon: Landmark },
];

const currencyLabelPdf: Record<string, string> = { BRL: '[BRL]', PYG: '[PYG]', USD: '[USD]' };

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '\uFEFF';
  const csv = bom + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getCompanyInfo() {
  try {
    const data = getAppData();
    return {
      name: data.settings?.company?.name || 'Empresa',
      country: data.settings?.company?.country || 'BR',
    };
  } catch {
    return { name: 'Empresa', country: 'BR' };
  }
}

function addPdfHeader(doc: jsPDF, title: string, t: any, dateFrom?: string, dateTo?: string) {
  const company = getCompanyInfo();
  const pageW = doc.internal.pageSize.getWidth();

  // Company name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, 14, 18);

  // Report title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 26);

  // Date range and generation info
  doc.setFontSize(8);
  doc.setTextColor(120);
  const periodText = dateFrom || dateTo
    ? `${t('rep_period')}: ${dateFrom ? formatDate(dateFrom) : '—'} ${t('fin_installment_of')} ${dateTo ? formatDate(dateTo) : '—'}`
    : `${t('rep_period')}: ${t('dash_period_all')}`;
  doc.text(periodText, 14, 33);
  doc.text(`${t('rep_generated_at')}: ${new Date().toLocaleDateString('pt-BR')} ${t('rep_at')} ${new Date().toLocaleTimeString('pt-BR')}`, pageW - 14, 33, { align: 'right' });

  // Divider line
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(14, 36, pageW - 14, 36);
  doc.setTextColor(0);

  return 42; // startY after header
}

function addPdfFooter(doc: jsPDF, t: any) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`${t('rep_page')} ${i} ${t('fin_installment_of')} ${pageCount}`, pageW - 14, pageH - 8, { align: 'right' });
    doc.text(getCompanyInfo().name, 14, pageH - 8);
  }
}

function printPdf(doc: jsPDF) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 1000);
  };
}

// ==================== ACTION BUTTONS ====================
function ExportButtons({ onCSV, onPDF, onPrint }: { onCSV: () => void; onPDF: () => void; onPrint: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-body-sm font-medium border border-border hover:bg-accent transition-colors" title="Exportar CSV">
        <Download size={15} /> CSV
      </button>
      <button onClick={onPDF} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:bg-secondary/90 transition-colors" title="Exportar PDF">
        <FileText size={15} /> PDF
      </button>
      <button onClick={onPrint} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-body-sm font-medium border border-border hover:bg-accent transition-colors" title="Imprimir">
        <Printer size={15} />
      </button>
    </div>
  );
}

// ==================== MAIN PAGE ====================
export default function Relatorios() {
  const [activeTab, setActiveTab] = useState<ReportTab>('clientes');
  const [transactions] = useRealtimeData('transactions');
  const [clients] = useRealtimeData('clients');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const [cashMovements] = useRealtimeData('cashMovements');
  const [cobradores] = useRealtimeData('cobradores');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cobradorId, setCobradorId] = useState('');
  const { t } = useTranslation();

  const applyFilters = <T extends { createdAt?: string; dueDate?: string; date?: string; cobradorId?: string }>(items: T[]): T[] => {
    return items.filter((item) => {
      if (cobradorId && item.cobradorId !== cobradorId) return false;
      const d = (item as any).dueDate || (item as any).date || (item as any).createdAt?.split('T')[0] || '';
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg flex items-center gap-2">
          <FileText size={24} className="text-secondary" />
          {t('menu_relatorios')}
        </h1>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-body-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.key
                ? 'border-secondary text-secondary bg-secondary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Calendar size={16} className="text-muted-foreground" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('fin_filter_date_from')}:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-card text-body-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('fin_filter_date_to')}:</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-card text-body-sm" />
        </div>
        {getAppData().settings?.cobradoresEnabled && (
          <div className="flex items-center gap-2 ml-2">
            <label className="text-xs text-muted-foreground">Cobrador:</label>
            <select value={cobradorId} onChange={(e) => setCobradorId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-border bg-card text-body-sm">
              <option value="">Todos</option>
              {cobradores.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {(dateFrom || dateTo || cobradorId) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setCobradorId(''); }} className="text-xs text-muted-foreground hover:text-foreground underline">
            {t('fin_filter_clear')}
          </button>
        )}
      </div>

      {/* Report content */}
      {activeTab === 'clientes' && <ClientesReport clients={applyFilters(clients)} transactions={applyFilters(transactions)} role="cliente" dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'fornecedores' && <ClientesReport clients={applyFilters(clients)} transactions={applyFilters(transactions)} role="fornecedor" dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'financeiro' && <FinanceiroReport transactions={applyFilters(transactions)} clients={clients} dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'caixa' && <CaixaReport movements={applyFilters(cashMovements)} transactions={transactions} bankAccounts={bankAccounts} dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'bancos' && <BancosReport bankAccounts={bankAccounts} cashMovements={applyFilters(cashMovements)} transactions={applyFilters(transactions)} dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  );
}

/* ==================== CLIENTES / FORNECEDORES ==================== */
function ClientesReport({
  clients, transactions, role, dateFrom, dateTo,
}: { clients: Client[]; transactions: Transaction[]; role: 'cliente' | 'fornecedor'; dateFrom: string; dateTo: string }) {
  const { t } = useTranslation();
  const isCliente = role === 'cliente';
  const filtered = clients.filter((c) => {
    const r = c.personRole || 'cliente';
    return r === role || r === 'ambos';
  });

  const data = useMemo(() => filtered.map((client) => {
    const txs = transactions.filter((tx) => tx.clientId === client.id);
    const paid = txs.filter((tx) => tx.status === 'pago');
    const pending = txs.filter((tx) => tx.status !== 'pago');
    const overdue = txs.filter((tx) => tx.status === 'atrasado');
    const currencies = [...new Set(txs.map((tx) => tx.currency))];
    const summary = currencies.map((cur) => {
      const curTxs = txs.filter((tx) => tx.currency === cur);
      const totalPaid = curTxs.filter((tx) => tx.status === 'pago').reduce((s, tx) => s + tx.amount, 0);
      const totalPending = curTxs.filter((tx) => tx.status !== 'pago').reduce((s, tx) => s + tx.amount, 0);
      return { currency: cur, totalPaid, totalPending, total: totalPaid + totalPending };
    });
    return { client, txs, paid, pending, overdue, summary };
  }).filter((d) => d.txs.length > 0 || true), [filtered, transactions]);

  const handleCSV = () => {
    const headers = [isCliente ? 'Cliente' : 'Fornecedor', 'Documento', 'Telefone', 'Email', 'Moeda', 'Total Pago', 'Total Pendente', 'Total Geral', 'Qtd Transações', 'Qtd Atrasadas'];
    const rows: string[][] = [];
    data.forEach((d) => {
      if (d.summary.length === 0) {
        rows.push([d.client.name, d.client.document, d.client.phone, d.client.email, '-', '0', '0', '0', '0', '0']);
      } else {
        d.summary.forEach((s) => {
          rows.push([d.client.name, d.client.document, d.client.phone, d.client.email, s.currency, s.totalPaid.toFixed(2), s.totalPending.toFixed(2), s.total.toFixed(2), String(d.txs.length), String(d.overdue.length)]);
        });
      }
    });
    exportCSV(`relatorio-${role}s`, headers, rows);
  };

  const buildPdf = () => {
    const title = isCliente ? 'Relatório de Clientes' : 'Relatório de Fornecedores';
    const doc = new jsPDF();
    let startY = addPdfHeader(doc, title, t, dateFrom, dateTo);

    // Summary totals
    const allSummary: Record<string, { paid: number; pending: number }> = {};
    data.forEach((d) => d.summary.forEach((s) => {
      if (!allSummary[s.currency]) allSummary[s.currency] = { paid: 0, pending: 0 };
      allSummary[s.currency].paid += s.totalPaid;
      allSummary[s.currency].pending += s.totalPending;
    }));

    if (Object.keys(allSummary).length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(t('rep_totals'), 14, startY);
      startY += 4;
      autoTable(doc, {
        startY,
        head: [['Moeda', 'Total Pago', 'Total Pendente', 'Total Geral']],
        body: Object.entries(allSummary).map(([cur, s]) => [
          currencyLabelPdf[cur] || cur,
          formatCurrency(s.paid, cur as Currency),
          formatCurrency(s.pending, cur as Currency),
          formatCurrency(s.paid + s.pending, cur as Currency),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      });
      startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 30;
    }

    // Detail per client
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${t('rep_details')} por ${isCliente ? t('menu_clientes') : t('menu_usuarios')} (${filtered.length})`, 14, startY);
    startY += 4;

    const detailRows: string[][] = [];
    data.forEach((d) => {
      d.txs.forEach((tx) => {
        detailRows.push([
          d.client.name,
          d.client.document,
          formatDate(tx.dueDate || tx.createdAt),
          tx.description,
          currencyLabelPdf[tx.currency] || tx.currency,
          formatCurrency(tx.amount, tx.currency),
          tx.status,
          tx.paidAt ? formatDate(tx.paidAt) : '-',
        ]);
      });
    });

    autoTable(doc, {
      startY,
      head: [[isCliente ? 'Cliente' : 'Fornecedor', 'Documento', 'Data', 'Descrição', 'Moeda', 'Valor', 'Status', 'Pago em']],
      body: detailRows.length > 0 ? detailRows : [['Nenhum registro encontrado', '', '', '', '', '', '', '']],
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 5: { halign: 'right' } },
    });

    addPdfFooter(doc, t);
    return doc;
  };

  const handlePDF = () => buildPdf().save(`relatorio-${role}s_${new Date().toISOString().split('T')[0]}.pdf`);
  const handlePrint = () => printPdf(buildPdf());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-body font-semibold">{isCliente ? 'Relatório de Clientes' : 'Relatório de Fornecedores'} ({filtered.length})</h2>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} onPrint={handlePrint} />
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('rep_no_records')}</div>
      ) : (
        <div className="space-y-3">
          {data.map(({ client, txs, paid, pending, overdue, summary }) => (
            <div key={client.id} className="bg-card rounded-xl p-5 border border-border card-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-body">{client.name}</h3>
                  <p className="text-xs text-muted-foreground">{client.document} · {client.phone} · {client.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground">{txs.length} transações</span>
                  {overdue.length > 0 && (
                    <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive">{overdue.length} atrasadas</span>
                  )}
                </div>
              </div>
              {summary.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {summary.map((s) => (
                    <div key={s.currency} className="bg-accent/30 rounded-lg p-3 border border-border/50">
                      <div className="flex items-center gap-1 mb-1">
                        <CurrencyFlag currency={s.currency} size="sm" />
                        <span className="text-xs font-medium">{s.currency}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pago</span>
                          <span className="font-medium text-success">{formatCurrency(s.totalPaid, s.currency)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Pendente</span>
                          <span className="font-medium text-warning">{formatCurrency(s.totalPending, s.currency)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-border/50 pt-1">
                          <span className="text-muted-foreground font-medium">Total</span>
                          <span className="font-bold">{formatCurrency(s.total, s.currency)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== FINANCEIRO ==================== */
function FinanceiroReport({ transactions, clients, dateFrom, dateTo }: { transactions: Transaction[]; clients: Client[]; dateFrom: string; dateTo: string }) {
  const { t } = useTranslation();
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);
  const currencies = [...new Set(transactions.map((tx) => tx.currency))];

  const summaryByCurrency = useMemo(() => currencies.map((cur) => {
    const txs = transactions.filter((tx) => tx.currency === cur);
    const receitas = txs.filter((tx) => tx.type === 'receita' || tx.type === 'investimento');
    const despesas = txs.filter((tx) => tx.type === 'despesa' || tx.type === 'retirada');
    const totalReceitas = receitas.reduce((s, tx) => s + tx.amount, 0);
    const totalDespesas = despesas.reduce((s, tx) => s + tx.amount, 0);
    const receitasPagas = receitas.filter((tx) => tx.status === 'pago').reduce((s, tx) => s + tx.amount, 0);
    const despesasPagas = despesas.filter((tx) => tx.status === 'pago').reduce((s, tx) => s + tx.amount, 0);
    const receitasPendentes = receitas.filter((tx) => tx.status !== 'pago').reduce((s, tx) => s + tx.amount, 0);
    const despesasPendentes = despesas.filter((tx) => tx.status !== 'pago').reduce((s, tx) => s + tx.amount, 0);
    return { currency: cur, totalReceitas, totalDespesas, receitasPagas, despesasPagas, receitasPendentes, despesasPendentes, saldo: totalReceitas - totalDespesas, count: txs.length };
  }), [transactions]);

  const byCategory = useMemo(() => {
    const map: Record<string, { category: string; currency: Currency; receitas: number; despesas: number }> = {};
    let primaryCurrency: Currency = 'BRL';
    try { primaryCurrency = getAppData()?.settings?.company?.activeCurrencies?.[0] || 'BRL'; } catch {}

    transactions.forEach((tx) => {
      const key = `${tx.category}_${primaryCurrency}`;
      if (!map[key]) map[key] = { category: tx.category || 'Sem categoria', currency: primaryCurrency, receitas: 0, despesas: 0 };
      
      const convAmount = convertAmount(tx.amount, tx.currency, primaryCurrency).convertedAmount;
      if (tx.type === 'receita' || tx.type === 'investimento') map[key].receitas += convAmount;
      else map[key].despesas += convAmount;
    });
    return Object.values(map).sort((a, b) => (b.receitas + b.despesas) - (a.receitas + a.despesas));
  }, [transactions]);

  const handleCSV = () => {
    const headers = ['Data', 'Tipo', 'Descrição', 'Cliente/Fornecedor', 'Categoria', 'Moeda', 'Valor', 'Status', 'Pago em', 'Método'];
    const rows = transactions
      .sort((a, b) => (a.dueDate || a.createdAt).localeCompare(b.dueDate || b.createdAt))
      .map((tx) => [
        formatDate(tx.dueDate || tx.createdAt), tx.type, tx.description, clientMap[tx.clientId || ''] || '-',
        tx.category || '-', tx.currency, tx.amount.toFixed(2), tx.status,
        tx.paidAt ? formatDate(tx.paidAt) : '-', tx.paymentMethod || '-',
      ]);
    exportCSV('relatorio-financeiro', headers, rows);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    let startY = addPdfHeader(doc, 'Relatório Financeiro', t, dateFrom, dateTo);

    // Summary per currency
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo por Moeda', 14, startY);
    startY += 4;
    autoTable(doc, {
      startY,
      head: [['Moeda', 'Receitas', 'Recebido', 'Pendente Rec.', 'Despesas', 'Pago', 'Pendente Pag.', 'Saldo']],
      body: summaryByCurrency.map((s) => [
        currencyLabelPdf[s.currency] || s.currency,
        formatCurrency(s.totalReceitas, s.currency), formatCurrency(s.receitasPagas, s.currency), formatCurrency(s.receitasPendentes, s.currency),
        formatCurrency(s.totalDespesas, s.currency), formatCurrency(s.despesasPagas, s.currency), formatCurrency(s.despesasPendentes, s.currency),
        formatCurrency(s.saldo, s.currency),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    });
    startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 30;

    // By category
    if (byCategory.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo por Categoria', 14, startY);
      startY += 4;
      autoTable(doc, {
        startY,
        head: [['Categoria', 'Moeda', 'Receitas', 'Despesas', 'Saldo']],
        body: byCategory.map((c) => [
          c.category, currencyLabelPdf[c.currency] || c.currency,
          formatCurrency(c.receitas, c.currency), formatCurrency(c.despesas, c.currency),
          formatCurrency(c.receitas - c.despesas, c.currency),
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [60, 80, 100], textColor: 255 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      });
      startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 30;
    }

    // Detail
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Detalhamento (${transactions.length} lançamentos)`, 14, startY);
    startY += 4;
    const sorted = [...transactions].sort((a, b) => (a.dueDate || a.createdAt).localeCompare(b.dueDate || b.createdAt));
    autoTable(doc, {
      startY,
      head: [['Data', 'Tipo', 'Descrição', 'Cliente/Fornecedor', 'Categoria', 'Moeda', 'Valor', 'Status', 'Pago em', 'Método']],
      body: sorted.map((tx) => [
        formatDate(tx.dueDate || tx.createdAt), tx.type, tx.description, clientMap[tx.clientId || ''] || '-',
        tx.category || '-', currencyLabelPdf[tx.currency] || tx.currency, formatCurrency(tx.amount, tx.currency),
        tx.status, tx.paidAt ? formatDate(tx.paidAt) : '-', tx.paymentMethod || '-',
      ]),
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 6: { halign: 'right' } },
    });

    addPdfFooter(doc, t);
    return doc;
  };

  const handlePDF = () => buildPdf().save(`relatorio-financeiro_${new Date().toISOString().split('T')[0]}.pdf`);
  const handlePrint = () => printPdf(buildPdf());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-body font-semibold">{t('fin_title')} ({transactions.length} {t('fin_installments').toLowerCase()})</h2>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} onPrint={handlePrint} />
      </div>

      {/* Summary cards per currency */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaryByCurrency.map((s) => (
          <div key={s.currency} className="bg-card rounded-xl p-5 border border-border card-shadow">
            <div className="flex items-center gap-2 mb-3">
              <CurrencyFlag currency={s.currency} size="sm" />
              <span className="font-semibold text-body">{s.currency}</span>
              <span className="text-xs text-muted-foreground">({s.count} lançamentos)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpRight size={12} className="text-success" /> Receitas</div>
                <p className="font-bold text-success text-body-sm">{formatCurrency(s.totalReceitas, s.currency)}</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Recebido: <span className="text-success">{formatCurrency(s.receitasPagas, s.currency)}</span></p>
                  <p>Pendente: <span className="text-warning">{formatCurrency(s.receitasPendentes, s.currency)}</span></p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownRight size={12} className="text-destructive" /> Despesas</div>
                <p className="font-bold text-destructive text-body-sm">{formatCurrency(s.totalDespesas, s.currency)}</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Pago: <span className="text-destructive">{formatCurrency(s.despesasPagas, s.currency)}</span></p>
                  <p>Pendente: <span className="text-warning">{formatCurrency(s.despesasPendentes, s.currency)}</span></p>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Saldo</span>
              <span className={`font-bold text-body ${s.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
                {s.saldo >= 0 ? <TrendingUp size={14} className="inline mr-1" /> : <TrendingDown size={14} className="inline mr-1" />}
                {formatCurrency(Math.abs(s.saldo), s.currency)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* By category */}
      {byCategory.length > 0 && (
        <div className="bg-card rounded-xl p-5 border border-border card-shadow">
          <h3 className="font-semibold text-body mb-3">{t('cat_title')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Categoria</th>
                  <th className="pb-2 font-medium">Moeda</th>
                  <th className="pb-2 font-medium text-right">Receitas</th>
                  <th className="pb-2 font-medium text-right">Despesas</th>
                  <th className="pb-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 font-medium">{c.category}</td>
                    <td className="py-2"><CurrencyFlag currency={c.currency} size="sm" /></td>
                    <td className="py-2 text-right text-success">{formatCurrency(c.receitas, c.currency)}</td>
                    <td className="py-2 text-right text-destructive">{formatCurrency(c.despesas, c.currency)}</td>
                    <td className={`py-2 text-right font-medium ${c.receitas - c.despesas >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(c.receitas - c.despesas, c.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="bg-card rounded-xl p-5 border border-border card-shadow">
        <h3 className="font-semibold text-body mb-3">{t('rep_details')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Descrição</th>
                <th className="pb-2 font-medium">Cliente/Fornecedor</th>
                <th className="pb-2 font-medium">Categoria</th>
                <th className="pb-2 font-medium text-right">Valor</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions
                .sort((a, b) => (b.dueDate || b.createdAt).localeCompare(a.dueDate || a.createdAt))
                .slice(0, 100)
                .map((tx) => (
                  <tr key={tx.id} className="border-b border-border/30">
                    <td className="py-2">{formatDate(tx.dueDate || tx.createdAt)}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tx.type === 'receita' || tx.type === 'investimento' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2 max-w-[200px] truncate">{tx.description}</td>
                    <td className="py-2 text-muted-foreground">{clientMap[tx.clientId || ''] || '-'}</td>
                    <td className="py-2 text-muted-foreground">{tx.category || '-'}</td>
                    <td className="py-2 text-right font-medium">
                      <CurrencyFlag currency={tx.currency} size="sm" /> {formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === 'pago' ? 'bg-success/10 text-success' : tx.status === 'atrasado' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {transactions.length > 100 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Mostrando os 100 mais recentes. Exporte para ver todos.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== CAIXA ==================== */
function CaixaReport({
  movements, transactions, bankAccounts, dateFrom, dateTo,
}: { movements: CashMovement[]; transactions: Transaction[]; bankAccounts: BankAccount[]; dateFrom: string; dateTo: string }) {
  const { t } = useTranslation();
  const accountMap = useMemo(() => Object.fromEntries(bankAccounts.map((a) => [a.id, a.name])), [bankAccounts]);
  const currencies = [...new Set(movements.map((m) => m.currency))];
  const summaryByCurrency = currencies.map((cur) => {
    const curMvs = movements.filter((m) => m.currency === cur);
    const entradas = curMvs.filter((m) => m.type === 'entrada').reduce((s, m) => s + m.amount, 0);
    const saidas = curMvs.filter((m) => m.type !== 'entrada').reduce((s, m) => s + m.amount, 0);
    return { currency: cur, entradas, saidas, saldo: entradas - saidas, count: curMvs.length };
  });

  const handleCSV = () => {
    const headers = ['Data', 'Tipo', 'Descrição', 'Conta', 'Moeda', 'Valor'];
    const rows = movements
      .sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt))
      .map((m) => [formatDate(m.date || m.createdAt), m.type, m.description, accountMap[m.bankAccountId || ''] || '-', m.currency, m.amount.toFixed(2)]);
    exportCSV('relatorio-caixa', headers, rows);
  };

  const buildPdf = () => {
    const doc = new jsPDF();
    let startY = addPdfHeader(doc, 'Relatório de Caixa', t, dateFrom, dateTo);

    // Summary
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo por Moeda', 14, startY);
    startY += 4;
    autoTable(doc, {
      startY,
      head: [['Moeda', 'Entradas', 'Saídas', 'Saldo', 'Qtd Mov.']],
      body: summaryByCurrency.map((s) => [
        currencyLabelPdf[s.currency] || s.currency,
        formatCurrency(s.entradas, s.currency), formatCurrency(s.saidas, s.currency),
        formatCurrency(s.saldo, s.currency), String(s.count),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 30;

    // Detail
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Movimentações (${movements.length})`, 14, startY);
    startY += 4;
    const sorted = [...movements].sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt));
    autoTable(doc, {
      startY,
      head: [['Data', 'Tipo', 'Descrição', 'Conta', 'Moeda', 'Valor']],
      body: sorted.map((m) => [
        formatDate(m.date || m.createdAt), m.type, m.description,
        accountMap[m.bankAccountId || ''] || '-', currencyLabelPdf[m.currency] || m.currency,
        `${m.type === 'entrada' ? '+' : '-'}${formatCurrency(m.amount, m.currency)}`,
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 5: { halign: 'right' } },
    });

    addPdfFooter(doc, t);
    return doc;
  };

  const handlePDF = () => buildPdf().save(`relatorio-caixa_${new Date().toISOString().split('T')[0]}.pdf`);
  const handlePrint = () => printPdf(buildPdf());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-body font-semibold">Relatório de Caixa ({movements.length} movimentações)</h2>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} onPrint={handlePrint} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryByCurrency.map((s) => (
          <div key={s.currency} className="bg-card rounded-xl p-5 border border-border card-shadow">
            <div className="flex items-center gap-2 mb-3">
              <CurrencyFlag currency={s.currency} size="sm" />
              <span className="font-semibold">{s.currency}</span>
              <span className="text-xs text-muted-foreground">({s.count} mov.)</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-body-sm">
                <span className="text-muted-foreground flex items-center gap-1"><ArrowUpRight size={12} className="text-success" /> Entradas</span>
                <span className="font-bold text-success">{formatCurrency(s.entradas, s.currency)}</span>
              </div>
              <div className="flex justify-between text-body-sm">
                <span className="text-muted-foreground flex items-center gap-1"><ArrowDownRight size={12} className="text-destructive" /> Saídas</span>
                <span className="font-bold text-destructive">{formatCurrency(s.saidas, s.currency)}</span>
              </div>
              <div className="flex justify-between text-body-sm border-t border-border/50 pt-2">
                <span className="font-medium">Saldo</span>
                <span className={`font-bold ${s.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(s.saldo, s.currency)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Movement list */}
      <div className="bg-card rounded-xl p-5 border border-border card-shadow">
        <h3 className="font-semibold text-body mb-3">Movimentações</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Descrição</th>
                <th className="pb-2 font-medium">Conta</th>
                <th className="pb-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {movements
                .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt))
                .slice(0, 100)
                .map((m) => (
                  <tr key={m.id} className="border-b border-border/30">
                    <td className="py-2">{formatDate(m.date || m.createdAt)}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.type === 'entrada' ? 'bg-success/10 text-success' : m.type === 'transferencia' ? 'bg-accent text-muted-foreground' : 'bg-destructive/10 text-destructive'}`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="py-2 max-w-[250px] truncate">{m.description}</td>
                    <td className="py-2 text-muted-foreground">{accountMap[m.bankAccountId || ''] || '-'}</td>
                    <td className={`py-2 text-right font-medium ${m.type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                      {m.type === 'entrada' ? '+' : '-'}{formatCurrency(m.amount, m.currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {movements.length > 100 && <p className="text-xs text-muted-foreground mt-2 text-center">Mostrando os 100 mais recentes.</p>}
        </div>
      </div>
    </div>
  );
}

/* ==================== CONTAS BANCÁRIAS ==================== */
function BancosReport({
  bankAccounts, cashMovements, transactions, dateFrom, dateTo,
}: { bankAccounts: BankAccount[]; cashMovements: CashMovement[]; transactions: Transaction[]; dateFrom: string; dateTo: string }) {
  const { t } = useTranslation();

  const handleCSV = () => {
    const headers = ['Conta', 'Banco', 'Tipo', 'Moeda', 'Saldo Inicial', 'Saldo Atual', 'Entradas', 'Saídas', 'Status'];
    const rows = bankAccounts.map((acc) => {
      const mvs = cashMovements.filter((m) => m.bankAccountId === acc.id);
      const entradas = mvs.filter((m) => m.type === 'entrada').reduce((s, m) => s + m.amount, 0);
      const saidas = mvs.filter((m) => m.type !== 'entrada').reduce((s, m) => s + m.amount, 0);
      return [acc.name, acc.bankName, acc.accountType, acc.currency, acc.initialBalance.toFixed(2), acc.currentBalance.toFixed(2), entradas.toFixed(2), saidas.toFixed(2), acc.active ? 'Ativa' : 'Inativa'];
    });
    exportCSV('relatorio-contas-bancarias', headers, rows);
  };

  const buildPdf = () => {
    const doc = new jsPDF();
    let startY = addPdfHeader(doc, 'Relatório de Contas Bancárias', t, dateFrom, dateTo);

    // Summary table
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Contas Bancárias (${bankAccounts.length})`, 14, startY);
    startY += 4;

    const summaryRows = bankAccounts.map((acc) => {
      const mvs = cashMovements.filter((m) => m.bankAccountId === acc.id);
      const entradas = mvs.filter((m) => m.type === 'entrada').reduce((s, m) => s + m.amount, 0);
      const saidas = mvs.filter((m) => m.type !== 'entrada').reduce((s, m) => s + m.amount, 0);
      return [
        acc.name, acc.bankName, acc.accountType,
        currencyLabelPdf[acc.currency] || acc.currency,
        formatCurrency(acc.initialBalance, acc.currency),
        formatCurrency(acc.currentBalance, acc.currency),
        formatCurrency(entradas, acc.currency),
        formatCurrency(saidas, acc.currency),
        acc.active ? 'Ativa' : 'Inativa',
      ];
    });

    autoTable(doc, {
      startY,
      head: [['Conta', 'Banco', 'Tipo', 'Moeda', 'Saldo Inicial', 'Saldo Atual', 'Entradas', 'Saídas', 'Status']],
      body: summaryRows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    });
    startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 30;

    // Totals by currency
    const totalsByCur: Record<string, { initial: number; current: number; entradas: number; saidas: number }> = {};
    bankAccounts.forEach((acc) => {
      if (!totalsByCur[acc.currency]) totalsByCur[acc.currency] = { initial: 0, current: 0, entradas: 0, saidas: 0 };
      totalsByCur[acc.currency].initial += acc.initialBalance;
      totalsByCur[acc.currency].current += acc.currentBalance;
      const mvs = cashMovements.filter((m) => m.bankAccountId === acc.id);
      totalsByCur[acc.currency].entradas += mvs.filter((m) => m.type === 'entrada').reduce((s, m) => s + m.amount, 0);
      totalsByCur[acc.currency].saidas += mvs.filter((m) => m.type !== 'entrada').reduce((s, m) => s + m.amount, 0);
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Totais por Moeda', 14, startY);
    startY += 4;
    autoTable(doc, {
      startY,
      head: [['Moeda', 'Saldo Inicial Total', 'Saldo Atual Total', 'Total Entradas', 'Total Saídas']],
      body: Object.entries(totalsByCur).map(([cur, t]) => [
        currencyLabelPdf[cur] || cur,
        formatCurrency(t.initial, cur as Currency), formatCurrency(t.current, cur as Currency),
        formatCurrency(t.entradas, cur as Currency), formatCurrency(t.saidas, cur as Currency),
      ]),
      styles: { fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
      headStyles: { fillColor: [60, 80, 100], textColor: 255 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });

    // Per-account movements detail
    bankAccounts.forEach((acc) => {
      const mvs = cashMovements.filter((m) => m.bankAccountId === acc.id);
      if (mvs.length === 0) return;
      startY = (doc as any).lastAutoTable?.finalY + 10 || startY + 30;
      if (startY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        startY = 20;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${acc.name} — ${acc.bankName} (${acc.currency})`, 14, startY);
      startY += 4;
      autoTable(doc, {
        startY,
        head: [['Data', 'Tipo', 'Descrição', 'Valor']],
        body: mvs.sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt)).map((m) => [
          formatDate(m.date || m.createdAt), m.type, m.description,
          `${m.type === 'entrada' ? '+' : '-'}${formatCurrency(m.amount, m.currency)}`,
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [80, 100, 120], textColor: 255 },
        columnStyles: { 3: { halign: 'right' } },
      });
    });

    addPdfFooter(doc, t);
    return doc;
  };

  const handlePDF = () => buildPdf().save(`relatorio-contas-bancarias_${new Date().toISOString().split('T')[0]}.pdf`);
  const handlePrint = () => printPdf(buildPdf());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-body font-semibold">Relatório de Contas Bancárias ({bankAccounts.length})</h2>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} onPrint={handlePrint} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bankAccounts.map((acc) => {
          const mvs = cashMovements.filter((m) => m.bankAccountId === acc.id);
          const entradas = mvs.filter((m) => m.type === 'entrada').reduce((s, m) => s + m.amount, 0);
          const saidas = mvs.filter((m) => m.type !== 'entrada').reduce((s, m) => s + m.amount, 0);
          const linkedTxs = transactions.filter((tx) => tx.bankAccountId === acc.id);

          return (
            <div key={acc.id} className="bg-card rounded-xl p-5 border border-border card-shadow">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-body">{acc.name}</h3>
                  <p className="text-xs text-muted-foreground">{acc.bankName} · {acc.accountType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CurrencyFlag currency={acc.currency} size="sm" />
                  <span className={`text-xs px-2 py-0.5 rounded-full ${acc.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {acc.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-accent/30 rounded-lg p-3">
                  <span className="text-xs text-muted-foreground">Saldo Inicial</span>
                  <p className="font-semibold text-body-sm">{formatCurrency(acc.initialBalance, acc.currency)}</p>
                </div>
                <div className="bg-accent/30 rounded-lg p-3">
                  <span className="text-xs text-muted-foreground">Saldo Atual</span>
                  <p className={`font-bold text-body-sm ${acc.currentBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </p>
                </div>
                <div className="bg-accent/30 rounded-lg p-3">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpRight size={10} className="text-success" /> Entradas</span>
                  <p className="font-semibold text-body-sm text-success">{formatCurrency(entradas, acc.currency)}</p>
                </div>
                <div className="bg-accent/30 rounded-lg p-3">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><ArrowDownRight size={10} className="text-destructive" /> Saídas</span>
                  <p className="font-semibold text-body-sm text-destructive">{formatCurrency(saidas, acc.currency)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                <span>{mvs.length} movimentações</span>
                <span>{linkedTxs.length} transações vinculadas</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
