import { useState, useRef, useEffect } from 'react';
import { Bell, X, AlertCircle, AlertTriangle, Info, CheckCheck } from 'lucide-react';
import { AppNotification, NotificationSeverity } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface NotificationCenterProps {
  notifications: AppNotification[];
}

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  if (severity === 'error') return <AlertCircle size={14} className="text-destructive flex-shrink-0 mt-0.5" />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />;
  return <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />;
}

function severityBorder(severity: NotificationSeverity): string {
  if (severity === 'error') return 'border-l-2 border-destructive';
  if (severity === 'warning') return 'border-l-2 border-warning';
  return 'border-l-2 border-blue-500';
}

export default function NotificationCenter({ notifications }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  const visible = notifications.filter((n) => !dismissed.has(n.id));
  const errorCount = visible.filter((n) => n.severity === 'error').length;
  const total = visible.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const dismiss = (id: string) => setDismissed((prev) => new Set([...prev, id]));
  const dismissAll = () => setDismissed(new Set(visible.map((n) => n.id)));

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative p-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
          open && 'bg-accent text-foreground',
        )}
        title="Notificações"
      >
        <Bell size={20} />
        {total > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 text-white',
              errorCount > 0 ? 'bg-destructive' : 'bg-warning',
            )}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-muted-foreground" />
              <span className="text-sm font-semibold">Notificações</span>
              {total > 0 && (
                <span className="text-xs bg-accent text-muted-foreground px-1.5 py-0.5 rounded-full">{total}</span>
              )}
            </div>
            {total > 0 && (
              <button
                onClick={dismissAll}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                title="Marcar todas como lidas"
              >
                <CheckCheck size={13} />
                Limpar
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma notificação pendente</p>
              </div>
            ) : (
              visible.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'group flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors',
                    severityBorder(n.severity),
                  )}
                >
                  <SeverityIcon severity={n.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  </div>
                  <button
                    onClick={() => dismiss(n.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5"
                    title="Dispensar"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
