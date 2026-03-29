import { useState, useMemo } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { BankAccount, CashMovement, Currency } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { X, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Filter, Calendar, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  account: BankAccount;
  allAccounts: BankAccount[];
  onClose: () => void;
}

export default function BankAccountMovements({ account, allAccounts, onClose }: Props) {
  const [movements] = useRealtimeData('cashMovements');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterAccount, setFilterAccount] = useState<string>(account.id);

  const selectedAcc = allAccounts.find(a => a.id === filterAccount) || account;
  const currency = (selectedAcc.currency || 'BRL') as Currency;

  const { filtered, saldoAnterior } = useMemo(() => {
    const allForAccount = movements
      .filter(m => m.bankAccountId === filterAccount)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    let currentBalance = selectedAcc.initialBalance || 0;
    let priorBalance = selectedAcc.initialBalance || 0;

    const listWithBalances = allForAccount.map(m => {
      if (dateFrom && m.date < dateFrom) {
        if (m.type === 'entrada') priorBalance += m.amount;
        else priorBalance -= m.amount;
      }

      if (m.type === 'entrada') currentBalance += m.amount;
      else currentBalance -= m.amount;
      
      return { ...m, resultingBalance: currentBalance };
    });

    let displayList = listWithBalances;
    if (dateFrom) displayList = displayList.filter(m => m.date >= dateFrom);
    if (dateTo) displayList = displayList.filter(m => m.date <= dateTo);

    displayList.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return { filtered: displayList, saldoAnterior: priorBalance };
  }, [movements, filterAccount, dateFrom, dateTo, selectedAcc.initialBalance]);

  const totals = useMemo(() => {
    let entradas = 0, saidas = 0;
    filtered.forEach(m => {
      if (m.type === 'entrada') entradas += m.amount;
      else if (m.type === 'saida') saidas += m.amount;
      else if (m.type === 'transferencia') saidas += m.amount;
    });
    return { entradas, saidas, saldoFinal: saldoAnterior + entradas - saidas };
  }, [filtered, saldoAnterior]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Extrato Bancário - ${selectedAcc.name}`, 14, 18);
    doc.setFontSize(10);
    const filtersLabel = `Filtros: ${dateFrom ? `De ${dateFrom} ` : 'Início '} ${dateTo ? `Até ${dateTo}` : 'Hoje'}`;
    doc.text(filtersLabel, 14, 25);
    doc.text(`Saldo Inicial/Anterior: ${formatCurrency(saldoAnterior, currency)}`, 14, 31);

    const headers = [['Data', 'Descrição', 'Usuário', 'Tipo', 'Valor', 'Saldo']];
    const rows = filtered.map(m => {
      const isPositive = m.type === 'entrada';
      return [
        new Date(m.date).toLocaleDateString('pt-BR'),
        m.description || '-',
        m.userName || 'Sistema',
        typeLabel(m.type),
        `${isPositive ? '+' : '-'}${formatCurrency(m.amount, currency)}`,
        formatCurrency(m.resultingBalance, currency),
      ];
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 37,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    doc.save(`extrato_${selectedAcc.name}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const typeIcon = (type: string) => {
    if (type === 'entrada') return <ArrowDownCircle size={16} className="text-success" />;
    if (type === 'saida') return <ArrowUpCircle size={16} className="text-destructive" />;
    return <ArrowLeftRight size={16} className="text-warning" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'entrada') return 'Entrada';
    if (type === 'saida') return 'Saída';
    return 'Transferência';
  };

  const inputClass = "border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-xl card-shadow w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-title-section">Extrato de Movimentos</h2>
            <p className="text-body-sm text-muted-foreground mt-0.5">
              {account.name} — {account.bankName || 'Sem banco'} &nbsp;&bull;&nbsp; 
              Saldo inicial da conta: <span className="font-semibold">{formatCurrency(selectedAcc.initialBalance || 0, currency)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPDF} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-body-sm font-medium transition-colors">
              <FileText size={16} /> Exportar PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-accent transition-colors"><X size={20} /></button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={16} className="text-muted-foreground" />
            <span className="text-body-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Conta</label>
              <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className={`${inputClass} w-full`}>
                {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Data Início</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={`${inputClass} w-full`} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Data Fim</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={`${inputClass} w-full`} />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 p-4 border-b border-border bg-card">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Saldo Anterior</p>
            <p className="text-body-sm font-semibold">{formatCurrency(saldoAnterior, currency)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-body-sm font-semibold text-success">{formatCurrency(totals.entradas, currency)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-body-sm font-semibold text-destructive">{formatCurrency(totals.saidas, currency)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Saldo Final</p>
            <p className={`text-body-sm font-semibold ${totals.saldoFinal >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(totals.saldoFinal, currency)}</p>
          </div>
        </div>

        {/* Movements list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-body-sm">
              <Calendar size={32} className="mx-auto mb-2 opacity-40" />
              Nenhum movimento encontrado para os filtros selecionados.
            </div>
          ) : (
            <table className="w-full text-body-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Data e Hora</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Descrição</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Usuário</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Valor</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-body font-medium">{m.description || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground font-semibold">{m.userName || 'Sistema'}</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1.5">{typeIcon(m.type)} {typeLabel(m.type)}</span>
                    </td>
                    <td className={`p-3 text-right font-semibold ${m.type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                      {m.type === 'entrada' ? '+' : '-'}{formatCurrency(m.amount, currency)}
                    </td>
                    <td className="p-3 text-right font-medium text-muted-foreground">
                      {formatCurrency(m.resultingBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
