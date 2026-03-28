import { forwardRef } from 'react';
import { Contract, Client, Transaction, Company, ContractClause } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { currencyToWords } from '@/utils/numberToWords';

interface ContractDocumentProps {
  contract: Contract;
  client: Client;
  transactions?: Transaction[];
  company?: Company;
}

const DEFAULT_CLAUSES: ContractClause[] = [
  {
    id: 'c1',
    text: 'O DEVEDOR declara que reconhece a presente dívida como líquida, certa e exigível, comprometendo-se ao pagamento nas condições estabelecidas neste instrumento.',
  },
  {
    id: 'c2',
    text: 'O não pagamento de qualquer parcela na data de vencimento acarretará a incidência de multa e juros moratórios conforme estipulado nas condições financeiras acima.',
  },
  {
    id: 'c3',
    text: 'O DEVEDOR poderá efetuar o pagamento antecipado das parcelas, total ou parcialmente, com redução proporcional dos juros incidentes, mediante acordo prévio com o CREDOR.',
  },
  {
    id: 'c4',
    text: 'A presente Confissão de Dívida constitui título executivo extrajudicial, nos termos do art. 784, inciso III, do Código de Processo Civil Brasileiro (Lei nº 13.105/2015).',
  },
  {
    id: 'c5',
    text: 'Em caso de inadimplência, o CREDOR fica autorizado a adotar todas as medidas legais cabíveis para a recuperação do crédito, incluindo protesto em cartório, negativação em cadastros de inadimplentes e cobrança judicial ou extrajudicial.',
  },
  {
    id: 'c6',
    text: 'Este instrumento é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores a qualquer título.',
  },
  {
    id: 'c7',
    text: 'As partes elegem o foro da comarca em que está estabelecido o CREDOR para dirimir quaisquer questões decorrentes do presente instrumento, renunciando a qualquer outro, por mais privilegiado que seja.',
  },
];

