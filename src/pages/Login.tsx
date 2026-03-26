import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useI18n';
import { Eye, EyeOff, LogIn, Loader2, Building2, User } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';
import Register from './Register';
import ForgotPassword from './ForgotPassword';

type LoginTab = 'owner' | 'collaborator';



export default function Login() {
  const [tab, setTab] = useState<LoginTab>('owner');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const { login, loginCollaborator } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    // Open register if path is /register
    const path = window.location.pathname;
    if (path === '/register') {
      setShowRegister(true);
    }
  }, []);

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const err = await login(email, password);
      if (err === 'login_error') setError(t('login_error'));
      else if (err === 'supabase_not_configured') setError('Banco de dados não configurado.');
      else if (err) setError(err);
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCollaboratorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loginError = await loginCollaborator(companyCode.trim(), username.trim(), password);
      if (loginError) {
        setError(loginError);
        return;
      }
    } catch {
      setError('Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (showForgot) {
    return <ForgotPassword onBack={() => setShowForgot(false)} />;
  }

  if (showRegister) {
    return <Register onBackToLogin={() => setShowRegister(false)} />;
  }

  const inputClass =
    'w-full border border-white/20 rounded-lg px-4 py-3 text-sm bg-white/10 text-white placeholder:text-white/50 focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors backdrop-blur-sm';

  return (
    <div
      className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-cover bg-center bg-no-repeat px-4 relative"
      style={{ backgroundColor: '#0a1628', paddingBottom: '10vh' }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
        style={{ backgroundImage: `url(${veltorBg})` }}
      />
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <img
          src={veltorLogo}
          alt="Velrix"
          className="w-full max-w-[420px] h-auto drop-shadow-lg mb-4 sm:mb-6"
        />

        <p className="text-white/70 text-xs sm:text-sm tracking-wide mb-5">
          Controle financeiro com inteligência.
        </p>

        {/* Login tabs */}
        <div className="w-full flex rounded-xl overflow-hidden border border-white/10 mb-4 bg-black/30 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => { setTab('owner'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-all ${
              tab === 'owner'
                ? 'bg-secondary/20 text-secondary border-b-2 border-secondary'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Building2 size={14} />
            Proprietário
          </button>
          <button
            type="button"
            onClick={() => { setTab('collaborator'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-all ${
              tab === 'collaborator'
                ? 'bg-secondary/20 text-secondary border-b-2 border-secondary'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <User size={14} />
            Colaborador
          </button>
        </div>

        {/* Owner login */}
        {tab === 'owner' && (
          <form onSubmit={handleOwnerSubmit} className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-6 space-y-4 shadow-2xl">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/90">{t('usr_email')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="email@empresa.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/90">{t('usr_password')}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-400 font-medium">{error}</p>}
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              {loading ? 'Entrando...' : t('login_button')}
            </button>
            <button type="button" onClick={() => setShowForgot(true)} className="text-xs text-white/50 hover:text-secondary transition-colors">
              Esqueceu a senha?
            </button>
          </form>
        )}

        {/* Collaborator login */}
        {tab === 'collaborator' && (
          <form onSubmit={handleCollaboratorSubmit} className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-6 space-y-4 shadow-2xl">
            <p className="text-white/40 text-xs text-center -mt-1 mb-1">
              Use o nome de usuário e senha fornecidos pela sua empresa
            </p>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/90">Código da Empresa</label>
              <input type="text" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className={inputClass} placeholder="CNPJ ou RUC da empresa" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/90">Nome de Usuário</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} placeholder="Seu nome cadastrado" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-white/90">Senha</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-400 font-medium">{error}</p>}
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              {loading ? 'Entrando...' : 'Acessar'}
            </button>
          </form>
        )}

        {tab === 'owner' && (
          <div className="mt-5 flex flex-col items-center gap-2">
            <p className="text-white/50 text-xs">Não tem conta?</p>
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-base font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)',
                color: '#fff',
                letterSpacing: '0.01em',
              }}
            >
              🚀 Criar conta — 7 dias grátis
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center space-y-1 opacity-60">
          <p className="text-white text-[10px] sm:text-xs">
            © 2026 Velrix Finance. Todos os direitos reservados.
          </p>
          <p className="text-secondary text-[10px] sm:text-xs font-medium uppercase tracking-wider">
            Desenvolvido por COUTEC DIGITAL - JOÃO COUTO
          </p>
        </div>
      </div>
    </div>
  );
}
