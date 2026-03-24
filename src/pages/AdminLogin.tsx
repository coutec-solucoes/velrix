import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, isLoading, login } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && isAdmin) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isLoading, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await login(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate('/admin/dashboard');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a1628' }}>
        <Loader2 size={32} className="text-secondary animate-spin" />
      </div>
    );
  }

  const inputClass =
    'w-full border border-white/20 rounded-lg px-4 py-3 text-sm bg-white/10 text-white placeholder:text-white/50 focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors backdrop-blur-sm';

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 relative" style={{ backgroundColor: '#0a1628' }}>
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20" style={{ backgroundImage: `url(${veltorBg})` }} />
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <img src={veltorLogo} alt="Veltor" className="w-3/4 max-w-[200px] h-auto drop-shadow-lg mb-4" />
        <div className="flex items-center gap-2 mb-5">
          <Shield size={16} className="text-secondary" />
          <p className="text-white/70 text-xs tracking-wide uppercase">Painel Administrativo</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-5 space-y-3.5 shadow-2xl">
          <div>
            <label className="block text-sm font-medium mb-1 text-white/90">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="admin@veltor.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-white/90">Senha</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="Senha de acesso" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-400 font-medium">{error}</p>}
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
            {loading ? 'Autenticando...' : 'Entrar no Painel'}
          </button>
        </form>
      </div>
    </div>
  );
}
