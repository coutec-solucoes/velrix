import { forwardRef } from 'react';
import { Contract, Client, Transaction, Company } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { currencyToWords } from '@/utils/numberToWords';

interface ContractDocumentProps {
  contract: Contract;
  client: Client;
  transactions?: Transaction[];
  company?: Company;
}

const ContractDocument = forwardRef<HTMLDivElement, ContractDocumentProps>(
  ({ contract, client, transactions = [], company }, ref) => {
    const companyName = company?.name || 'VELTOR';
    const companyLogo = company?.logo;
    const companyDoc = company?.document;
    const companyPhone = company?.phone;
    const companyEmail = company?.email;
    const companyAddress = company?.address;
    const installmentTxs = transactions
      .filter((tx) => contract.transactionIds?.includes(tx.id) || (contract.installmentGroupId && tx.installmentGroupId === contract.installmentGroupId))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const totalAmount = installmentTxs.length > 0
      ? installmentTxs.reduce((s, t) => s + t.amount, 0)
      : contract.amount;

    return (
      <div ref={ref} className="bg-white text-black p-8 max-w-[210mm] mx-auto print-contract" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '13px', lineHeight: '1.6' }}>
        {/* Header */}
        <div className="flex flex-col items-center justify-center border-b-2 border-black pb-4 mb-6">
          {companyLogo && (
            <div className="mb-3 max-h-20 flex items-center justify-center">
              <img src={companyLogo} alt="Logo Empresa" className="max-h-20 object-contain" />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-wide">{companyName}</h1>
          <h2 className="text-lg font-semibold mt-2">CONTRATO DE {contract.description?.toUpperCase() || 'EMPRÉSTIMO / SERVIÇO'}</h2>
          <p className="text-xs text-gray-500 mt-1">Contrato Nº {contract.id.slice(0, 8).toUpperCase()}</p>
        </div>

        {/* Parties */}
        <div className="mb-6">
          <h3 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">Das Partes</h3>
          <p><strong>CREDOR/PRESTADOR:</strong> {companyName}</p>
          {companyDoc && <p><strong>Documento:</strong> {companyDoc}</p>}
          {companyAddress && <p><strong>Endereço:</strong> {companyAddress}</p>}
          {companyPhone && <p><strong>Telefone:</strong> {companyPhone}</p>}
          
          <p className="mt-4"><strong>DEVEDOR/TOMADOR:</strong> {client.name}</p>
          <p><strong>Documento:</strong> {client.document} &nbsp;|&nbsp; <strong>Telefone:</strong> {client.phone}</p>
          {client.email && <p><strong>E-mail:</strong> {client.email}</p>}
          {client.address && <p><strong>Endereço:</strong> {client.address}{client.addressNumber ? `, ${client.addressNumber}` : ''}{client.neighborhood ? ` - ${client.neighborhood}` : ''}{client.city ? `, ${client.city}` : ''}{client.state ? `/${client.state}` : ''}</p>}
        </div>

        {/* Object */}
        <div className="mb-6">
          <h3 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">Do Objeto</h3>
          <p>O presente contrato tem por objeto a formalização de {contract.description || 'operação financeira'} no valor total de <strong>{formatCurrency(totalAmount, contract.currency)}</strong> (<em>{currencyToWords(totalAmount, contract.currency)}</em>), a ser {contract.installments > 1 ? `pago em ${contract.installments} parcelas` : 'pago à vista'}, conforme condições abaixo.</p>
        </div>

        {/* Conditions */}
        <div className="mb-6">
          <h3 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">Das Condições</h3>
          <p><strong>Valor Total:</strong> {formatCurrency(totalAmount, contract.currency)} ({currencyToWords(totalAmount, contract.currency)})</p>
          <p><strong>Moeda:</strong> {contract.currency}</p>
          <p><strong>Parcelas:</strong> {contract.installments}x de {formatCurrency(totalAmount / contract.installments, contract.currency)} ({currencyToWords(totalAmount / contract.installments, contract.currency)})</p>
          <p><strong>Período:</strong> {formatDate(contract.startDate)} a {formatDate(contract.endDate)}</p>
          {contract.interestRate !== undefined && contract.interestRate > 0 && (
            <p><strong>Juros:</strong> {contract.interestRate}% ao mês</p>
          )}
          {contract.lateFeePercent !== undefined && contract.lateFeePercent > 0 && (
            <p><strong>Multa por atraso:</strong> {contract.lateFeePercent}%</p>
          )}
        </div>

        {/* Installment Table */}
        {installmentTxs.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">Cronograma de Pagamento</h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">Parcela</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">Valor</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">Vencimento</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {installmentTxs.map((tx, i) => (
                  <tr key={tx.id}>
                    <td className="border border-gray-300 px-2 py-1">{tx.currentInstallment || i + 1}/{contract.installments}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(tx.amount, tx.currency)}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{formatDate(tx.dueDate)}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{tx.status === 'pago' ? '✅ Pago' : tx.status === 'atrasado' ? '⚠️ Atrasado' : '⏳ Pendente'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td className="border border-gray-300 px-2 py-1">Total</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(totalAmount, contract.currency)}</td>
                  <td className="border border-gray-300 px-2 py-1" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Terms */}
        {contract.terms && (
          <div className="mb-6">
            <h3 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">Termos e Condições</h3>
            <div className="whitespace-pre-wrap text-xs">{contract.terms}</div>
          </div>
        )}

        {/* Default terms if none provided */}
        {!contract.terms && (
          <div className="mb-6">
            <h3 className="font-bold text-sm mb-2 uppercase border-b border-gray-300 pb-1">Cláusulas Gerais</h3>
            <div className="text-xs space-y-2">
              <p><strong>1.</strong> O não pagamento de qualquer parcela na data de vencimento acarretará a incidência de multa e juros conforme estabelecido neste contrato.</p>
              <p><strong>2.</strong> O devedor poderá efetuar o pagamento antecipado das parcelas, sem incidência de desconto, salvo acordo entre as partes.</p>
              <p><strong>3.</strong> As partes elegem o foro da comarca onde está estabelecido o credor para dirimir quaisquer dúvidas oriundas deste contrato.</p>
              <p><strong>4.</strong> Este contrato é firmado em caráter irrevogável e irretratável, obrigando as partes e seus sucessores.</p>
            </div>
          </div>
        )}

        {/* Signature section */}
        <div className="mt-12 pt-6 border-t border-gray-300">
          <p className="text-xs text-gray-500 mb-8 text-center">
            Data: {contract.signedAt ? formatDate(contract.signedAt) : '____/____/________'}
          </p>
          <div className="grid grid-cols-2 gap-12">
            <div className="text-center">
              {contract.companySignatureData ? (
                <div className="mb-2 h-16 flex items-end justify-center">
                  <img src={contract.companySignatureData} alt="Assinatura Empresa" className="max-h-16 max-w-full" />
                </div>
              ) : (
                <div className="border-b border-black mb-2 h-16"></div>
              )}
              <p className="text-sm font-semibold">{companyName}</p>
              <p className="text-xs text-gray-500">Credor / Prestador</p>
            </div>
            <div className="text-center">
              {contract.signatureData ? (
                <div className="mb-2 h-16 flex items-end justify-center">
                  <img src={contract.signatureData} alt="Assinatura Cliente" className="max-h-16 max-w-full" />
                </div>
              ) : (
                <div className="border-b border-black mb-2 h-16"></div>
              )}
              <p className="text-sm font-semibold">{client.name}</p>
              <p className="text-xs text-gray-500">Devedor / Tomador</p>
              <p className="text-xs text-gray-400">{client.document}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          <p>Documento gerado por {companyName} em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    );
  }
);

ContractDocument.displayName = 'ContractDocument';
export default ContractDocument;
