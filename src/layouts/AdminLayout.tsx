import { useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Building2, Users, Settings, LogOut, Loader2 } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import veltorLogo from '@/assets/veltor-logo.png';

const navItems = [
  { path: '/admin/dashboard', label: 'Empresas', icon: Building2 },
  { path: '/admin/users', label: 'Usuários', icon: Users },
  { path: '/admin/settings', label: 'Configurações', icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isLoading, logout, user } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate('/admin/login');
  }, [isLoading, isAdmin, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0c1829' }}>
        <Loader2 size={32} className="text-secondary animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0c1829' }}>
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={veltorLogo} alt="Velrix" className="h-7" />
            <span className="text-white/40 text-xs uppercase tracking-widest hidden sm:inline">Admin</span>
            <nav className="flex items-center gap-1 ml-4">
              {navItems.map(item => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active ? 'bg-secondary/20 text-secondary' : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && <span className="text-white/40 text-xs hidden md:inline">{user.email}</span>}
            <button onClick={handleLogout} className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors">
              <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
