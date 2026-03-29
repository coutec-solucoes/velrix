import { useState, useEffect } from 'react';
import { addData, updateData, deleteData, getAppData, getDefaultCurrency, getUIShownCurrencies } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { BankAccount, Currency } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useTranslation } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Pencil, Trash2, X, Building2, Wallet, PiggyBank, Eye, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import BankAccountMovements from '@/components/BankAccountMovements';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';

const emptyAccount: Omit<BankAccount, 'id' | 'createdAt'> = {
  name: '', bankName: '', accountType: 'corrente', currency: 'BRL',
  initialBalance: 0, currentBalance: 0, active: true,
};

export default function ContasBancarias() {
  const [accounts, refreshAccounts] = useRealtimeData('bankAccounts');
  const [cobradores] = useRealtimeData('cobradores');
  const [activeTab, setActiveTab] = useState<'empresa' | 'cobradores'>('empresa');
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>(['BRL']);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(emptyAccount);
  const [saving, setSaving] = useState(false);
  const { canEdit: canEditBank, canDelete: canDeleteBank } = usePermissions();
  const [viewingMovements, setViewingMovements] = useState<BankAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [fundModal, setFundModal] = useState<{ account: BankAccount; type: 'entrada' | 'saida' } | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [fundDescription, setFundDescription] = useState('');
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showSyncResult } = useSyncToast();

  useEffect(() => {
    setActiveCurrencies(getUIShownCurrencies());
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyAccount, currency: getDefaultCurrency() });
    setShowModal(true);
  };

  const openEdit = (acc: BankAccount) => {
    setEditing(acc);
    setForm({ ...acc });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      let result;
      if (editing) {
        result = await updateData('bankAccounts', editing.id, form);
      } else {
        result = await addData('bankAccounts', {
          ...form, id: crypto.randomUUID(), currentBalance: form.initialBalance, createdAt: new Date().toISOString(),
        } as BankAccount);
      }
      if (result) showSyncResult(result);
      setShowModal(false);
      refreshAccounts();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteData('bankAccounts', deleteTarget.id);
    showSyncResult(result, 'Conta excluída');
    setDeleteTarget(null);
    refreshAccounts();
  };
  const openFundModal = (account: BankAccount, type: 'entrada' | 'saida') => {
    setFundModal({ account, type });
    setFundAmount('');
    setFundDescription('');
  };

  const confirmFund = async () => {
    if (!fundModal) return;
    const amount = parseFloat(fundAmount.replace(/[^0-9.,]/g, '').replace(',', '.'));
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      const { account, type } = fundModal;
      const delta = type === 'entrada' ? amount : -amount;

      // Update bank balance
      await updateData('bankAccounts', account.id, {
        currentBalance: account.currentBalance + delta,
      } as any);

      // Register cash movement
      await addData('cashMovements', {
        id: crypto.randomUUID(),
        bankAccountId: account.id,
        type,
        amount,
        currency: account.currency,
        description: fundDescription || (type === 'entrada' ? 'Depósito manual' : 'Retirada manual'),
        date: new Date().toISOString().split('T')[0],
        userId: user?.id,
        userName: user?.name,
        createdAt: new Date().toISOString(),
      });

      showSyncResult({ success: true, localOnly: false }, type === 'entrada' ? 'Depósito realizado' : 'Retirada realizada');
      setFundModal(null);
      refreshAccounts();
    } finally { setSaving(false); }
  };

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const typeIcon = (type: string) => {
    if (type === 'poupanca') return <PiggyBank size={16} className="text-success" />;
    if (type === 'caixa') return <Wallet size={16} className="text-warning" />;
    return <Building2 size={16} className="text-secondary" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'poupanca') return 'Poupança';
    if (type === 'caixa') return 'Caixa';
    return 'Corrente';
  };

  const isCobradorBox = (acc: BankAccount) => {
    return acc.accountType === 'caixa' && cobradores.some(c => acc.name.includes(c.name));
  };

  const filteredAccounts = accounts.filter(acc => {
    if (activeTab === 'empresa') return !isCobradorBox(acc);
    return isCobradorBox(acc);
  });

  const totalByCurrency: Record<string, number> = {};
  filteredAccounts.forEach(acc => {
    if (acc.active) {
      totalByCurrency[acc.currency] = (totalByCurrency[acc.currency] || 0) + acc.currentBalance;
    }
  });

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">{t('menu_contas_bancarias' as any) || 'Contas Bancárias'}</h1>
        {canEditBank('contasBancarias') && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> Nova Conta
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border">
        <button 
          onClick={() => setActiveTab('empresa')} 
          className={`pb-2 text-body-sm pt-2 font-medium border-b-2 transition-colors ${activeTab === 'empresa' ? 'border-secondary text-secondary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Contas da Empresa
        </button>
        <button 
          onClick={() => setActiveTab('cobradores')} 
          className={`pb-2 text-body-sm pt-2 font-medium border-b-2 transition-colors ${activeTab === 'cobradores' ? 'border-secondary text-secondary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Mochilas de Cobradores
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(totalByCurrency).map(([currency, total]) => (
          <div key={currency} className="bg-card rounded-lg p-5 card-shadow border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-body-sm text-muted-foreground">Saldo Total ({currency})</span>
              <Wallet size={20} className={total >= 0 ? 'text-success' : 'text-destructive'} />
            </div>
            <p className={`text-title-section font-bold ${total >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(total, currency as Currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Accounts list */}
      <div className="bg-card rounded-lg card-shadow border border-border overflow-x-auto">
        {filteredAccounts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-body-sm">Nenhuma conta encontrada nesta categoria.</div>
        ) : (
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Conta</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Banco</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Saldo Atual</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map(acc => (
                <tr key={acc.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{acc.name}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{acc.bankName || '—'}</td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center gap-1.5">{typeIcon(acc.accountType)} {typeLabel(acc.accountType)}</span>
                  </td>
                  <td className={`p-3 text-right font-semibold ${acc.currentBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${acc.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {acc.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openFundModal(acc, 'entrada')} className="p-1.5 rounded hover:bg-success/10 text-success transition-colors" title="Depositar"><ArrowDownCircle size={16} /></button>
                      <button onClick={() => openFundModal(acc, 'saida')} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors" title="Retirar"><ArrowUpCircle size={16} /></button>
                      <button onClick={() => setViewingMovements(acc)} className="p-1.5 rounded hover:bg-accent transition-colors" title="Ver Movimentos"><Eye size={16} /></button>
                      {canEditBank('contasBancarias') && <button onClick={() => openEdit(acc)} className="p-1.5 rounded hover:bg-accent transition-colors"><Pencil size={16} /></button>}
                      {canDeleteBank('contasBancarias') && <button onClick={() => setDeleteTarget(acc)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? 'Editar Conta' : 'Nova Conta'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">Nome da Conta</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Conta Principal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Banco</label>
                  <input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} className={inputClass} placeholder="Ex: Itaú" />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Tipo</label>
                  <select value={form.accountType} onChange={e => setForm({ ...form, accountType: e.target.value as any })} className={inputClass}>
                    <option value="corrente">Corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="caixa">Caixa</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Moeda</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as any })} className={inputClass}>
                    {activeCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Saldo Inicial</label>
                  <input type="text" inputMode="decimal" value={form.initialBalance || ''} onChange={e => setForm({ ...form, initialBalance: handleAmountChange(e.target.value) })} placeholder="0,00" className={inputClass} />
                </div>
              </div>
              {editing && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <span className="text-body-sm font-medium">Conta Ativa</span>
                  <button onClick={() => setForm({ ...form, active: !form.active })} className={`w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-success' : 'bg-muted-foreground/30'}`}>
                    <div className={`w-4 h-4 rounded-full bg-card transition-transform mx-1 ${form.active ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? t('common_save') : t('common_create')} />
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Movements Modal */}
      {viewingMovements && (
        <BankAccountMovements
          account={viewingMovements}
          allAccounts={accounts}
          onClose={() => setViewingMovements(null)}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.name || ''}
        itemType="a conta bancária"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Fund/Withdraw Modal */}
      {fundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setFundModal(null)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section flex items-center gap-2">
                {fundModal.type === 'entrada'
                  ? <><ArrowDownCircle size={20} className="text-success" /> Depositar</>
                  : <><ArrowUpCircle size={20} className="text-destructive" /> Retirar</>
                }
              </h2>
              <button onClick={() => setFundModal(null)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-body-sm font-medium">{fundModal.account.name}</p>
              <p className="text-xs text-muted-foreground">Saldo atual: <span className="font-semibold">{formatCurrency(fundModal.account.currentBalance, fundModal.account.currency)}</span></p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">Valor</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fundAmount}
                  onChange={e => setFundAmount(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Descrição</label>
                <input
                  value={fundDescription}
                  onChange={e => setFundDescription(e.target.value)}
                  placeholder={fundModal.type === 'entrada' ? 'Ex: Depósito bancário' : 'Ex: Saque para pagamento'}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={confirmFund} saving={saving} label={fundModal.type === 'entrada' ? 'Depositar' : 'Retirar'} />
                <button onClick={() => setFundModal(null)} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
