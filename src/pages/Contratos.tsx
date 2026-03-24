import { useState, useRef } from 'react';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import { addData, updateData, deleteData, getAppData, getDefaultCurrency, getUIShownCurrencies } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Contract, Client, ContractStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { useTranslation } from '@/hooks/useI18n';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Pencil, Trash2, X, Eye, Printer, PenTool, FileCheck, FileX, Share2, Link2, Unlink } from 'lucide-react';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';
import ContractDocument from '@/components/ContractDocument';
import SignaturePad from '@/components/SignaturePad';

const emptyContract: Omit<Contract, 'id' | 'createdAt'> = {
  clientId: '', amount: 0, currency: getDefaultCurrency(),
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  installments: 1,
  status: 'rascunho',
  description: '',
  terms: '',
  interestRate: 0,
  lateFeePercent: 0,
};

const statusLabels: Record<ContractStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_assinatura: 'Aguardando Assinatura',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
};

const statusColors: Record<ContractStatus, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  aguardando_assinatura: 'bg-warning/15 text-warning',
  assinado: 'bg-success/15 text-success',
  cancelado: 'bg-destructive/15 text-destructive',
};

export default function Contratos() {
  const [contracts, refreshContracts] = useRealtimeData('contracts');
  const [clients] = useRealtimeData('clients');
  const [transactions] = useRealtimeData('transactions');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [form, setForm] = useState(emptyContract);
  const { t } = useTranslation();
  const { canEdit: canEditCon, canDelete: canDeleteCon } = usePermissions();
  const [saving, setSaving] = useState(false);
  const { showSyncResult } = useSyncToast();
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);

  // View / Print / Sign modals
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [signContract, setSignContract] = useState<Contract | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [companySignatureData, setCompanySignatureData] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const data = getAppData();
  const companyName = data.settings.company.name || 'VELTOR';
  const companyLogo = data.settings.company.logo;
  const activeCurrencies = getUIShownCurrencies();

  const load = () => { refreshContracts(); };

  const openCreate = () => { setEditing(null); setForm({ ...emptyContract, currency: activeCurrencies[0] || 'BRL' }); setShowModal(true); };
  const openEdit = (c: Contract) => { setEditing(c); setForm({ ...c }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.clientId || !form.amount) return;
    setSaving(true);
    try {
      const result = editing
        ? await updateData('contracts', editing.id, form)
        : await addData('contracts', { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString() } as Contract);
      showSyncResult(result);
      setShowModal(false); load();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteData('contracts', deleteTarget.id);
    showSyncResult(result, 'Contrato excluído');
    setDeleteTarget(null);
    load();
  };

  const handleSign = async () => {
    if (!signContract) return;
    if (!signatureData && !companySignatureData) return;
    setSaving(true);
    try {
      const updatePayload: any = {
        signedAt: new Date().toISOString(),
        status: 'assinado' as ContractStatus,
      };
      if (signatureData) updatePayload.signatureData = signatureData;
      if (companySignatureData) updatePayload.companySignatureData = companySignatureData;
      const result = await updateData('contracts', signContract.id, updatePayload);
      showSyncResult(result, 'Contrato assinado com sucesso');
      setSignContract(null);
      setSignatureData(null);
      setCompanySignatureData(null);
      load();
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (contract: Contract, newStatus: ContractStatus) => {
    const result = await updateData('contracts', contract.id, { status: newStatus } as any);
    showSyncResult(result);
    load();
  };

  const handlePrint = () => {
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
  };

  const handleWhatsApp = async (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (!client) return;

    // Generate a new signing token (or regenerate if expired)
    let token = contract.signingToken;
    const isExpired = contract.signingTokenExpiresAt && new Date(contract.signingTokenExpiresAt) < new Date();
    if (!token || isExpired) {
      token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
      await updateData('contracts', contract.id, { signingToken: token, signingTokenExpiresAt: expiresAt } as any);
      refreshContracts();
    }

    const signingUrl = `${window.location.origin}/assinar/${token}`;
    const msg = encodeURIComponent(
      `Olá ${client.name}, segue seu contrato "${contract.description || 'Contrato'}" no valor de ${formatCurrency(contract.amount, contract.currency)}.\n\n📄 Visualize e assine o contrato pelo link:\n${signingUrl}\n\n— ${companyName}`
    );
    const phone = (client.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const getClient = (id: string) => clients.find((c) => c.id === id);

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title-lg">{t('con_title')}</h1>
        {canEditCon('contratos') && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> {t('con_new')}
          </button>
        )}
      </div>

      <div className="bg-card rounded-lg card-shadow border border-border overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">{t('con_client')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Descrição</th>
              <th className="text-right p-3 font-medium text-muted-foreground">{t('con_value')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground hidden sm:table-cell">{t('con_installments')}</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">{t('con_period')}</th>
              <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-center p-3 font-medium text-muted-foreground">{t('fin_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const client = getClient(c.clientId);
              const status = (c.status || 'rascunho') as ContractStatus;
              const hasToken = !!c.signingToken;
              const tokenExpired = hasToken && c.signingTokenExpiresAt && new Date(c.signingTokenExpiresAt) < new Date();
              const tokenActive = hasToken && !tokenExpired;
              const daysLeft = hasToken && c.signingTokenExpiresAt
                ? Math.ceil((new Date(c.signingTokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{client?.name || '—'}</td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">{c.description || '—'}</td>
                  <td className="p-3 text-right font-semibold">{formatCurrency(c.amount, c.currency)}</td>
                  <td className="p-3 text-center hidden sm:table-cell">{c.installments}x</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{formatDate(c.startDate)} — {formatDate(c.endDate)}</td>
                  <td className="p-3 text-center space-y-1">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[status]}`}>
                      {statusLabels[status]}
                    </span>
                    {hasToken && status !== 'assinado' && status !== 'cancelado' && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {tokenActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium" title={`Expira em ${daysLeft} dia(s)`}>
                            <Link2 size={10} /> Link ativo {daysLeft !== null && daysLeft <= 3 ? `(${daysLeft}d)` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">
                            <Unlink size={10} /> Link expirado
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewContract(c)} className="p-1.5 rounded hover:bg-accent transition-colors" title="Visualizar">
                        <Eye size={16} />
                      </button>
                      {status !== 'assinado' && status !== 'cancelado' && (
                        <button onClick={() => { setSignContract(c); setSignatureData(null); setCompanySignatureData(null); }} className="p-1.5 rounded hover:bg-success/10 text-success transition-colors" title="Assinar">
                          <PenTool size={16} />
                        </button>
                      )}
                      <button onClick={() => handleWhatsApp(c)} className="p-1.5 rounded hover:bg-success/10 text-success transition-colors" title="Enviar por WhatsApp">
                        <Share2 size={16} />
                      </button>
                      {canEditCon('contratos') && (
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-accent transition-colors" title="Editar">
                          <Pencil size={16} />
                        </button>
                      )}
                      {canDeleteCon('contratos') && (
                        <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {contracts.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum contrato cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? t('con_edit') : t('con_new')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-body-sm font-medium mb-1">{t('con_client')}</label>
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={inputClass}>
                  <option value="">{t('con_select')}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-body-sm font-medium mb-1">Descrição do Contrato</label>
                <input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Empréstimo pessoal, Serviço de consultoria..." className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-body-sm font-medium mb-1">{t('con_value')}</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className={inputClass} /></div>
                <div><label className="block text-body-sm font-medium mb-1">{t('con_currency')}</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as any })} className={inputClass}>
                    {activeCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-body-sm font-medium mb-1">{t('con_start')}</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass} /></div>
                <div><label className="block text-body-sm font-medium mb-1">{t('con_end')}</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-body-sm font-medium mb-1">{t('con_installments')}</label><input type="number" value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })} className={inputClass} /></div>
                <div><label className="block text-body-sm font-medium mb-1">Juros % mês</label><input type="number" step="0.1" value={form.interestRate || 0} onChange={(e) => setForm({ ...form, interestRate: Number(e.target.value) })} className={inputClass} /></div>
                <div><label className="block text-body-sm font-medium mb-1">Multa %</label><input type="number" step="0.1" value={form.lateFeePercent || 0} onChange={(e) => setForm({ ...form, lateFeePercent: Number(e.target.value) })} className={inputClass} /></div>
              </div>
              <div><label className="block text-body-sm font-medium mb-1">Status</label>
                <select value={form.status || 'rascunho'} onChange={(e) => setForm({ ...form, status: e.target.value as ContractStatus })} className={inputClass}>
                  <option value="rascunho">Rascunho</option>
                  <option value="aguardando_assinatura">Aguardando Assinatura</option>
                  <option value="assinado">Assinado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div><label className="block text-body-sm font-medium mb-1">Termos e Condições (opcional)</label>
                <textarea value={form.terms || ''} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={4} placeholder="Cláusulas específicas do contrato..." className={inputClass} />
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? t('common_save') : t('common_create')} />
                <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">{t('common_cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View / Print Modal */}
      {viewContract && (() => {
        const client = getClient(viewContract.clientId);
        if (!client) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setViewContract(null)}>
            <div className="bg-card rounded-xl card-shadow w-full max-w-3xl mx-4 max-h-[95vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
                <h2 className="text-title-section">Contrato</h2>
                <div className="flex items-center gap-2">
                  {viewContract.status !== 'assinado' && viewContract.status !== 'cancelado' && (
                    <button onClick={() => { setViewContract(null); setSignContract(viewContract); setSignatureData(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-body-sm font-medium bg-success/10 text-success hover:bg-success/20 transition-colors">
                      <PenTool size={16} /> Assinar
                    </button>
                  )}
                  <button onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-body-sm font-medium border border-border hover:bg-accent transition-colors">
                    <Printer size={16} /> Imprimir
                  </button>
                  <button onClick={() => setViewContract(null)} className="p-1.5 rounded hover:bg-accent"><X size={20} /></button>
                </div>
              </div>
              <div ref={printRef}>
                <ContractDocument
                  contract={viewContract}
                  client={client}
                  transactions={transactions}
                  company={data.settings.company}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sign Modal */}
      {signContract && (() => {
        const client = getClient(signContract.clientId);
        if (!client) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setSignContract(null)}>
            <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-title-section">Assinatura do Contrato</h2>
                <button onClick={() => setSignContract(null)} className="p-1 rounded hover:bg-accent"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <p className="text-body-sm font-medium">{signContract.description || 'Contrato'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Cliente: {client.name}</p>
                  <p className="text-body font-bold mt-1">{formatCurrency(signContract.amount, signContract.currency)}</p>
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-2">Assinatura do Empresário / Credor</label>
                  <SignaturePad onSignatureChange={setCompanySignatureData} />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-2">Assinatura do Cliente</label>
                  <SignaturePad onSignatureChange={setSignatureData} />
                </div>
                <div className="flex gap-3 pt-2">
                  <SaveButton onClick={handleSign} saving={saving} label="Confirmar Assinaturas" disabled={!signatureData && !companySignatureData} />
                  <button onClick={() => setSignContract(null)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">{t('common_cancel')}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget ? `Contrato - ${getClient(deleteTarget.clientId)?.name || 'Cliente'}` : ''}
        itemType="o contrato"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
