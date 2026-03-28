import { useState, useMemo, useEffect } from 'react';
import { addData, updateData, deleteData } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Cobrador } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Pencil, Trash2, X, Search, Route, ToggleLeft, ToggleRight } from 'lucide-react';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';
import { applyPhoneMask } from '@/utils/masks';
import { getAppData } from '@/services/storageService';

const emptyCobrador: Omit<Cobrador, 'id' | 'createdAt'> = {
  name: '',
  region: '',
  sector: '',
  phone: '',
  email: '',
  active: true,
  userId: '',
};

export default function CobradoresList() {
  const [cobradores, refreshCobradores] = useRealtimeData('cobradores');
  const [users] = useRealtimeData('users');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Cobrador | null>(null);
  const [form, setForm] = useState(emptyCobrador);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Cobrador | null>(null);
  const { canEdit, canDelete } = usePermissions();
  const [saving, setSaving] = useState(false);
  const { showSyncResult } = useSyncToast();
  const settings = getAppData().settings;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        setShowModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const cobradorUsers = useMemo(() => {
    return users.filter(u => u.role === 'cobrador');
  }, [users]);

  const filteredCobradores = useMemo(() => {
    return cobradores.filter((c) => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterActive === 'active' && !c.active) return false;
      if (filterActive === 'inactive' && c.active) return false;
      return true;
    });
  }, [cobradores, searchQuery, filterActive]);

  const openCreate = () => { setEditing(null); setForm({ ...emptyCobrador }); setShowModal(true); };
  const openEdit = (c: Cobrador) => { setEditing(c); setForm({ ...emptyCobrador, ...c, userId: c.userId || '' }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const dataToSave = {
        ...form,
        userId: form.userId || undefined,
      };

      if (editing) {
        const result = await updateData('cobradores', editing.id, dataToSave);
        showSyncResult(result);
      } else {
        const newCobradorId = crypto.randomUUID();
        const cobradorData = { ...dataToSave, id: newCobradorId, createdAt: new Date().toISOString() } as Cobrador;
        const result = await addData('cobradores', cobradorData);
        
        // Auto-create Caixa Físico accounts for this new cobrador
        const activeCurrencies = settings?.company?.activeCurrencies || ['BRL'];
        for (const curr of activeCurrencies) {
          await addData('bankAccounts', {
            id: crypto.randomUUID(),
            name: `Caixa ${dataToSave.name} - ${curr}`,
            bankName: 'Caixa Físico',
            accountType: 'caixa',
            currency: curr,
            initialBalance: 0,
            currentBalance: 0,
            active: true,
            createdAt: new Date().toISOString(),
          });
        }
        
        showSyncResult(result);
      }
      
      setShowModal(false);
      refreshCobradores();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteData('cobradores', deleteTarget.id);
    showSyncResult(result, 'Cobrador excluído');
    setDeleteTarget(null);
    refreshCobradores();
  };

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  if (!settings?.cobradoresEnabled) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-card rounded-lg card-shadow border border-border">
        <Route size={48} className="text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-title-section font-semibold mb-2">Módulo Inativo</h2>
        <p className="text-muted-foreground text-center">O módulo de cobradores está desativado. Ative-o nas Configurações da Empresa para utilizá-lo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">Cobradores</h1>
        {canEdit('cobradores') && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> Novo Cobrador
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Pesquisar por nome..." className={inputClass + ' pl-9'} />
        </div>
        <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none sm:w-40">
          <option value="all">Todos</option>
          <option value="active">🟢 Ativos</option>
          <option value="inactive">🔴 Inativos</option>
        </select>
      </div>

      {/* Cobradores Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCobradores.map((c) => (
          <div key={c.id} className="bg-card rounded-lg p-5 card-shadow border border-border hover:card-shadow-hover transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate text-body">{c.name}</p>
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${c.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {c.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground flex gap-2 items-center flex-wrap mt-1">
                  {c.region && <span>🗺️ {c.region}</span>}
                  {c.sector && <span>📍 {c.sector}</span>}
                </p>
              </div>
              <div className="flex gap-1 ml-2">
                {canEdit('cobradores') && <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-accent transition-colors"><Pencil size={16} /></button>}
                {canDelete('cobradores') && <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={16} /></button>}
              </div>
            </div>

            <div className="text-body-sm text-muted-foreground space-y-0.5 mt-auto">
              {c.phone && <p className="truncate">📱 {c.phone}</p>}
              {c.email && <p className="truncate">📧 {c.email}</p>}
              {c.userId && (
                <p className="mt-2 text-xs border-t border-border pt-2 text-secondary font-medium">
                  Modo App: Vinculado ({users.find(u => u.id === c.userId)?.name || c.userId})
                </p>
              )}
            </div>
          </div>
        ))}
        {filteredCobradores.length === 0 && (
          <p className="text-muted-foreground text-body-sm col-span-full text-center py-8">Nenhum cobrador encontrado.</p>
        )}
      </div>

      {/* CREATE/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? 'Editar Cobrador' : 'Novo Cobrador'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">Nome Completo</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Nome do cobrador" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Região</label>
                  <input value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })} className={inputClass} placeholder="Ex: Zona Norte" />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Setor</label>
                  <input value={form.sector || ''} onChange={(e) => setForm({ ...form, sector: e.target.value })} className={inputClass} placeholder="Ex: Setor 1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-body-sm font-medium mb-1">Telefone / WhatsApp</label>
                  <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: applyPhoneMask(e.target.value, settings?.company?.country || 'BR') })} className={inputClass} placeholder="Telefone de contato" />
                </div>
                <div>
                  <label className="block text-body-sm font-medium mb-1">Email</label>
                  <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="Email" />
                </div>
              </div>

              <div className="p-4 border border-secondary/20 bg-secondary/5 rounded-lg space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-body-sm font-medium text-secondary">Acesso ao App (Opcional)</p>
                    <p className="text-xs text-muted-foreground">Vincule um usuário para o cobrador acessar a versão restrita e dar baixa em parcelas.</p>
                  </div>
                </div>
                <div>
                  <select value={form.userId || ''} onChange={(e) => setForm({ ...form, userId: e.target.value })} className={inputClass}>
                    <option value="">Sem acesso ao sistema</option>
                    {cobradorUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  {cobradorUsers.length === 0 && (
                    <p className="text-[10px] text-warning mt-1">Nenhum usuário com permissão de 'Cobrador' encontrado. Crie um em Configurações &gt; Usuários.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-body-sm font-medium">Cobrador Ativo</span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, active: !form.active })}
                  className="flex items-center gap-2 transition-colors"
                >
                  {form.active ? <ToggleRight size={32} className="text-success" /> : <ToggleLeft size={32} className="text-muted-foreground" />}
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? 'Salvar' : 'Criar'} />
                <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.name || ''}
        itemType="o cobrador"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
