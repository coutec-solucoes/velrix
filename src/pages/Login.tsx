import { useState } from 'react';
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
  const { login, loginAsCollaborator } = useAuth();
  const { t } = useTranslation();

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
      const supabase = getSupabase();
      if (!supabase) { setError('Banco de dados não configurado.'); return; }

      if (!companyCode.trim() || !username.trim() || !password) {
        setError('Preencha todos os campos.');
        return;
      }

      // Edge Function fallback architecture
      const { data: result, error: fnError } = await supabase.functions.invoke('authenticate-collaborator', {
        body: { companyCode: companyCode.trim(), username: username.trim(), password },
      });

      if (fnError || result?.error) {
        console.error('[Collaborator Login] Edge/Result info:', fnError || result?.error);
        
        // RPC Fallback
        const { data: rpcResult, error: rpcError } = await supabase.rpc('authenticate_collaborator', {
          p_company_code: companyCode.trim(),
          p_username: username.trim(),
          p_password: password,
        });
        
        if (rpcError || rpcResult?.error) {
          setError(rpcResult?.error || 'Erro ao conectar ao servidor.');
          return;
        }

        if (rpcResult?.success) {
          const collab = rpcResult.collaborator;
          const authEmail = (collab.email && collab.email.includes("@")) ? collab.email : `collab-${collab.id}@veltor.app`;
          
          // Tenta entrar com o Auth nativo
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: authEmail,
            password: password
          });

          if (signInError) {
            // Se falhou, tentamos registrar na hora
            console.log('Auto-registrando colaborador no Auth...');
            const { error: signUpError } = await supabase.auth.signUp({
              email: authEmail,
              password: password,
              options: {
                data: {
                  is_collaborator: true,
                  company_id: collab.companyId,
                  company_name: collab.companyName,
                  name: collab.name,
                  role: collab.role,
                  collaborator_id: collab.id
                }
              }
            });

            // Se o signUp funcionar e não pedir email de confirmação, vai ter sessão.
            const { data: sessData } = await supabase.auth.getSession();
            if (!signUpError && sessData?.session) {
              return; // Router onAuthStateChange takes over
            }
          } else {
            return; // SignIn successful
          }

          // Fallback legacy final (usará RLS anon, requer corrigir trigger no banco)
          loginAsCollaborator({
            id: collab.id, name: collab.name, email: collab.email || '',
            role: collab.role, permissions: collab.permissions,
            companyId: collab.companyId, companyName: collab.companyName,
          });
        }
        return;
      }

      if (result.tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: result.tokenHash, type: 'magiclink',
        });
        if (otpError) {
          console.error('[Collaborator Login] verifyOtp error:', otpError);
          const collab = result.collaborator;
          // Se a OTP falhar, tenta fallback nativo
          const authEmail = (collab.email && collab.email.includes("@")) ? collab.email : `collab-${collab.id}@veltor.app`;
          await supabase.auth.signInWithPassword({ email: authEmail, password });
          const { data: sess2 } = await supabase.auth.getSession();
          if (sess2?.session) return;
          
          loginAsCollaborator({
            id: collab.id, name: collab.name, email: collab.email || '',
            role: collab.role, permissions: collab.permissions,
            companyId: collab.companyId, companyName: collab.companyName,
          });
          return;
        }
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
          <button
            onClick={() => setShowRegister(true)}
            className="mt-4 text-sm text-white/60 hover:text-white transition-colors"
          >
            Não tem conta? <span className="text-secondary font-medium">Criar conta</span>
          </button>
        )}
      </div>
    </div>
  );
}
