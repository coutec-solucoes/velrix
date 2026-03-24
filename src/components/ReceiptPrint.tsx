import { useRef } from 'react';
import { Transaction, BankAccount, Client, Currency } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getAppData } from '@/services/storageService';
import { X, Printer } from 'lucide-react';

export interface ReceiptData {
  transaction: Transaction;
  client?: Client | null;
  bankAccount?: BankAccount | null;
  paidDate: string;
  userName: string;
}

interface Props {
  receipt: ReceiptData;
  onClose: () => void;
}

export default function ReceiptPrint({ receipt, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const { transaction: tx, client, bankAccount, paidDate, userName } = receipt;
  const company = getAppData().settings.company;

  const isReceita = tx.type === 'receita' || tx.type === 'investimento';
  const typeLabel = isReceita ? 'RECEBIMENTO' : 'PAGAMENTO';

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head><title>Comprovante</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1a1a1a; font-size: 13px; }
        .receipt { max-width: 350px; margin: 0 auto; border: 1px solid #ddd; padding: 24px; }
        .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 16px; margin-bottom: 16px; }
        .company-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
        .receipt-type { font-size: 14px; font-weight: 600; margin-top: 8px; padding: 4px 12px; display: inline-block; border-radius: 4px; }
        .receipt-type.entrada { background: #dcfce7; color: #166534; }
        .receipt-type.saida { background: #fee2e2; color: #991b1b; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
        .row:last-child { border-bottom: none; }
        .label { color: #666; font-size: 12px; }
        .value { font-weight: 500; text-align: right; max-width: 60%; }
        .amount-row { padding: 12px 0; margin: 8px 0; border-top: 2px solid #1a1a1a; border-bottom: 2px solid #1a1a1a; }
        .amount-row .value { font-size: 18px; font-weight: 700; }
        .footer { text-align: center; margin-top: 16px; padding-top: 16px; border-top: 2px dashed #ccc; font-size: 11px; color: #999; }
        @media print { body { padding: 0; } .receipt { border: none; } }
      </style>
      </head><body onload="window.print(); window.close();">
        ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-xl card-shadow w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Actions bar */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-title-section font-semibold flex items-center gap-2">
            <Printer size={18} /> Comprovante
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-body-sm font-medium hover:bg-primary/90 transition-colors">
              <Printer size={14} /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-accent transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* Receipt preview */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <div ref={printRef}>
            <div className="receipt">
              <div className="header">
                <div className="company-name">{company.name || 'Empresa'}</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Comprovante de {typeLabel.toLowerCase()}</div>
                <div className={`receipt-type ${isReceita ? 'entrada' : 'saida'}`}>{typeLabel}</div>
              </div>

              <div className="row">
                <span className="label">Data</span>
                <span className="value">{formatDate(paidDate)}</span>
              </div>
              <div className="row">
                <span className="label">Descrição</span>
                <span className="value">{tx.description}</span>
              </div>
              {client && (
                <div className="row">
                  <span className="label">Cliente</span>
                  <span className="value">{client.name}</span>
                </div>
              )}
              {tx.category && (
                <div className="row">
                  <span className="label">Categoria</span>
                  <span className="value">{tx.category}</span>
                </div>
              )}
              {bankAccount && (
                <div className="row">
                  <span className="label">Conta</span>
                  <span className="value">{bankAccount.name}</span>
                </div>
              )}
              {tx.installments && tx.currentInstallment && (
                <div className="row">
                  <span className="label">Parcela</span>
                  <span className="value">{tx.currentInstallment}/{tx.installments}</span>
                </div>
              )}
              <div className="row amount-row">
                <span className="label" style={{ fontSize: '13px', fontWeight: 600 }}>Valor</span>
                <span className="value">{formatCurrency(tx.amount, tx.currency)}</span>
              </div>
              <div className="row">
                <span className="label">Operador</span>
                <span className="value">{userName}</span>
              </div>

              <div className="footer">
                <div>Emitido em {new Date().toLocaleString('pt-BR')}</div>
                <div style={{ marginTop: '4px' }}>{company.name}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
