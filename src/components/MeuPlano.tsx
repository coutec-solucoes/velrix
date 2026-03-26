import { useState, useEffect } from 'react';
import { CreditCard, Shield, CheckCircle2, Loader2, AlertTriangle, RefreshCw, Star } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

interface PlanInfo {
  name: string;
  price: number;
  currency: string;
  features: string;
  status: string;
  planExpiry: string | null;
  daysLeft: number;
  companyId: string;
  country: string;
}

interface CardForm {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
  cpfCnpj: string;
}

export default function MeuPlano() {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardForm, setCardForm] = useState<CardForm>({
    cardNumber: '',
    cardName: '',
    expiry: '',
    cvv: '',
    cpfCnpj: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState('');
  const [cardSuccess, setCardSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabase();
      if (!supabase) { setLoading(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, country')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) { setLoading(false); return; }

      const { data: company } = await supabase
        .from('saas_companies')
        .select('status, plan_expiry, plan_id, country')
        .eq('id', profile.company_id)
        .single();

      if (!company) { setLoading(false); return; }

      let planName = 'Sem plano';
      let price = 0;
      let currency = 'BRL';
      let features = '';

      if (company.plan_id) {
        const { data: plan } = await supabase
          .from('saas_plans')
          .select('*')
          .eq('id', company.plan_id)
          .single();
        if (plan) {
          planName = plan.name;
          price = Number(plan.price);
          currency = plan.currency;
          features = plan.features || '';
        }
      }

      const now = new Date();
      let daysLeft = 0;
      if (company.plan_expiry) {
        const expiry = new Date(company.plan_expiry);
        daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      setPlanInfo({
        name: planName,
        price,
        currency,
        features,
        status: company.status || 'pendente',
        planExpiry: company.plan_expiry,
        daysLeft: Math.max(0, daysLeft),
        companyId: profile.company_id,
        country: company.country || profile.country || 'BR',
      });
      setLoading(false);
    };

    load();
  }, []);

  const formatCardNumber = (v: string) => {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  const formatCpf = (v: string) => {
    return v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
      d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
    );
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError('');
    setSubmitting(true);

    try {
      // Mercado Pago tokenization via SDK
      // @ts-ignore
      const mp = window.MercadoPago;
      if (!mp) {
        // Load MP SDK dynamically
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://sdk.mercadopago.com/js/v2';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Falha ao carregar Mercado Pago SDK'));
          document.head.appendChild(script);
        });
      }

      // NOTE: In production, replace with your real Mercado Pago Public Key
      // @ts-ignore
      const mpInstance = new window.MercadoPago(import.meta.env.VITE_MP_PUBLIC_KEY || 'TEST-PUBLIC-KEY', {
        locale: planInfo?.country === 'BR' ? 'pt-BR' : 'es-PY',
      });

      const [expirationMonth, expirationYear] = cardForm.expiry.split('/');
      // @ts-ignore
      const cardToken = await mpInstance.createCardToken({
        cardNumber: cardForm.cardNumber.replace(/\s/g, ''),
        cardholderName: cardForm.cardName,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: '20' + expirationYear,
        securityCode: cardForm.cvv,
        identificationType: planInfo?.country === 'BR' ? 'CPF' : 'CI',
        identificationNumber: cardForm.cpfCnpj.replace(/\D/g, ''),
      });

      if (!cardToken?.id) {
        setCardError('Não foi possível tokenizar o cartão. Verifique os dados.');
        setSubmitting(false);
        return;
      }

      // Call our backend (Supabase Edge Function or API) to create subscription
      const supabase = getSupabase();
      if (!supabase) return;

      const { error } = await supabase.functions.invoke('mp-subscribe', {
        body: {
          companyId: planInfo?.companyId,
          tokenId: cardToken.id,
          planName: planInfo?.name,
          price: planInfo?.price,
          currency: planInfo?.currency,
        },
      });

      if (error) {
        setCardError('Erro ao ativar assinatura: ' + error.message);
      } else {
        setCardSuccess(true);
      }
    } catch (err: any) {
      setCardError(err?.message || 'Erro inesperado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-secondary" />
      </div>
    );
  }

  const statusColor = {
    ativo: 'text-green-400 bg-green-500/10 border-green-500/20',
    trial: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    vencido: 'text-red-400 bg-red-500/10 border-red-500/20',
    pendente: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }[planInfo?.status || 'pendente'] || 'text-muted-foreground';

  const statusLabel = {
    ativo: '✅ Ativo',
    trial: `🎉 Trial — ${planInfo?.daysLeft} dias restantes`,
    vencido: '⚠️ Vencido',
    pendente: '⏳ Pendente',
  }[planInfo?.status || 'pendente'] || planInfo?.status;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current plan card */}
      <div className="bg-card rounded-xl border border-border p-6 card-shadow">
        <div className="flex items-center gap-2 mb-4">
          <Star size={20} className="text-secondary" />
          <h2 className="text-body font-semibold">Seu Plano Atual</h2>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xl font-bold">{planInfo?.name || 'Sem plano'}</p>
            {planInfo?.price ? (
              <p className="text-secondary font-semibold text-lg">
                {planInfo.currency === 'PYG' ? '₲' : 'R$'} {planInfo.price.toLocaleString()}
                <span className="text-muted-foreground text-sm font-normal">/mês</span>
              </p>
            ) : null}
            {planInfo?.features && (
              <p className="text-muted-foreground text-sm">{planInfo.features}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${statusColor}`}>
              {statusLabel}
            </span>
            {planInfo?.planExpiry && (
              <p className="text-muted-foreground text-xs">
                Vencimento: {new Date(planInfo.planExpiry).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        </div>
        {planInfo?.status === 'trial' && planInfo.daysLeft <= 7 && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
            <p className="text-amber-300 text-xs">
              Seu trial expira em <strong>{planInfo.daysLeft} dia{planInfo.daysLeft !== 1 ? 's' : ''}</strong>. Ative sua assinatura abaixo para não perder o acesso.
            </p>
          </div>
        )}
      </div>

      {/* Payment with Mercado Pago */}
      {cardSuccess ? (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 flex flex-col items-center text-center gap-3">
          <CheckCircle2 size={40} className="text-green-400" />
          <h3 className="font-bold text-green-300 text-lg">Assinatura ativada com sucesso!</h3>
          <p className="text-green-200/70 text-sm">Seu plano foi ativado. A renovação será automática todo mês.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-6 card-shadow">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={20} className="text-secondary" />
            <h2 className="text-body font-semibold">Ativar Plano com Cartão de Crédito</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-5">
            Preencha os dados do cartão. A cobrança será feita automaticamente todo mês pelo{' '}
            <strong className="text-foreground">Mercado Pago</strong>.
          </p>

          <form onSubmit={handleCardSubmit} className="space-y-4">
            <div>
              <label className="block text-body-sm font-medium mb-1">Número do Cartão</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cardForm.cardNumber}
                onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-body-sm font-medium mb-1">Nome no Cartão</label>
              <input
                type="text"
                placeholder="NOME COMO NO CARTÃO"
                value={cardForm.cardName}
                onChange={(e) => setCardForm({ ...cardForm, cardName: e.target.value.toUpperCase() })}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-body-sm font-medium mb-1">Validade</label>
                <input
                  type="text"
                  placeholder="MM/AA"
                  value={cardForm.expiry}
                  onChange={(e) => setCardForm({ ...cardForm, expiry: formatExpiry(e.target.value) })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">CVV</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000"
                  maxLength={4}
                  value={cardForm.cvv}
                  onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '') })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-body-sm font-medium mb-1">
                {planInfo?.country === 'BR' ? 'CPF do Titular' : 'Cédula de Identidad'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder={planInfo?.country === 'BR' ? '000.000.000-00' : '0.000.000'}
                value={cardForm.cpfCnpj}
                onChange={(e) => setCardForm({ ...cardForm, cpfCnpj: formatCpf(e.target.value) })}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-body-sm bg-background focus:ring-2 focus:ring-secondary outline-none"
                required
              />
            </div>

            {cardError && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <AlertTriangle size={14} /> {cardError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #009ee3 0%, #00c4d8 100%)', color: '#fff' }}
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              {submitting
                ? 'Processando...'
                : `Ativar — ${planInfo?.currency === 'PYG' ? '₲' : 'R$'} ${planInfo?.price?.toLocaleString() || '0'}/mês`}
            </button>

            <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
              <Shield size={13} />
              <span>Pagamento seguro via Mercado Pago · Cancelamento a qualquer momento</span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
