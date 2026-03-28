import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { AppModule } from '@/types';
import { getAppData, onRealtimeStatusChange, getRealtimeStatus, onContractSigned, onDataChange, type RealtimeStatus } from '@/services/storageService';
import { getData } from '@/services/storageService';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/useTheme';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationCenter from '@/components/NotificationCenter';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import {
  LayoutDashboard,
  DollarSign,
  Users,
  FileText,
  Settings,
  Menu,
  X,
  ChevronLeft,
  LogOut,
  Tag,
  Sun,
  Moon,
  Landmark,
  BookOpen,
  Wifi,
  WifiOff,
  RefreshCw,
  ClipboardList,
  BarChart3,
  Route,
} from 'lucide-react';
import veltorIcon from '@/assets/veltor-icon.png';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/translations';

const menuItems: { labelKey: TranslationKey; icon: any; path: string; module: AppModule }[] = [
  { labelKey: 'menu_dashboard', icon: LayoutDashboard, path: '/', module: 'dashboard' },
  { labelKey: 'menu_financeiro', icon: DollarSign, path: '/financeiro', module: 'financeiro' },
  { labelKey: 'menu_caixa' as TranslationKey, icon: BookOpen, path: '/caixa', module: 'caixa' },
  { labelKey: 'menu_contas_bancarias' as TranslationKey, icon: Landmark, path: '/contas-bancarias', module: 'contasBancarias' },
  { labelKey: 'menu_clientes', icon: Users, path: '/clientes', module: 'clientes' },
  { labelKey: 'menu_categorias', icon: Tag, path: '/categorias', module: 'categorias' },
  { labelKey: 'menu_contratos', icon: FileText, path: '/contratos', module: 'contratos' },
  { labelKey: 'menu_cobradores' as TranslationKey, icon: Route, path: '/cobradores', module: 'cobradores' },
  { labelKey: 'menu_relatorios' as TranslationKey, icon: BarChart3, path: '/relatorios', module: 'relatorios' },
  { labelKey: 'menu_auditoria' as TranslationKey, icon: ClipboardList, path: '/auditoria', module: 'auditoria' },
  { labelKey: 'menu_configuracoes', icon: Settings, path: '/configuracoes', module: 'configuracoes' },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { canView } = usePermissions();
  const { theme, toggleTheme } = useTheme();
  const currentMenuItem = menuItems.find((i) => i.path === location.pathname);
  const [appData, setAppData] = useState(getAppData());
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>(getRealtimeStatus());
  const [transactions] = useRealtimeData('transactions');
  const [bankAccounts] = useRealtimeData('bankAccounts');
  const notifications = useNotifications(transactions, bankAccounts, appData.settings ?? null);

  useEffect(() => {
    const unsubStatus = onRealtimeStatusChange(setRtStatus);
    const unsubData = onDataChange(() => {
      setAppData(getAppData());
    });
    return () => {
      unsubStatus();
      unsubData();
    };
  }, []);

  // Listen for contracts signed by clients on the public page
  useEffect(() => {
    return onContractSigned((contractData) => {
      const clients = appData.clients || [];
      const clientName = clients.find((c) => c.id === contractData.clientId)?.name || 'Cliente';
      toast.success(`✍️ Contrato assinado!`, {
        description: `${clientName} assinou o contrato "${contractData.description || 'Contrato'}" agora mesmo.`,
        duration: 10000,
      });
    });
  }, [appData.clients]);

  // Get company branding from reactive appData
  const companyBranding = useMemo(() => {
    return {
      name: appData.settings?.company?.name || 'VELRIX',
      logo: appData.settings?.company?.logo || null,
    };
  }, [appData.settings?.company]);

  const isModuleAllowed = (module: AppModule) => {
    const features = (appData.settings?.company?.planFeatures || '').toLowerCase();
    const planName = (appData.settings?.company?.planName || '').toLowerCase();
    const isPro = planName.includes('pro') || planName.includes('completo') || features.includes('completo');

    if (isPro) return true;

    // Specific module checks for non-pro plans
    if (module === 'cobradores') return (appData.settings?.cobradoresEnabled ?? false) && features.includes('cobrador');
    if (module === 'contratos') return features.includes('contratos');
    if (module === 'auditoria') return features.includes('auditoria');
    if (module === 'contasBancarias') return features.includes('bancos');

    return true;
  };

  const visibleMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      if (!isModuleAllowed(item.module)) return false;
      return canView(item.module);
    });
  }, [appData.settings?.company, appData.settings?.cobradoresEnabled, canView]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-50 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 ease-in-out',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
              {companyBranding.logo ? (
                <img src={companyBranding.logo} alt={companyBranding.name} className="w-9 h-9 object-contain" />
              ) : (
                <img src={veltorIcon} alt="VELRIX" className="w-9 h-9 object-contain" />
              )}
            </div>
            <span
              className={cn(
                'text-sm font-bold tracking-tight whitespace-nowrap transition-all duration-300 truncate max-w-[140px]',
                collapsed ? 'opacity-0 w-0' : 'opacity-100'
              )}
              title={companyBranding.name}
            >
              {companyBranding.name}
            </span>
          </div>
          <button
            className="lg:hidden p-1 rounded hover:bg-sidebar-accent transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {visibleMenuItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path) && (item.path !== '/' || location.pathname === '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? t(item.labelKey) : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg text-body-sm font-medium transition-all duration-200',
                  collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary-foreground transition-all duration-300" />
                )}
                <item.icon
                  size={20}
                  className={cn(
                    'flex-shrink-0 transition-transform duration-200',
                    !isActive && 'group-hover:scale-110'
                  )}
                />
                <span
                  className={cn(
                    'whitespace-nowrap transition-all duration-300',
                    collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                  )}
                >
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:flex px-3 pb-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200 text-body-sm"
          >
            <ChevronLeft
              size={16}
              className={cn(
                'transition-transform duration-300',
                collapsed && 'rotate-180'
              )}
            />
            <span
              className={cn(
                'whitespace-nowrap transition-all duration-300',
                collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              )}
            >
              {t('common_collapse')}
            </span>
          </button>
        </div>

        {/* User section */}
        <div className="p-3 border-t border-sidebar-border">
          <Link
            to="/perfil"
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg transition-colors duration-200 hover:bg-sidebar-accent cursor-pointer',
              collapsed && 'justify-center',
              location.pathname === '/perfil' && 'bg-sidebar-accent'
            )}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-accent flex items-center justify-center text-sidebar-primary-foreground text-body-sm font-bold flex-shrink-0 ring-2 ring-sidebar-border">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div
              className={cn(
                'flex-1 min-w-0 transition-all duration-300',
                collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              )}
            >
              <p className="text-body-sm font-medium truncate">{user?.name || ''}</p>
              <p className="text-xs text-sidebar-muted truncate">{user ? t(`role_${user.role}` as any) : ''}</p>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); logout(); }}
              title={t('login_logout')}
              className={cn(
                'text-sidebar-foreground/40 hover:text-sidebar-foreground transition-all duration-300 flex-shrink-0',
                collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              )}
            >
              <LogOut size={16} />
            </button>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center px-4 lg:px-6 sticky top-0 z-30 card-shadow">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-accent mr-3 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-body font-semibold">
              {currentMenuItem ? t(currentMenuItem.labelKey) : t('menu_page')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification center */}
            <NotificationCenter notifications={notifications} />
            {/* Realtime status indicator */}
            <div
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                rtStatus === 'connected' && 'bg-success/10 text-success',
                rtStatus === 'reconnecting' && 'bg-warning/10 text-warning',
                rtStatus === 'offline' && 'bg-muted text-muted-foreground',
              )}
              title={
                rtStatus === 'connected' ? 'Realtime conectado' :
                rtStatus === 'reconnecting' ? 'Reconectando...' : 'Offline'
              }
            >
              {rtStatus === 'connected' && <Wifi size={14} />}
              {rtStatus === 'reconnecting' && <RefreshCw size={14} className="animate-spin" />}
              {rtStatus === 'offline' && <WifiOff size={14} />}
              <span className="hidden sm:inline">
                {rtStatus === 'connected' ? 'Conectado' : rtStatus === 'reconnecting' ? 'Reconectando' : 'Offline'}
              </span>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 animate-fade-in flex flex-col">
          <div className="flex-1">
            {children}
          </div>
          <footer className="mt-8 pt-8 pb-4 text-center space-y-1 opacity-30 border-t border-border/20">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              © 2026 Velrix Finance. Todos os direitos reservados.
            </p>
            <p className="text-secondary text-[10px] sm:text-xs font-medium uppercase tracking-wider">
              Desenvolvido por COUTEC DIGITAL - JOÃO COUTO
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
