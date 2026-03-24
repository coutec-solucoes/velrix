import { useState, useEffect, useCallback } from 'react';
import { Building2, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, CreditCard, CalendarDays, Search, Plus, Ban, Edit2, Trash2, Loader2, Key, Eye, EyeOff, RefreshCw, UserCheck } from 'lucide-react';
import { fetchCompanies, fetchPayments, fetchPlans, updateCompanyStatusSupa, updateCompanyExpirySupa, createPayment, createCompany, updateCompanySupa, deleteCompanySupa, backfillMissingCompanies, fetchAdminUsersWithPassword, resetAdminUserPasswordSupa, generateRandomPassword } from '@/services/adminSupabaseService';
import { applyDocumentMask, applyPhoneMask } from '@/utils/masks';
import { SaasCompany, SaasPayment, CompanyStatus, SaasPlan } from '@/types/admin';
import { format, isPast, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<CompanyStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  ativo: { label: 'Ativo', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  suspenso: { label: 'Suspenso', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: XCircle },
  pendente: { label: 'Pendente', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Clock },
  inativo: { label: 'Inativo', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', icon: Ban },
};

export default function AdminDashboard() {
  const [companies, setCompanies] = useState<SaasCompany[]>([]);
  const [payments, setPayments] = useState<SaasPayment[]>([]);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCountry, setFilterCountry] = useState<'' | 'BR' | 'PY'>('');
  const [showInactive, setShowInactive] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [companyUsers, setCompanyUsers] = useState<Record<string, any[]>>({});
  const [loadingUsers, setLoadingUsers] = useState<Record<string, boolean>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<{ companyId: string; companyName: string; status: CompanyStatus } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ companyId: string; companyName: string } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState<'BRL' | 'PYG' | 'USD'>('BRL');
  const [payDescription, setPayDescription] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payStatus, setPayStatus] = useState<'pago' | 'pendente'>('pago');

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [nc, setNc] = useState({ name: '', document: '', country: 'BR' as 'BR' | 'PY', contactName: '', contactEmail: '', contactPhone: '', planExpiry: '', planId: '' });
  const ncInput = 'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-secondary w-full';

  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);

  const resetNewCompany = () => { setNc({ name: '', document: '', country: 'BR', contactName: '', contactEmail: '', contactPhone: '', planExpiry: '', planId: '' }); setShowNewCompany(false); setEditCompanyId(null); };

  const refreshData = useCallback(async () => {
    const [c, p, pl] = await Promise.all([fetchCompanies(), fetchPayments(), fetchPlans()]);
    setCompanies(c);
    setPayments(p);
    setPlans(pl);
    setLoading(false);
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const loadCompanyUsers = async (companyId: string) => {
    if (companyUsers[companyId]) return;
    setLoadingUsers(prev => ({ ...prev, [companyId]: true }));
    try {
      const users = await fetchAdminUsersWithPassword(companyId);
      setCompanyUsers(prev => ({ ...prev, [companyId]: users }));
    } finally {
      setLoadingUsers(prev => ({ ...prev, [companyId]: false }));
    }
  };

  const handleResetPassword = async (userId: string, companyId: string) => {
    const newPass = generateRandomPassword();
    if (!confirm(`Deseja resetar a senha para: ${newPass}?\n(Copie esta senha antes de confirmar)`)) return;
    
    setResettingPassword(userId);
    try {
      await resetAdminUserPasswordSupa(userId, newPass);
      // Reload users to update displayed password
      const users = await fetchAdminUsersWithPassword(companyId);
      setCompanyUsers(prev => ({ ...prev, [companyId]: users }));
      alert('Senha alterada com sucesso!');
    } catch (error: any) {
      alert('Erro ao resetar senha: ' + error.message);
    } finally {
      setResettingPassword(userId);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction) setConfirmAction(null);
        else if (showNewCompany) resetNewCompany();
        else if (showPaymentForm) setShowPaymentForm(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmAction, showNewCompany, showPaymentForm]);

  const startEditCompany = (c: SaasCompany) => {
    setNc({ name: c.name, document: c.document, country: c.country, contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone, planExpiry: c.planExpiry, planId: c.planId || '' });
    setEditCompanyId(c.id);
    setShowNewCompany(true);
  };

  const handleSaveCompany = async () => {
    if (!nc.name || !nc.document || !nc.contactName || !nc.contactEmail || !nc.planExpiry) {
      setSaveMessage({ type: 'error', text: 'Preencha todos os campos obrigatórios (*)' });
      return;
    }
    
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      if (editCompanyId) {
        await updateCompanySupa(editCompanyId, { 
          name: nc.name, 
          document: nc.document, 
          country: nc.country, 
          contactName: nc.contactName, 
          contactEmail: nc.contactEmail, 
          contactPhone: nc.contactPhone, 
          planExpiry: nc.planExpiry, 
          planId: nc.planId // Pass directly, service handles empty string
        });
      } else {
        await createCompany({ 
          name: nc.name, 
          document: nc.document, 
          country: nc.country, 
          contactName: nc.contactName, 
          contactEmail: nc.contactEmail, 
          contactPhone: nc.contactPhone, 
          status: 'pendente', 
          planExpiry: nc.planExpiry, 
          planId: nc.planId || undefined 
        });
      }
      
      setSaveMessage({ type: 'success', text: editCompanyId ? 'Alterações salvas com sucesso!' : 'Empresa cadastrada com sucesso!' });
      
      // Delay closing to show success message
      setTimeout(async () => {
        await refreshData();
        resetNewCompany();
        setSaveMessage(null);
      }, 1500);
      
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: `Erro ao salvar: ${err.message || 'Erro desconhecido'}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: CompanyStatus) => {
    await updateCompanyStatusSupa(id, status);
    await refreshData();
    setConfirmAction(null);
  };

  const requestStatusChange = (companyId: string, companyName: string, status: CompanyStatus) => {
    setConfirmAction({ companyId, companyName, status });
  };

  const handleExtendPlan = async (id: string) => {
    const company = companies.find(c => c.id === id);
    if (!company) return;
    const current = new Date(company.planExpiry);
    const newDate = new Date(current);
    newDate.setMonth(newDate.getMonth() + 1);
    await updateCompanyExpirySupa(id, newDate.toISOString().split('T')[0]);
    await refreshData();
  };

  const handleAddPayment = async (companyId: string) => {
    if (!payAmount || !payDescription) return;
    await createPayment({
      companyId,
      amount: parseFloat(payAmount),
      currency: payCurrency,
      date: payDate,
      description: payDescription,
      status: payStatus,
    });
    await refreshData();
    setShowPaymentForm(null);
    setPayAmount(''); setPayDescription(''); setPayDate(new Date().toISOString().split('T')[0]); setPayStatus('pago');
  };

  const handleDeleteCompany = async (id: string) => {
    await deleteCompanySupa(id);
    await refreshData();
    setConfirmDelete(null);
  };

  const filtered = companies.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.document.includes(search) ||
      c.contactEmail.toLowerCase().includes(search.toLowerCase());
    const matchCountry = !filterCountry || c.country === filterCountry;
    const matchActive = showInactive ? c.status === 'inativo' : c.status !== 'inativo';
    return matchSearch && matchCountry && matchActive;
  });

  const stats = {
    total: companies.filter(c => c.status !== 'inativo').length,
    ativo: companies.filter(c => c.status === 'ativo').length,
    suspenso: companies.filter(c => c.status === 'suspenso').length,
    pendente: companies.filter(c => c.status === 'pendente').length,
    inativo: companies.filter(c => c.status === 'inativo').length,
  };

  const getExpiryInfo = (date: string) => {
    if (!date) return { text: 'Sem data', className: 'text-white/40' };
    const d = new Date(date);
    const days = differenceInDays(d, new Date());
    if (isPast(d)) return { text: `Expirado há ${Math.abs(days)} dias`, className: 'text-red-400' };
    if (days <= 7) return { text: `Expira em ${days} dias`, className: 'text-amber-400' };
    return { text: format(d, "dd/MM/yyyy", { locale: ptBR }), className: 'text-white/60' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-secondary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'border-white/10' },
            { label: 'Ativos', value: stats.ativo, color: 'border-emerald-500/30' },
            { label: 'Suspensos', value: stats.suspenso, color: 'border-red-500/30' },
            { label: 'Pendentes', value: stats.pendente, color: 'border-amber-500/30' },
            { label: 'Inativos', value: stats.inativo, color: 'border-gray-500/30' },
          ].map(s => (
            <div key={s.label} className={`bg-white/5 rounded-xl border ${s.color} p-4`}>
              <p className="text-white/50 text-xs uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresa, CNPJ, RUC ou email..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-secondary focus:border-secondary outline-none"
            />
          </div>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value as '' | 'BR' | 'PY')}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-secondary [&>option]:bg-gray-900 sm:w-48">
            <option value="">Todos os países</option>
            <option value="BR">🇧🇷 Brasil</option>
            <option value="PY">🇵🇾 Paraguay</option>
          </select>
          <button onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
              showInactive ? 'bg-gray-500/15 text-gray-300 border-gray-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:text-white'
            }`}>
            <Ban size={14} className="inline mr-1.5" />{showInactive ? 'Ver ativos' : 'Ver inativos'}
          </button>
        </div>

        {/* New Company Button / Form */}
        {showNewCompany ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-medium text-sm flex items-center gap-2"><Building2 size={16} className="text-secondary" /> {editCompanyId ? 'Editar Empresa' : 'Nova Empresa'}</p>
              <button onClick={resetNewCompany} className="text-white/40 hover:text-white text-xs">Cancelar</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-white/50 text-xs mb-1 block">Nome da empresa *</label>
                <input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} placeholder="Nome da empresa" className={ncInput} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">País *</label>
                <select value={nc.country} onChange={e => setNc(p => ({ ...p, country: e.target.value as 'BR' | 'PY', document: '' }))}
                  className={`${ncInput} [&>option]:bg-gray-900`}>
                  <option value="BR">🇧🇷 Brasil</option>
                  <option value="PY">🇵🇾 Paraguay</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">{nc.country === 'BR' ? 'CNPJ' : 'RUC'} *</label>
                <input value={nc.document} onChange={e => setNc(p => ({ ...p, document: applyDocumentMask(e.target.value, p.country, 'empresa') }))}
                  placeholder={nc.country === 'BR' ? '00.000.000/0001-00' : '80000000-0'} className={ncInput} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Vencimento do plano *</label>
                <input type="date" value={nc.planExpiry} onChange={e => setNc(p => ({ ...p, planExpiry: e.target.value }))}
                  className={`${ncInput} [color-scheme:dark]`} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Nome do contato *</label>
                <input value={nc.contactName} onChange={e => setNc(p => ({ ...p, contactName: e.target.value }))} placeholder="Responsável" className={ncInput} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Email do contato *</label>
                <input type="email" value={nc.contactEmail} onChange={e => setNc(p => ({ ...p, contactEmail: e.target.value }))} placeholder="email@empresa.com" className={ncInput} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Telefone</label>
                <input value={nc.contactPhone} onChange={e => setNc(p => ({ ...p, contactPhone: applyPhoneMask(e.target.value, p.country) }))}
                  placeholder={nc.country === 'BR' ? '(11) 99999-0000' : '(0981) 000-000'} className={ncInput} />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Plano Selecionado</label>
                <select value={nc.planId} onChange={e => setNc(p => ({ ...p, planId: e.target.value }))}
                  className={`${ncInput} [&>option]:bg-gray-900`}>
                  <option value="">Nenhum plano (Basico)</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.currency} {p.price})</option>
                  ))}
                </select>
              </div>
            </div>
            {saveMessage && (
              <div className={`p-3 rounded-lg text-xs font-medium border ${
                saveMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}>
                {saveMessage.text}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button 
                onClick={handleSaveCompany} 
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 
                {editCompanyId ? 'Salvar Alterações' : 'Cadastrar Empresa'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowNewCompany(true)} className="flex-1 py-3 rounded-xl border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 text-sm flex items-center justify-center gap-2 transition-colors">
              <Plus size={16} /> Cadastrar Nova Empresa
            </button>
            <button
              onClick={async () => {
                const result = await backfillMissingCompanies();
                if (result.error) {
                  alert(`Erro no backfill: ${result.error}`);
                } else if (result.created > 0) {
                  alert(`${result.created} empresa(s) recuperada(s) com sucesso!`);
                  await refreshData();
                } else {
                  alert('Nenhuma empresa faltando encontrada.');
                }
              }}
              className="py-3 px-4 rounded-xl border border-dashed border-amber-500/30 text-amber-400/70 hover:text-amber-300 hover:border-amber-400/50 text-sm flex items-center justify-center gap-2 transition-colors"
              title="Recuperar empresas cadastradas que não aparecem no painel"
            >
              🔄 Recuperar Faltantes
            </button>
          </div>
        )}

        {/* Company List */}
        <div className="space-y-3">
          {filtered.map(company => {
            const expiry = getExpiryInfo(company.planExpiry);
            const sc = statusConfig[company.status];
            const Icon = sc.icon;
            const isExpanded = expandedId === company.id;
            const companyPayments = payments.filter(p => p.companyId === company.id);

            return (
              <div key={company.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => {
                    const newId = isExpanded ? null : company.id;
                    setExpandedId(newId);
                    if (newId) loadCompanyUsers(newId);
                  }}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-medium text-sm truncate">{company.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${sc.color}`}>
                        <Icon size={12} /> {sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      <span className="text-white/40">{company.document}</span>
                      <span className="text-white/30">•</span>
                      <span className={expiry.className}>{expiry.text}</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10 p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-white/40 text-xs mb-0.5">Contato</p>
                        <p className="text-white">{company.contactName}</p>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs mb-0.5">Email</p>
                        <p className="text-white">{company.contactEmail}</p>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs mb-0.5">Telefone</p>
                        <p className="text-white">{company.contactPhone}</p>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs mb-0.5">Plano</p>
                        <p className="text-secondary font-medium">{plans.find(p => p.id === company.planId)?.name || 'Financeiro Básico'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => startEditCompany(company)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary border border-secondary/30 text-xs font-medium hover:bg-secondary/25 transition-colors">
                        <Edit2 size={14} /> Editar
                      </button>
                      <button onClick={() => setConfirmDelete({ companyId: company.id, companyName: company.name })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-medium hover:bg-red-500/25 transition-colors">
                        <Trash2 size={14} /> Excluir
                      </button>
                      {company.status !== 'ativo' && company.status !== 'inativo' && (
                        <button onClick={() => requestStatusChange(company.id, company.name, 'ativo')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/25 transition-colors">
                          <CheckCircle size={14} /> Liberar Acesso
                        </button>
                      )}
                      {company.status !== 'suspenso' && company.status !== 'inativo' && (
                        <button onClick={() => requestStatusChange(company.id, company.name, 'suspenso')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-medium hover:bg-red-500/25 transition-colors">
                          <XCircle size={14} /> Suspender
                        </button>
                      )}
                      {company.status === 'suspenso' && (
                        <button onClick={() => requestStatusChange(company.id, company.name, 'inativo')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-500/15 text-gray-400 border border-gray-500/30 text-xs font-medium hover:bg-gray-500/25 transition-colors">
                          <Ban size={14} /> Inativar
                        </button>
                      )}
                      {company.status === 'inativo' && (
                        <button onClick={() => requestStatusChange(company.id, company.name, 'ativo')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/25 transition-colors">
                          <CheckCircle size={14} /> Reativar
                        </button>
                      )}
                      {company.status !== 'inativo' && (
                        <button onClick={() => handleExtendPlan(company.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary border border-secondary/30 text-xs font-medium hover:bg-secondary/25 transition-colors">
                          <CalendarDays size={14} /> +1 Mês
                        </button>
                      )}
                    </div>

                    <div>
                      <h4 className="text-white/60 text-xs uppercase tracking-wide mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Key size={13} /> Credenciais de Acesso</span>
                        <button 
                          onClick={() => setShowPasswords(prev => ({ ...prev, [company.id]: !prev[company.id] }))}
                          className="text-[10px] text-secondary hover:underline"
                        >
                          {showPasswords[company.id] ? 'Ocultar senhas' : 'Ver senhas'}
                        </button>
                      </h4>
                      
                      {loadingUsers[company.id] ? (
                        <div className="flex items-center gap-2 text-white/30 text-xs py-2">
                          <Loader2 size={12} className="animate-spin" /> Carregando usuários...
                        </div>
                      ) : (companyUsers[company.id] || []).length === 0 ? (
                        <p className="text-white/30 text-xs py-1">Nenhum usuário gestor encontrado.</p>
                      ) : (
                        <div className="space-y-2 mb-4">
                          {(companyUsers[company.id] || []).map(user => (
                            <div key={user.id} className="bg-white/5 border border-white/5 rounded-lg p-2.5 flex items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-white font-medium text-xs truncate">{user.name}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-secondary/10 text-secondary border border-secondary/20">{user.role}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px]">
                                  <span className="text-white/40 truncate">{user.email}</span>
                                  <span className="text-white/20">|</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-white/40">Senha:</span>
                                    <span className={`font-mono ${showPasswords[company.id] ? 'text-emerald-400' : 'text-white/20 select-none'}`}>
                                      {showPasswords[company.id] ? user.password : '••••••••••'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleResetPassword(user.id, company.id)}
                                disabled={resettingPassword === user.id}
                                className="p-2 rounded-md hover:bg-white/5 text-white/40 hover:text-secondary transition-colors"
                                title="Resetar/Gerar Nova Senha"
                              >
                                {resettingPassword === user.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <h4 className="text-white/60 text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <CreditCard size={13} /> Histórico de Pagamentos
                      </h4>
                      {companyPayments.length === 0 ? (
                        <p className="text-white/30 text-xs">Nenhum pagamento registrado.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {companyPayments.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'pago' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                <span className="text-white/80">{p.description}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-white/40">{format(new Date(p.date), 'dd/MM/yyyy')}</span>
                                <span className="text-white font-medium">
                                  {p.currency === 'PYG' ? `₲ ${p.amount.toLocaleString('es-PY')}` : `R$ ${p.amount.toFixed(2)}`}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {showPaymentForm === company.id ? (
                        <div className="mt-3 bg-white/5 border border-white/10 rounded-lg p-3 space-y-2.5">
                          <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Novo Pagamento</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <input type="number" step="0.01" placeholder="Valor" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-secondary" />
                            <select value={payCurrency} onChange={e => setPayCurrency(e.target.value as any)}
                              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-secondary [&>option]:bg-gray-900">
                              <option value="BRL">R$ (BRL)</option>
                              <option value="PYG">₲ (PYG)</option>
                              <option value="USD">$ (USD)</option>
                            </select>
                            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-secondary [color-scheme:dark]" />
                            <select value={payStatus} onChange={e => setPayStatus(e.target.value as any)}
                              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-secondary [&>option]:bg-gray-900">
                              <option value="pago">Pago</option>
                              <option value="pendente">Pendente</option>
                            </select>
                          </div>
                          <input type="text" placeholder="Descrição (ex: Mensalidade Março/2026)" value={payDescription} onChange={e => setPayDescription(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-secondary" />
                          <div className="flex gap-2">
                            <button onClick={() => setShowPaymentForm(null)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/60 text-xs hover:bg-white/20 transition-colors">Cancelar</button>
                            <button onClick={() => handleAddPayment(company.id)} className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity">Salvar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setShowPaymentForm(company.id); setPayCurrency(company.country === 'PY' ? 'PYG' : 'BRL'); }}
                          className="mt-2 flex items-center gap-1.5 text-xs text-secondary hover:text-secondary/80 transition-colors">
                          <Plus size={14} /> Registrar pagamento
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-white/30 text-sm">Nenhuma empresa encontrada.</div>
          )}
        </div>

      {/* Confirmation Modal */}
      {confirmAction && (() => {
        const actionLabels: Record<CompanyStatus, { title: string; desc: string; btnText: string; btnClass: string }> = {
          suspenso: { title: 'Suspender Empresa', desc: `Tem certeza que deseja suspender a empresa "${confirmAction.companyName}"? O acesso ao sistema será bloqueado.`, btnText: 'Suspender', btnClass: 'bg-red-500 hover:bg-red-600 text-white' },
          inativo: { title: 'Inativar Empresa', desc: `Tem certeza que deseja inativar a empresa "${confirmAction.companyName}"? Ela será removida da listagem principal.`, btnText: 'Inativar', btnClass: 'bg-gray-500 hover:bg-gray-600 text-white' },
          ativo: { title: 'Ativar Empresa', desc: `Deseja ativar/reativar a empresa "${confirmAction.companyName}"? O acesso ao sistema será liberado.`, btnText: 'Confirmar', btnClass: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
          pendente: { title: 'Pendente', desc: '', btnText: 'Confirmar', btnClass: 'bg-amber-500 text-white' },
        };
        const cfg = actionLabels[confirmAction.status];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
            <div className="bg-gray-900 border border-white/10 rounded-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-white font-semibold text-lg">{cfg.title}</h3>
              <p className="text-white/60 text-sm">{cfg.desc}</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => handleStatusChange(confirmAction.companyId, confirmAction.status)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${cfg.btnClass}`}>
                  {cfg.btnText}
                </button>
                <button onClick={() => setConfirmAction(null)} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg">Excluir Empresa</h3>
            <p className="text-white/60 text-sm">Tem certeza que deseja excluir permanentemente a empresa "<strong className="text-white">{confirmDelete.companyName}</strong>"? Todos os pagamentos e usuários associados também serão removidos. Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleDeleteCompany(confirmDelete.companyId)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-red-500 hover:bg-red-600 text-white">
                Excluir
              </button>
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2.5 rounded-lg text-sm font-medium border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
