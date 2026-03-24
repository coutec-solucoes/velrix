import { useState } from 'react';
import { addData, updateData, deleteData } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { User, ALL_MODULES, AppModule, UserPermissions, getDefaultPermissions, UserRole } from '@/types';
import { useTranslation } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Pencil, Trash2, X, Eye, EyeOff, Shield, ChevronDown, ChevronUp, Copy, Building2 } from 'lucide-react';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';
import { useToast } from '@/hooks/use-toast';

const emptyUser: Omit<User, 'id' | 'createdAt'> = { name: '', username: '', email: '', password: '', role: 'visualizador' };

export default function Usuarios() {
  const { user: authUser } = useAuth();
  const [users, refreshUsers] = useRealtimeData('users');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Omit<User, 'id' | 'createdAt'>>(emptyUser);
  const [showPassword, setShowPassword] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const { showSyncResult } = useSyncToast();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const load = () => refreshUsers();

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyUser, permissions: getDefaultPermissions('visualizador') });
    setShowPassword(false);
    setShowPermissions(false);
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ ...u, password: '', username: u.username || '', permissions: u.permissions || getDefaultPermissions(u.role) });
    setShowPassword(false);
    setShowPermissions(false);
    setShowModal(true);
  };

  const handleRoleChange = (role: UserRole) => {
    setForm({ ...form, role, permissions: getDefaultPermissions(role) });
  };

  const togglePermission = (module: AppModule, perm: 'view' | 'edit' | 'delete') => {
    const current = form.permissions || getDefaultPermissions(form.role);
    const modulePerm = { ...current[module] };

    if (perm === 'view' && modulePerm.view) {
      // Disabling view also disables edit and delete
      modulePerm.view = false;
      modulePerm.edit = false;
      modulePerm.delete = false;
    } else if (perm === 'view') {
      modulePerm.view = true;
    } else if (perm === 'edit') {
      modulePerm.edit = !modulePerm.edit;
      if (modulePerm.edit) modulePerm.view = true;
    } else if (perm === 'delete') {
      modulePerm.delete = !modulePerm.delete;
      if (modulePerm.delete) { modulePerm.view = true; modulePerm.edit = true; }
    }

    setForm({
      ...form,
      permissions: { ...current, [module]: modulePerm },
    });
  };

  const handleSave = async () => {
    if (!form.name || (!editing && !form.password)) return;
    setSaving(true);
    try {
      const cleanForm = {
        ...form,
        email: form.email?.trim() || null,
        username: form.username?.trim() || null,
      };
      
      const payload = editing && !form.password
        ? { ...cleanForm, password: undefined }
        : cleanForm;

      const result = editing
        ? await updateData('users', editing.id, payload)
        : await addData('users', { ...cleanForm, id: crypto.randomUUID(), createdAt: new Date().toISOString() } as User);
      showSyncResult(result);
      setShowModal(false);
      load();
    } catch (err: any) {
      console.error('[Usuarios] Erro ao salvar:', err);
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Verifique se o e-mail ou nome de usuário já está em uso.',
        variant: 'destructive'
      });
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteData('users', deleteTarget.id);
    showSyncResult(result, 'Usuário excluído');
    setDeleteTarget(null);
    load();
  };

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none";

  const roleColors: Record<string, string> = {
    proprietario: 'bg-secondary/10 text-secondary',
    administrador: 'bg-warning/10 text-warning',
    financeiro: 'bg-success/10 text-success',
    visualizador: 'bg-muted text-muted-foreground',
    cobrador: 'bg-blue-500/10 text-blue-500',
  };

  const getRoleLabel = (role: string) => t(`role_${role}` as any);

  const permCount = (u: User) => {
    const perms = u.permissions || getDefaultPermissions(u.role);
    const total = ALL_MODULES.length;
    const accessible = ALL_MODULES.filter(m => perms[m.key]?.view).length;
    return `${accessible}/${total}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">{t('usr_title')}</p>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
          <Plus size={18} /> {t('usr_new')}
        </button>
      </div>

      {/* Company code info for collaborator login */}
      {authUser?.document && (
        <div className="flex items-center gap-3 bg-secondary/10 border border-secondary/20 rounded-lg px-4 py-3">
          <Building2 size={18} className="text-secondary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-medium">Código da empresa para login de colaboradores</p>
            <p className="text-xs text-muted-foreground mt-0.5">Os colaboradores devem usar este CNPJ/RUC na tela de login</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <code className="bg-background border border-border rounded px-3 py-1.5 text-sm font-mono font-semibold select-all">
              {authUser.document}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(authUser.document || '');
                toast({ title: '✅ Copiado!', description: 'Código da empresa copiado.' });
              }}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Copiar"
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map((u) => (
          <div key={u.id} className="bg-background rounded-lg p-5 border border-border">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-semibold">
                  {u.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold">{u.name}</p>
                  {u.username && <p className="text-xs text-secondary">@{u.username}</p>}
                  <p className="text-body-sm text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-accent"><Pencil size={16} /></button>
                <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleColors[u.role]}`}>
                {getRoleLabel(u.role)}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield size={12} /> {permCount(u)} módulos
              </span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40">
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? t('usr_edit') : t('usr_new')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-body-sm font-medium mb-1">{t('usr_name')}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></div>
              <div><label className="block text-body-sm font-medium mb-1">Nome de Usuário (login) <span className="text-muted-foreground text-xs">(opcional)</span></label><input value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} placeholder="Ex: couto" /></div>
              <div><label className="block text-body-sm font-medium mb-1">{t('usr_email')} <span className="text-muted-foreground text-xs">(opcional)</span></label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="email@empresa.com" /></div>
              <div>
                <label className="block text-body-sm font-medium mb-1">
                  {t('usr_password')}
                  {editing && <span className="text-muted-foreground text-xs ml-1">(opcional)</span>}
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} placeholder={editing ? 'Deixe em branco para manter a senha atual' : 'Senha do colaborador'} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {editing && !form.password && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                    A senha atual será mantida
                  </p>
                )}
                {editing && form.password && form.password.length < 6 && (
                  <p className="text-xs text-destructive mt-1">Mínimo de 6 caracteres</p>
                )}
              </div>
              <div><label className="block text-body-sm font-medium mb-1">{t('usr_access_type')}</label>
                <select value={form.role} onChange={(e) => handleRoleChange(e.target.value as UserRole)} className={inputClass}>
                  <option value="proprietario">{t('role_proprietario')}</option>
                  <option value="administrador">{t('role_administrador')}</option>
                  <option value="financeiro">{t('role_financeiro')}</option>
                  <option value="visualizador">{t('role_visualizador')}</option>
                  <option value="cobrador">{t('role_cobrador')}</option>
                </select>
              </div>

              {/* Permissions section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPermissions(!showPermissions)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-body-sm font-medium flex items-center gap-2">
                    <Shield size={16} className="text-secondary" />
                    Permissões por Módulo
                  </span>
                  {showPermissions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showPermissions && (
                  <div className="p-3">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-xs">
                      <div className="font-semibold text-muted-foreground pb-1">Módulo</div>
                      <div className="font-semibold text-muted-foreground text-center pb-1 w-12">Ver</div>
                      <div className="font-semibold text-muted-foreground text-center pb-1 w-12">Editar</div>
                      <div className="font-semibold text-muted-foreground text-center pb-1 w-12">Excluir</div>

                      {ALL_MODULES.map(mod => {
                        const perms = form.permissions || getDefaultPermissions(form.role);
                        const mp = perms[mod.key];
                        return (
                          <div key={mod.key} className="contents">
                            <div className="py-1.5 text-body-sm">{mod.label}</div>
                            <div className="flex justify-center py-1.5">
                              <input
                                type="checkbox"
                                checked={mp?.view ?? false}
                                onChange={() => togglePermission(mod.key, 'view')}
                                className="w-4 h-4 rounded border-border text-secondary focus:ring-secondary accent-secondary"
                              />
                            </div>
                            <div className="flex justify-center py-1.5">
                              <input
                                type="checkbox"
                                checked={mp?.edit ?? false}
                                onChange={() => togglePermission(mod.key, 'edit')}
                                className="w-4 h-4 rounded border-border text-secondary focus:ring-secondary accent-secondary"
                              />
                            </div>
                            <div className="flex justify-center py-1.5">
                              <input
                                type="checkbox"
                                checked={mp?.delete ?? false}
                                onChange={() => togglePermission(mod.key, 'delete')}
                                className="w-4 h-4 rounded border-border text-secondary focus:ring-secondary accent-secondary"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? t('common_save') : t('common_create')} />
                <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">{t('common_cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.name || ''}
        itemType="o usuário"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
