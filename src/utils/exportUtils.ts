import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';

const currencyLabel: Record<string, string> = { BRL: '🇧🇷 BRL', PYG: '🇵🇾 PYG', USD: '🇺🇸 USD' };
const currencyLabelPdf: Record<string, string> = { BRL: '[BRL]', PYG: '[PYG]', USD: '[USD]' };

export const exportFinanceCSV = (txList: Transaction[], t: (key: string) => string, clientName: (id?: string) => string) => {
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

export const exportInstallmentsPDF = (
  installmentPreviews: any[],
  installmentCount: number,
  form: Pick<Transaction, 'description' | 'currency'>
) => {
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

export const exportFinancePDF = (
  txList: Transaction[],
  dateFrom: string,
  dateTo: string,
  t: (key: string) => string,
  clientName: (id?: string) => string
) => {
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
  const footerRows = Object.entries(totals).map(([currency, txTot]) => {
    const saldo = txTot.receita - txTot.despesa - txTot.retirada;
    return [
      currencyLabelPdf[currency] || currency,
      formatCurrency(txTot.receita, currency as any),
      formatCurrency(txTot.despesa, currency as any),
      formatCurrency(txTot.investimento, currency as any),
      formatCurrency(txTot.retirada, currency as any),
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
