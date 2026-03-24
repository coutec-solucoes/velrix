import { Loader2 } from 'lucide-react';

interface SaveButtonProps {
  onClick: () => void;
  saving: boolean;
  label: string;
  savingLabel?: string;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export default function SaveButton({ onClick, saving, label, savingLabel, className, icon, disabled }: SaveButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className={className || "flex-1 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center justify-center gap-2"}
    >
      {saving ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {savingLabel || 'Salvando...'}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
}