const ContractDocument = forwardRef<HTMLDivElement, ContractDocumentProps>(
  ({ contract, client, transactions = [], company }, ref) => {
    const companyName = company?.name || 'VELTOR';
    const companyLogo = company?.logo;
    const companyDoc = company?.document;
    const companyPhone = company?.phone;
    const companyEmail = company?.email;
    const companyAddress = company?.address;
    const contractTitle = company?.contractTitle || 'CONFISSÃO DE DÍVIDA';
    const clauses: ContractClause[] =
      company?.contractClauses && company.contractClauses.length > 0
        ? company.contractClauses
        : DEFAULT_CLAUSES;

    const installmentTxs = transactions
      .filter(
        (tx) =>
          contract.transactionIds?.includes(tx.id) ||
          (contract.installmentGroupId &&
            tx.installmentGroupId === contract.installmentGroupId),
      )
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const totalAmount =
      installmentTxs.length > 0
        ? installmentTxs.reduce((s, t) => s + t.amount, 0)
        : contract.amount;

    const installmentValue = totalAmount / contract.installments;
    const docNumber = contract.id.slice(0, 8).toUpperCase();
    const todayFormatted = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    return (
      <div
        ref={ref}
        className="bg-white text-black p-8 max-w-[210mm] mx-auto print-contract"
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '12px',
          lineHeight: '1.7',
        }}
      >
        {/* ===== HEADER: Logo + Company Name ===== */}
        <div
          style={{
            borderBottom: '3px solid #000',
            paddingBottom: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          {companyLogo && (
            <div style={{ flexShrink: 0 }}>
              <img
                src={companyLogo}
                alt={companyName}
                style={{ maxHeight: '72px', maxWidth: '160px', objectFit: 'contain', display: 'block' }}
              />
            </div>
          )}
          <div style={{ flex: 1, textAlign: companyLogo ? 'left' : 'center' }}>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {companyName}
            </div>
            {companyDoc && (
              <div style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>
                CNPJ/RUC: {companyDoc}
              </div>
            )}
            {(companyPhone || companyEmail) && (
              <div style={{ fontSize: '11px', color: '#444' }}>
                {companyPhone && `Tel: ${companyPhone}`}
                {companyPhone && companyEmail && '  |  '}
                {companyEmail && `E-mail: ${companyEmail}`}
              </div>
            )}
            {companyAddress && (
              <div style={{ fontSize: '11px', color: '#444' }}>{companyAddress}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              style={{
                fontSize: '10px',
                color: '#666',
                border: '1px solid #ccc',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
            >
              Nº {docNumber}
            </div>
          </div>
        </div>

        {/* ===== TITLE ===== */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              borderBottom: '1px solid #000',
              display: 'inline-block',
              paddingBottom: '4px',
            }}
          >
            {contractTitle}
          </h2>
          {contract.description && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
              {contract.description}
            </div>
          )}
        </div>

        {/* ===== PARTIES ===== */}
        <div style={{ marginBottom: '18px' }}>
          <SectionTitle>Das Partes</SectionTitle>
          <p style={{ marginBottom: '6px' }}>
            <strong>CREDOR:</strong> {companyName}
            {companyDoc ? `, inscrito no CNPJ/RUC sob o nº ${companyDoc}` : ''}
            {companyAddress ? `, com sede em ${companyAddress}` : ''}.
          </p>
          <p style={{ marginBottom: '6px' }}>
            <strong>DEVEDOR:</strong> {client.name}
            {client.document
              ? `, portador do documento nº ${client.document}`
              : ''}
            {client.address
              ? `, residente em ${client.address}${client.addressNumber ? `, ${client.addressNumber}` : ''}${client.neighborhood ? ` — ${client.neighborhood}` : ''}${client.city ? `, ${client.city}` : ''}${client.state ? `/${client.state}` : ''}`
              : ''}
            .
          </p>
          {client.phone && (
            <p>
              <strong>Contato do Devedor:</strong> {client.phone}
              {client.email ? ` | ${client.email}` : ''}
            </p>
          )}
        </div>

        {/* ===== OBJECT / CONFESSION ===== */}
        <div style={{ marginBottom: '18px' }}>
          <SectionTitle>Da Confissão de Dívida</SectionTitle>
          <p>
            Pelo presente instrumento, o DEVEDOR <strong>{client.name}</strong> confessa
            dever ao CREDOR <strong>{companyName}</strong> a quantia de{' '}
            <strong>
              {formatCurrency(totalAmount, contract.currency)} (
              {currencyToWords(totalAmount, contract.currency)})
            </strong>
            , referente a {contract.description || 'operação financeira formalizada entre as partes'}.
          </p>
          <p style={{ marginTop: '6px' }}>
            O valor total será {contract.installments > 1
              ? `pago em ${contract.installments} (${numberToPortuguese(contract.installments)}) parcela${contract.installments > 1 ? 's' : ''} de ${formatCurrency(installmentValue, contract.currency)} (${currencyToWords(installmentValue, contract.currency)}) cada`
              : 'pago à vista'}
            , no período de <strong>{formatDate(contract.startDate)}</strong> a{' '}
            <strong>{formatDate(contract.endDate)}</strong>.
          </p>
        </div>

        {/* ===== FINANCIAL CONDITIONS ===== */}
        <div style={{ marginBottom: '18px' }}>
          <SectionTitle>Das Condições Financeiras</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <InfoRow label="Valor Total da Dívida" value={`${formatCurrency(totalAmount, contract.currency)} (${currencyToWords(totalAmount, contract.currency)})`} />
              <InfoRow label="Moeda" value={contract.currency} />
              <InfoRow
                label="Número de Parcelas"
                value={`${contract.installments}x de ${formatCurrency(installmentValue, contract.currency)}`}
              />
              <InfoRow label="Data de Início" value={formatDate(contract.startDate)} />
              <InfoRow label="Data de Vencimento Final" value={formatDate(contract.endDate)} />
              {contract.interestRate !== undefined && contract.interestRate > 0 && (
                <InfoRow label="Juros" value={`${contract.interestRate}% ao mês`} />
              )}
              {contract.lateFeePercent !== undefined && contract.lateFeePercent > 0 && (
                <InfoRow label="Multa por Atraso" value={`${contract.lateFeePercent}% sobre o valor em atraso`} />
              )}
            </tbody>
          </table>
        </div>

        {/* ===== INSTALLMENT SCHEDULE ===== */}
        {installmentTxs.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <SectionTitle>Cronograma de Pagamento</SectionTitle>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '11px',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <th style={thStyle}>Parcela</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Vencimento</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {installmentTxs.map((tx, i) => (
                  <tr key={tx.id}>
                    <td style={tdStyle}>
                      {tx.currentInstallment || i + 1}/{contract.installments}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {formatDate(tx.dueDate)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {tx.status === 'pago'
                        ? '✅ Pago'
                        : tx.status === 'atrasado'
                        ? '⚠️ Atrasado'
                        : '⏳ Pendente'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
                  <td style={tdStyle}>Total</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {formatCurrency(totalAmount, contract.currency)}
                  </td>
                  <td style={tdStyle} colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ===== CLAUSES ===== */}
        <div style={{ marginBottom: '18px' }}>
          <SectionTitle>Das Cláusulas e Condições</SectionTitle>
          <ol style={{ paddingLeft: '0', listStyle: 'none', margin: 0 }}>
            {clauses.map((clause, i) => (
              <li key={clause.id} style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
                <span style={{ fontWeight: 'bold', flexShrink: 0, minWidth: '28px' }}>
                  {i + 1}.
                </span>
                <span>{clause.text}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* ===== SIGNATURE ===== */}
        <div
          style={{
            marginTop: '40px',
            paddingTop: '20px',
            borderTop: '1px solid #ccc',
          }}
        >
          <p
            style={{
              textAlign: 'center',
              fontSize: '11px',
              color: '#555',
              marginBottom: '32px',
            }}
          >
            {contract.signedAt
              ? `Assinado em ${new Date(contract.signedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`
              : `Local e Data: ______________________, ${todayFormatted}`}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
            {/* Company / Creditor signature */}
            <div style={{ textAlign: 'center' }}>
              {contract.companySignatureData ? (
                <div
                  style={{
                    height: '72px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <img
                    src={contract.companySignatureData}
                    alt="Assinatura Credor"
                    style={{ maxHeight: '68px', maxWidth: '100%' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    height: '72px',
                    borderBottom: '1px solid #000',
                    marginBottom: '4px',
                  }}
                />
              )}
              <p style={{ fontWeight: 'bold', fontSize: '12px', margin: '4px 0 2px' }}>
                {companyName}
              </p>
              <p style={{ fontSize: '10px', color: '#666' }}>CREDOR</p>
              {companyDoc && (
                <p style={{ fontSize: '10px', color: '#888' }}>Doc.: {companyDoc}</p>
              )}
            </div>

            {/* Client / Debtor signature */}
            <div style={{ textAlign: 'center' }}>
              {contract.signatureData ? (
                <div
                  style={{
                    height: '72px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <img
                    src={contract.signatureData}
                    alt="Assinatura Devedor"
                    style={{ maxHeight: '68px', maxWidth: '100%' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    height: '72px',
                    borderBottom: '1px solid #000',
                    marginBottom: '4px',
                  }}
                />
              )}
              <p style={{ fontWeight: 'bold', fontSize: '12px', margin: '4px 0 2px' }}>
                {client.name}
              </p>
              <p style={{ fontSize: '10px', color: '#666' }}>DEVEDOR</p>
              {client.document && (
                <p style={{ fontSize: '10px', color: '#888' }}>Doc.: {client.document}</p>
              )}
            </div>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '12px',
            borderTop: '1px solid #ddd',
            textAlign: 'center',
            fontSize: '10px',
            color: '#aaa',
          }}
        >
          <p>
            {companyLogo && (
              <img
                src={companyLogo}
                alt={companyName}
                style={{ height: '18px', objectFit: 'contain', display: 'inline', verticalAlign: 'middle', marginRight: '6px' }}
              />
            )}
            Documento gerado por <strong>{companyName}</strong> em{' '}
            {new Date().toLocaleDateString('pt-BR')} — Nº {docNumber}
          </p>
        </div>
      </div>
    );
  },
);

ContractDocument.displayName = 'ContractDocument';
export default ContractDocument;

/* ===== Helpers ===== */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontWeight: 'bold',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        borderBottom: '1px solid #999',
        paddingBottom: '3px',
        marginBottom: '8px',
      }}
    >
      {children}
    </h3>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td
        style={{
          padding: '3px 8px 3px 0',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          color: '#333',
          verticalAlign: 'top',
        }}
      >
        {label}:
      </td>
      <td style={{ padding: '3px 0', verticalAlign: 'top' }}>{value}</td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '4px 8px',
  textAlign: 'left',
  fontWeight: 'bold',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '4px 8px',
};

function numberToPortuguese(n: number): string {
  const words = [
    '', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte',
  ];
  return words[n] || String(n);
}
