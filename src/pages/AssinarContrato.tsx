import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Contract, Client, Transaction, Company } from '@/types';
import ContractDocument from '@/components/ContractDocument';
import SignaturePad from '@/components/SignaturePad';
import { Loader2, CheckCircle2, Printer, AlertTriangle, ShieldCheck } from 'lucide-react';

function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

export default function AssinarContrato() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [company, setCompany] = useState<Company | undefined>();
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    loadContractData();
  }, [token]);

  async function loadContractData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch contract by signing token (not by ID)
      const { data: contractRow, error: cErr } = await supabase
        .from('contracts')
        .select('*')
        .eq('signing_token', token)
        .single();

      if (cErr || !contractRow) {
        setError('Link inválido ou expirado. Solicite um novo link ao credor.');
        setLoading(false);
        return;
      }

      const contractData = toCamelCase(contractRow) as Contract;

      // Check token expiration
      if (contractData.signingTokenExpiresAt && new Date(contractData.signingTokenExpiresAt) < new Date()) {
        setError('Este link expirou. Solicite um novo link ao credor.');
        setLoading(false);
        return;
      }

      setContract(contractData);

      if (contractData.status === 'assinado') {
        setSigned(true);
      }

      // Fetch client
      const { data: clientRow } = await supabase
        .from('clients')
        .select('*')
        .eq('id', contractData.clientId)
        .single();

      if (clientRow) {
        setClient(toCamelCase(clientRow) as Client);
      }

      // Fetch transactions linked to this contract
      if (contractData.installmentGroupId) {
        const { data: txRows } = await supabase
          .from('transactions')
          .select('*')
          .eq('installment_group_id', contractData.installmentGroupId);

        if (txRows) {
          setTransactions(txRows.map((r: any) => toCamelCase(r) as Transaction));
        }
      }

      // Fetch company name from the contract's company
      const companyId = (contractData as any).companyId;
      if (companyId) {
        const { data: companyRow } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .single();
        
        if (companyRow) {
          setCompany(toCamelCase(companyRow) as Company);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar contrato');
    } finally {
      setLoading(false);
    }
  }

  async function handleSign() {
    if (!contract || !signatureData) return;
    setSaving(true);
    try {
      const { error: uErr } = await supabase
        .from('contracts')
        .update({
          signature_data: signatureData,
          signed_at: new Date().toISOString(),
          status: 'assinado',
        })
        .eq('id', contract.id)
        .eq('signing_token', token); // double-check token

      if (uErr) {
        setError('Erro ao salvar assinatura. Tente novamente.');
        return;
      }

      setSigned(true);
      setContract({ ...contract, signatureData, signedAt: new Date().toISOString(), status: 'assinado' });
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar assinatura');
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Contrato</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.6; color: #000; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 15mm; size: A4; }
        }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 4px 8px; }
        img { max-width: 100%; height: auto; }
        .contract-container { max-width: 210mm; margin: 0 auto; padding: 20px; }
      </style>
      </head><body><div class="contract-container">${printRef.current.innerHTML}</div></body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-3" style={{ color: '#2563eb' }} />
          <p style={{ color: '#64748b' }}>Carregando contrato...</p>
        </div>
      </div>
    );
  }

  if (error && !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="text-center max-w-md mx-auto p-6">
          <AlertTriangle size={48} className="mx-auto mb-4" style={{ color: '#f59e0b' }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: '#1e293b' }}>Contrato Indisponível</h1>
          <p style={{ color: '#64748b' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!contract || !client) return null;

  if (signed) {
    return (
      <div className="min-h-screen" style={{ background: '#f8fafc' }}>
        <div className="max-w-3xl mx-auto py-8 px-4">
          <div className="rounded-lg border p-6 mb-6 text-center" style={{ background: '#fff', borderColor: '#e2e8f0' }}>
            <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: '#16a34a' }} />
            <h1 className="text-xl font-bold mb-2" style={{ color: '#1e293b' }}>Contrato Assinado com Sucesso!</h1>
            <p className="mb-4" style={{ color: '#64748b' }}>Sua assinatura foi registrada e confirmada no sistema. Você pode imprimir ou salvar o documento abaixo.</p>
            <div className="inline-flex items-center gap-1.5 text-xs mb-4 px-3 py-1.5 rounded-full" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <ShieldCheck size={14} /> Assinatura verificada
            </div>
            <br />
            <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors" style={{ background: '#2563eb', color: '#fff' }}>
              <Printer size={18} /> Imprimir / Salvar PDF
            </button>
          </div>
          <div ref={printRef}>
            <ContractDocument contract={contract} client={client} transactions={transactions} company={company} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="rounded-lg border p-6 mb-6" style={{ background: '#fff', borderColor: '#e2e8f0' }}>
          <h1 className="text-xl font-bold mb-1" style={{ color: '#1e293b' }}>Assinatura de Contrato</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Revise o documento abaixo e assine digitalmente para confirmar.</p>
          <div className="inline-flex items-center gap-1.5 text-xs mt-3 px-3 py-1.5 rounded-full" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <ShieldCheck size={14} /> Link seguro com token único
          </div>
        </div>

        {error && (
          <div className="rounded-lg border p-4 mb-6 text-sm" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* Contract Document */}
        <div className="rounded-lg border mb-6 overflow-hidden" style={{ background: '#fff', borderColor: '#e2e8f0' }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
            <span className="text-sm font-medium" style={{ color: '#475569' }}>Documento do Contrato</span>
            <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors" style={{ borderColor: '#d1d5db' }}>
              <Printer size={14} /> Imprimir
            </button>
          </div>
          <div ref={printRef}>
            <ContractDocument contract={contract} client={client} transactions={transactions} company={company} />
          </div>
        </div>

        {/* Signature Section */}
        <div className="rounded-lg border p-6" style={{ background: '#fff', borderColor: '#e2e8f0' }}>
          <h2 className="text-lg font-bold mb-1" style={{ color: '#1e293b' }}>Sua Assinatura</h2>
          <p className="text-sm mb-4" style={{ color: '#64748b' }}>Desenhe sua assinatura no campo abaixo para confirmar o contrato.</p>
          <SignaturePad onSignatureChange={setSignatureData} />
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSign}
              disabled={!signatureData || saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: '#16a34a', color: '#fff' }}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {saving ? 'Salvando...' : 'Confirmar Assinatura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
