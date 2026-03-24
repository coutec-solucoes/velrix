import { useState } from 'react';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';

export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();
      if (!supabase) { setError('Banco de dados não configurado.'); return; }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(error.message);
      else setSent(true);
    } catch {
      setError('Erro ao enviar. Tente novamente.');
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
          {sent ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                <Mail size={24} className="text-secondary" />
              </div>
              <h2 className="text-lg font-semibold text-white">E-mail enviado!</h2>
              <p className="text-white/60 text-sm">
                Verifique sua caixa de entrada em <span className="text-white font-medium">{email}</span> e clique no link para redefinir sua senha.
              </p>
              <button onClick={onBack} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity">
                <ArrowLeft size={18} /> Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-lg font-semibold text-white">Esqueceu sua senha?</h2>
                <p className="text-white/60 text-sm mt-1">Informe seu e-mail para receber o link de recuperação.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-white/90">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="email@empresa.com" required />
              </div>

              {error && <p className="text-sm text-red-400 font-medium">{error}</p>}

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>

              <button type="button" onClick={onBack} className="w-full flex items-center justify-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
                <ArrowLeft size={16} /> Voltar ao login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
