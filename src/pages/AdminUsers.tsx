import { useState, useEffect, useCallback } from 'react';
import { fetchAdminUsers, fetchCompanies, createAdminUser, updateAdminUserSupa, deleteAdminUserSupa, resetAdminUserPasswordSupa } from '@/services/adminSupabaseService';
import { AdminUser, AdminUserRole, SaasCompany } from '@/types/admin';
import { Users, Plus, Trash2, KeyRound, Edit2, X, Search, Building2, Loader2 } from 'lucide-react';

const roleLabels: Record<AdminUserRole, string> = {
  proprietario: 'Proprietário', administrador: 'Administrador', financeiro: 'Financeiro', visualizador: 'Visualizador',
};
const roleColors: Record<AdminUserRole, string> = {
  proprietario: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  administrador: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  financeiro: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  visualizador: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const inputClass = 'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-secondary w-full';

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<SaasCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '123456', companyId: '', role: 'visualizador' as AdminUserRole });

  const refreshData = useCallback(async () => {
    const [u, c] = await Promise.all([fetchAdminUsers(), fetchCompanies()]);
    setUsers(u);
    setCompanies(c);
    setLoading(false);
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleSave = async () => {
    if (!form.name || !form.email || !form.companyId) return;
    if (editId) {
      await updateAdminUserSupa(editId, { name: form.name, email: form.email, role: form.role, companyId: form.companyId });
    } else {
      await createAdminUser({ name: form.name, email: form.email, password: form.password, companyId: form.companyId, role: form.role, active: true });
    }
    await refreshData();
    setShowForm(false); setEditId(null);
    setForm({ name: '', email: '', password: '123456', companyId: '', role: 'visualizador' });
  };

  const handleEdit = (u: AdminUser) => {
    setForm({ name: u.name, email: u.email, password: '', companyId: u.companyId, role: u.role });
    setEditId(u.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => { await deleteAdminUserSupa(id); await refreshData(); };

  const handleResetPassword = async () => {
    if (!resetId || newPass.length < 6) return;
    await resetAdminUserPasswordSupa(resetId, newPass);
    setResetId(null); setNewPass(''); await refreshData();
  };

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchCompany = !filterCompany || u.companyId === filterCompany;
    return matchSearch && matchCompany;
  });

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || 'N/A';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-secondary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-lg font-semibold flex items-center gap-2"><Users size={20} /> Usuários</h1>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', email: '', password: '123456', companyId: '', role: 'visualizador' }); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
          <Plus size={14} /> Novo Usuário
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome ou email..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/40 focus:ring-1 focus:ring-secondary outline-none" />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-secondary [&>option]:bg-gray-900">
          <option value="">Todas as empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white font-medium text-sm">{editId ? 'Editar Usuário' : 'Novo Usuário'}</p>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-white/40 hover:text-white"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div><label className="text-white/50 text-xs mb-1 block">Nome *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" className={inputClass} /></div>
            <div><label className="text-white/50 text-xs mb-1 block">Email *</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" className={inputClass} /></div>
            <div>
              <label className="text-white/50 text-xs mb-1 block">Empresa *</label>
              <select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))} className={`${inputClass} [&>option]:bg-gray-900`}>
                <option value="">Selecionar empresa</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/50 text-xs mb-1 block">Permissão *</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AdminUserRole }))} className={`${inputClass} [&>option]:bg-gray-900`}>
                {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {!editId && (
              <div><label className="text-white/50 text-xs mb-1 block">Senha inicial</label><input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputClass} /></div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              {editId ? 'Salvar' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetId && (
        <div className="bg-white/5 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <p className="text-white text-sm font-medium">Resetar Senha — {users.find(u => u.id === resetId)?.name}</p>
          <div className="flex gap-2">
            <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Nova senha (min 6 chars)" className={inputClass} />
            <button onClick={handleResetPassword} className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30 transition-colors whitespace-nowrap">Resetar</button>
            <button onClick={() => { setResetId(null); setNewPass(''); }} className="px-3 py-2 rounded-lg bg-white/10 text-white/60 text-xs hover:bg-white/20 transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {/* User list */}
      <div className="space-y-2">
        {filtered.map(u => (
          <div key={u.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm font-medium">{u.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] border ${roleColors[u.role]}`}>{roleLabels[u.role]}</span>
                {!u.active && <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400 border border-red-500/30">Inativo</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
                <span>{u.email}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Building2 size={10} /> {getCompanyName(u.companyId)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => handleEdit(u)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Editar"><Edit2 size={14} /></button>
              <button onClick={() => { setResetId(u.id); setNewPass(''); }} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-white/40 hover:text-amber-400 transition-colors" title="Resetar senha"><KeyRound size={14} /></button>
              <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors" title="Remover"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-8 text-white/30 text-sm">Nenhum usuário encontrado.</p>}
      </div>
    </div>
  );
}
