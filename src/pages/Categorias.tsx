import { useState, useMemo } from 'react';
import { addData, updateData, deleteData } from '@/services/storageService';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Category, TransactionType } from '@/types';
import { useTranslation } from '@/hooks/useI18n';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Pencil, Trash2, X, Search, Tag } from 'lucide-react';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import SaveButton from '@/components/SaveButton';
import { useSyncToast } from '@/hooks/useSyncToast';

const transactionTypes: TransactionType[] = ['receita', 'despesa', 'investimento', 'retirada'];

const emptyCategory: Omit<Category, 'id'> = { name: '', type: 'receita' };

export default function Categorias() {
  const [categories, refreshCategories] = useRealtimeData('categories');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const { t } = useTranslation();
  const { canEdit: canEditCat, canDelete: canDeleteCat } = usePermissions();
  const [saving, setSaving] = useState(false);
  const { showSyncResult } = useSyncToast();
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const load = () => refreshCategories();

  const filtered = useMemo(() => {
    return categories.filter((c) => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterType && c.type !== filterType) return false;
      return true;
    });
  }, [categories, searchQuery, filterType]);

  const grouped = useMemo(() => {
    const map: Record<string, Category[]> = {};
    transactionTypes.forEach((type) => { map[type] = []; });
    filtered.forEach((c) => {
      if (map[c.type]) map[c.type].push(c);
    });
    return map;
  }, [filtered]);

  const openCreate = () => { setEditing(null); setForm(emptyCategory); setShowModal(true); };
  const openEdit = (c: Category) => { setEditing(c); setForm({ name: c.name, type: c.type }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const result = editing
        ? await updateData('categories', editing.id, form)
        : await addData('categories', { ...form, id: crypto.randomUUID() } as Category);
      showSyncResult(result);
      setShowModal(false); load();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteData('categories', deleteTarget.id);
    showSyncResult(result, 'Categoria excluída');
    setDeleteTarget(null);
    load();
  };

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors";

  const typeColor = (type: TransactionType) => {
    switch (type) {
      case 'receita': return 'bg-success/10 text-success border-success/20';
      case 'despesa': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'investimento': return 'bg-secondary/10 text-secondary border-secondary/20';
      case 'retirada': return 'bg-warning/10 text-warning border-warning/20';
    }
  };

  const typeBadgeColor = (type: TransactionType) => {
    switch (type) {
      case 'receita': return 'bg-success text-success-foreground';
      case 'despesa': return 'bg-destructive text-destructive-foreground';
      case 'investimento': return 'bg-secondary text-secondary-foreground';
      case 'retirada': return 'bg-warning text-warning-foreground';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-title-lg">{t('cat_title')}</h1>
        {canEditCat('categorias') && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-body-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={18} /> {t('cat_new')}
          </button>
        )}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('cat_search')}
            className={inputClass + ' pl-9'}
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TransactionType | '')}
          className="border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors sm:w-52"
        >
          <option value="">{t('cat_all_types')}</option>
          {transactionTypes.map((type) => (
            <option key={type} value={type}>{t(`fin_type_${type}` as any)}</option>
          ))}
        </select>
      </div>

      {/* Grouped categories */}
      <div className="space-y-6">
        {transactionTypes
          .filter((type) => !filterType || filterType === type)
          .map((type) => {
            const items = grouped[type] || [];
            if (items.length === 0 && filterType) return null;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${typeBadgeColor(type)}`}>
                    {t(`fin_type_${type}` as any)}
                  </span>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-muted-foreground text-body-sm py-2">{t('cat_no_results')}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((cat) => (
                      <div key={cat.id} className={`rounded-lg p-4 border card-shadow hover:card-shadow-hover transition-shadow ${typeColor(cat.type)}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Tag size={16} />
                            <span className="font-medium text-body-sm">{cat.name}</span>
                          </div>
                          <div className="flex gap-1">
                            {canEditCat('categorias') && <button onClick={() => openEdit(cat)} className="p-1.5 rounded hover:bg-background/50 transition-colors"><Pencil size={14} /></button>}
                            {canDeleteCat('categorias') && <button onClick={() => setDeleteTarget(cat)} className="p-1.5 rounded hover:bg-background/50 transition-colors"><Trash2 size={14} /></button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm">
          <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-md mx-4 animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-title-section">{editing ? t('cat_edit') : t('cat_new')}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-accent transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">{t('cat_name')}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">{t('cat_type')}</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType })} className={inputClass}>
                  {transactionTypes.map((type) => (
                    <option key={type} value={type}>{t(`fin_type_${type}` as any)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <SaveButton onClick={handleSave} saving={saving} label={editing ? t('common_save') : t('common_create')} />
                <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2.5 rounded-lg border border-border font-medium hover:bg-accent transition-colors">
                  {t('common_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemName={deleteTarget?.name || ''}
        itemType="a categoria"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
