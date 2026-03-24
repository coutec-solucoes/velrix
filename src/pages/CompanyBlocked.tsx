import { useAuth } from '@/hooks/useAuth';
import { ShieldX, LogOut } from 'lucide-react';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';

export default function CompanyBlocked() {
  const { suspendedCompany, logout } = useAuth();

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 relative" style={{ backgroundColor: '#0a1628' }}>
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20" style={{ backgroundImage: `url(${veltorBg})` }} />
      <div className="w-full max-w-md flex flex-col items-center relative z-10">
        <img src={veltorLogo} alt="Veltor" className="w-3/4 max-w-[200px] h-auto drop-shadow-lg mb-6" />

        <div className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-red-500/30 p-6 space-y-4 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
            <ShieldX size={28} className="text-red-400" />
          </div>
          <h2 className="text-white text-lg font-semibold">Acesso Suspenso</h2>
          <p className="text-white/60 text-sm leading-relaxed">
            O acesso da empresa <span className="text-white font-medium">{suspendedCompany}</span> está
            temporariamente suspenso ou pendente de aprovação.
          </p>
          <p className="text-white/40 text-xs">
            Entre em contato com o administrador para regularizar sua situação e liberar o acesso ao sistema.
          </p>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors mt-2"
          >
            <LogOut size={18} />
            Voltar ao Login
          </button>
        </div>
      </div>
    </div>
  );
}
