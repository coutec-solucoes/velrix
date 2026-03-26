import { useState, useEffect } from 'react';
import { X, Clock, CreditCard, AlertTriangle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

interface TrialInfo {
  isTrial: boolean;
  daysLeft: number;
  planName: string;
  planExpiry: string | null;
  status: 'ativo' | 'trial' | 'vencido' | 'pendente';
}

export default function TrialBanner() {
  const [info, setInfo] = useState<TrialInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check session dismissal
      const dismissKey = `trial_banner_dismissed_${user.id}_${new Date().toDateString()}`;
      if (sessionStorage.getItem(dismissKey)) {
        setDismissed(true);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) return;

      const { data: company } = await supabase
        .from('saas_companies')
        .select('status, plan_expiry, plan_id')
        .eq('id', profile.company_id)
        .single();

      if (!company) return;

      let planName = '';
      if (company.plan_id) {
        const { data: plan } = await supabase
          .from('saas_plans')
          .select('name')
          .eq('id', company.plan_id)
          .single();
        planName = plan?.name || '';
      }

      const now = new Date();
      let daysLeft = 0;
      if (company.plan_expiry) {
        const expiry = new Date(company.plan_expiry);
        daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      const isTrial = company.status === 'trial';
      const isVencido = company.status === 'vencido' || (company.plan_expiry && daysLeft <= 0 && company.status !== 'ativo');

      // Only show banner for trial or near-expiry (≤7 days) or expired
      if (company.status === 'ativo' && daysLeft > 7) return;

      setInfo({
        isTrial,
        daysLeft: Math.max(0, daysLeft),
        planName,
        planExpiry: company.plan_expiry,
        status: isVencido ? 'vencido' : (company.status as TrialInfo['status']),
      });
    };

    load();
  }, []);

  if (!info || dismissed) return null;

  const isExpired = info.status === 'vencido' || info.daysLeft <= 0;
  const isUrgent = info.daysLeft <= 3;

  const bgStyle = isExpired
    ? 'bg-red-500/10 border-red-500/30'
    : isUrgent
    ? 'bg-amber-500/10 border-amber-500/30'
    : info.isTrial
    ? 'bg-blue-500/10 border-blue-500/30'
    : 'bg-amber-500/10 border-amber-500/30';

  const iconColor = isExpired ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-blue-400';

  const handleDismiss = () => {
    const supabase = getSupabase();
    supabase?.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const key = `trial_banner_dismissed_${user.id}_${new Date().toDateString()}`;
        sessionStorage.setItem(key, '1');
      }
    });
    setDismissed(true);
  };

  const goToSettings = () => {
    navigate('/configuracoes?tab=meu-plano');
  };

  return (
    <div className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 ${bgStyle}`}>
      <div className={`flex-shrink-0 ${iconColor}`}>
        {isExpired ? <AlertTriangle size={18} /> : info.isTrial ? <Clock size={18} /> : <AlertTriangle size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        {isExpired ? (
          <p className="text-sm font-semibold text-red-300">
            ⚠️ Plano vencido — acesse as configurações para renovar
          </p>
        ) : info.isTrial ? (
          <p className="text-sm text-blue-200">
            <span className="font-bold">🎉 Período de teste: {info.daysLeft} dia{info.daysLeft !== 1 ? 's' : ''} restante{info.daysLeft !== 1 ? 's' : ''}</span>
            {info.planName && <span className="text-blue-300/70"> · {info.planName}</span>}
            <span className="block text-xs text-blue-300/60 mt-0.5">
              Para continuar após o trial, vá em <strong>Configurações → Meu Plano</strong> e ative sua assinatura.
            </span>
          </p>
        ) : (
          <p className="text-sm text-amber-200">
            <span className="font-bold">⏰ Renovação em {info.daysLeft} dia{info.daysLeft !== 1 ? 's' : ''}</span>
            <span className="block text-xs text-amber-300/60 mt-0.5">
              Acesse <strong>Configurações → Meu Plano</strong> para renovar sua assinatura.
            </span>
          </p>
        )}
      </div>
      <button
        onClick={goToSettings}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
        style={{ background: isExpired ? '#ef444430' : '#3b82f630', color: isExpired ? '#fca5a5' : '#93c5fd' }}
      >
        <CreditCard size={13} />
        Ativar Plano
      </button>
      {!isExpired && (
        <button onClick={handleDismiss} className="flex-shrink-0 text-white/30 hover:text-white/60 transition-colors">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
