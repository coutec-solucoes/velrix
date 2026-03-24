import { useState } from 'react';
import { AlertTriangle, X, Trash2, Loader2 } from 'lucide-react';

interface DeleteConfirmDialogProps {
  open: boolean;
  itemName: string;
  itemType?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export default function DeleteConfirmDialog({ open, itemName, itemType, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-card rounded-xl card-shadow p-6 w-full max-w-sm mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={20} />
            <h3 className="text-title-section font-semibold">Confirmar Exclusão</h3>
          </div>
          <button onClick={onCancel} disabled={deleting} className="p-1 rounded hover:bg-accent transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 space-y-2">
          <p className="text-body-sm text-muted-foreground">
            {itemType ? `Deseja excluir ${itemType}:` : 'Deseja excluir o registro:'}
          </p>
          <p className="text-body font-semibold bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 break-words">
            {itemName}
          </p>
          <p className="text-xs text-destructive/80">Esta ação não poderá ser desfeita.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground text-body-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
