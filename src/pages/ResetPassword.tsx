import { useState, useEffect } from 'react';
import { Lock, Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [validSession, setValidSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for recovery session from URL hash
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setValidSession(true);
    }
    // Also listen for auth state change (recovery event)
    (async () => {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();
      if (!supabase) return;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setValidSession(true);
      });
      // Check current session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setValidSession(true);
      return () => subscription.unsubscribe();
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    setError('');
    setLoading(true);
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();
      if (!supabase) { setError('Banco de dados não configurado.'); return; }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else setDone(true);
    } catch {
      setError('Erro ao redefinir. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-white/20 rounded-lg px-4 py-3 text-sm bg-white/10 text-white placeholder:text-white/50 focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors backdrop-blur-sm';

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-cover bg-center bg-no-repeat px-4 relative" style={{ backgroundColor: '#0a1628' }}>
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20" style={{ backgroundImage: `url(${veltorBg})` }} />
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <img src={veltorLogo} alt="Veltor" className="w-full max-w-sm h-auto drop-shadow-lg mb-4 sm:mb-6" />

        <div className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-6 shadow-2xl">
          {done ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle size={24} className="text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Senha redefinida!</h2>
              <p className="text-white/60 text-sm">Sua senha foi alterada com sucesso.</p>
              <button onClick={() => navigate('/')} className="w-full px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity">
                Ir para o app
              </button>
            </div>
          ) : !validSession ? (
            <div className="text-center space-y-4">
              <h2 className="text-lg font-semibold text-white">Link inválido</h2>
              <p className="text-white/60 text-sm">Este link de recuperação expirou ou é inválido. Solicite um novo.</p>
              <button onClick={() => navigate('/')} className="w-full px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity">
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-lg font-semibold text-white">Nova senha</h2>
                <p className="text-white/60 text-sm mt-1">Defina sua nova senha abaixo.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-white/90">Nova senha</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-white/90">Confirmar senha</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} placeholder="••••••••" required />
              </div>

              {error && <p className="text-sm text-red-400 font-medium">{error}</p>}

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
