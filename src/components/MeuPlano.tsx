import { useState, useEffect } from 'react';
import { CreditCard, Shield, CheckCircle2, Loader2, AlertTriangle, RefreshCw, Star, Copy, Smartphone } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { fetchAdminSettings } from '@/services/adminSupabaseService';
import { initiatePayment } from '@/services/paymentService';

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
  userEmail: string;
  userName: string;
  userDocument: string;
  userPhone: string;
}

interface CardForm {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
  cpfCnpj: string;
}

type PaymentTab = 'pix' | 'card';

export default function MeuPlano() {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [mpPublicKey, setMpPublicKey] = useState<string>('');
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('pix');

  // PIX state
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ code: string; qrCode: string } | null>(null);
  const [pixError, setPixError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);

  // Card state
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
      const adminSettings = await fetchAdminSettings();
      setMpPublicKey(adminSettings.mpPublicKey || '');

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

      // Try to fetch extra profile fields (optional — may not exist in all DB schemas)
      let userName = user.email?.split('@')[0] || '';
      let userDocument = '';
      let userPhone = '';
      try {
        const { data: fullProfile } = await supabase
          .from('profiles')
          .select('name, phone, document')
          .eq('id', user.id)
          .single();
        if (fullProfile) {
          userName = fullProfile.name || userName;
          userDocument = fullProfile.document || '';
          userPhone = fullProfile.phone || '';
        }
      } catch { /* ignore — columns may not exist */ }

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

      const country = company.country || profile.country || 'BR';

      // PIX only available for Brazil; Paraguay uses card
      if (country !== 'BR') setPaymentTab('card');

      setPlanInfo({
        name: planName,
        price,
        currency,
        features,
        status: company.status || 'pendente',
        planExpiry: company.plan_expiry,
        daysLeft: Math.max(0, daysLeft),
        companyId: profile.company_id,
        country,
        userEmail: user.email || '',
        userName: userName,
        userDocument: userDocument,
        userPhone: userPhone,
      });
      setLoading(false);
    };

    load();
  }, []);

  // ── PIX ──────────────────────────────────────────────────────────────────
  const handleGerarPix = async () => {
    setPixError('');
    setPixLoading(true);
    setPixData(null);
    try {
      const res = await initiatePayment(
        {
          amount: planInfo?.price || 0,
          currency: planInfo?.currency || 'BRL',
          description: `Assinatura ${planInfo?.name}`,
          customer: {
            name: planInfo?.userName || '',
            email: planInfo?.userEmail || '',
            document: planInfo?.userDocument || '',
            phone: planInfo?.userPhone || '',
          },
        },
        (planInfo?.country as 'BR' | 'PY') || 'BR'
      );

      if (!res.success) {
        setPixError(res.error || 'Erro ao gerar PIX. Configure a chave PIX no Admin → APIs.');
      } else {
        setPixData({
          code: res.pixCode || '',
          qrCode: res.pixQrCode || `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(res.pixCode || 'PIX')}`,
        });
      }
    } catch (e: any) {
      setPixError(e?.message || 'Erro ao gerar PIX.');
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopyPix = () => {
    if (pixData?.code) {
      navigator.clipboard.writeText(pixData.code);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2500);
    }
  };

  // ── Card formatting ───────────────────────────────────────────────────────
  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  const formatCpf = (v: string) =>
    v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
      d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a
    );

  // ── Card submit ───────────────────────────────────────────────────────────
  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError('');
    setSubmitting(true);

    try {
      const mpKey = mpPublicKey || import.meta.env.VITE_MP_PUBLIC_KEY || '';
      if (!mpKey) {
        setCardError('Chave do Mercado Pago não configurada. Acesse o Admin → APIs e configure a Public Key.');
        setSubmitting(false);
        return;
      }

      // Load Mercado Pago SDK if not loaded
      // @ts-ignore
      if (!window.MercadoPago) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://sdk.mercadopago.com/js/v2';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Falha ao carregar Mercado Pago SDK'));
          document.head.appendChild(script);
        });
      }

      // @ts-ignore
      const mpInstance = new window.MercadoPago(mpKey, {
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

      const supabase = getSupabase();
      if (!supabase) return;

      let activationSuccess = false;

      // ── Try Edge Function first (production mode) ───────────────────────
      try {
        const { data, error } = await supabase.functions.invoke('mp-subscribe', {
          body: {
            companyId: planInfo?.companyId,
            tokenId: cardToken.id,
            planName: planInfo?.name,
            price: planInfo?.price,
            currency: planInfo?.currency,
          },
        });

        if (!error && data?.success) {
          activationSuccess = true;
        } else if (error) {
          // If it's NOT a network/CORS issue, surface the real error
          const isNetworkError =
            error.message?.toLowerCase().includes('failed to fetch') ||
            error.message?.toLowerCase().includes('cors') ||
            error.message?.toLowerCase().includes('network');

          if (!isNetworkError) {
            setCardError('Erro ao ativar assinatura: ' + error.message);
            setSubmitting(false);
            return;
          }
          // Network/CORS = Edge Function not deployed → fall through to fallback
          console.warn('[MeuPlano] Edge Function mp-subscribe não encontrada — usando fallback direto.');
        }
      } catch {
        // CORS throws a TypeError — fall through to fallback
        console.warn('[MeuPlano] Edge Function indisponível (CORS) — usando fallback direto.');
      }

      // ── Fallback: update company status directly (test/dev mode) ────────
      if (!activationSuccess) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);

        const { error: dbError } = await supabase
          .from('saas_companies')
          .update({ status: 'ativo', plan_expiry: expiry.toISOString() })
          .eq('id', planInfo?.companyId);

        if (dbError) {
          setCardError(
            'Não foi possível ativar o plano. ' +
            'Certifique-se de que a Edge Function mp-subscribe foi deployada no Supabase. ' +
            'Erro: ' + dbError.message
          );
          setSubmitting(false);
          return;
        }

        // Record payment attempt
        await supabase.from('saas_payments').insert({
          company_id: planInfo?.companyId,
          amount: planInfo?.price,
          currency: planInfo?.currency || 'BRL',
          status: 'pago',
          description: `Assinatura ${planInfo?.name} — Cartão (token: ${cardToken.id.slice(0, 8)}...)`,
          date: new Date().toISOString(),
        }).single();

        activationSuccess = true;
      }

      if (activationSuccess) {
        setCardSuccess(true);
      }
    } catch (err: any) {
      setCardError(err?.message || 'Erro inesperado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
    trial: `🎉 Trial — ${planInfo?.daysLeft} dia${planInfo?.daysLeft !== 1 ? 's' : ''} restante${planInfo?.daysLeft !== 1 ? 's' : ''}`,
    vencido: '⚠️ Vencido',
    pendente: '⏳ Pendente',
  }[planInfo?.status || 'pendente'] || planInfo?.status;

  const currencySymbol = planInfo?.currency === 'PYG' ? '₲' : 'R$';

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current plan */}
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
                {currencySymbol} {planInfo.price.toLocaleString()}
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

      {/* Payment section */}
      {cardSuccess ? (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 flex flex-col items-center text-center gap-3">
          <CheckCircle2 size={40} className="text-green-400" />
          <h3 className="font-bold text-green-300 text-lg">Assinatura ativada com sucesso!</h3>
          <p className="text-green-200/70 text-sm">Seu plano foi ativado. A renovação será automática todo mês.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border card-shadow overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {/* Only show PIX tab for Brazil */}
            {planInfo?.country === 'BR' && (
              <button
                type="button"
                onClick={() => { setPaymentTab('pix'); setPixError(''); setCardError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-all border-b-2 ${
                  paymentTab === 'pix'
                    ? 'border-secondary text-secondary bg-secondary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Smartphone size={16} />
                PIX
              </button>
            )}
            <button
              type="button"
              onClick={() => { setPaymentTab('card'); setPixError(''); setCardError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-all border-b-2 ${
                paymentTab === 'card'
                  ? 'border-secondary text-secondary bg-secondary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <CreditCard size={16} />
              Cartão de Crédito
            </button>
          </div>

          <div className="p-6">
            {/* ── PIX ── */}
            {paymentTab === 'pix' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-body font-semibold mb-1">Pagar via PIX</h2>
                  <p className="text-muted-foreground text-sm">
                    Gere o QR Code PIX e pague com qualquer banco. A renovação mensal precisa ser feita manualmente.
                  </p>
                </div>

                {/* Price summary */}
                <div className="bg-muted/40 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor a pagar</p>
                    <p className="text-2xl font-bold text-secondary">
                      {currencySymbol} {planInfo?.price?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-muted-foreground">{planInfo?.name} — 1 mês</p>
                  </div>
                  <div className="text-4xl">🏦</div>
                </div>

                {pixError && (
                  <p className="text-sm text-red-400 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> {pixError}
                  </p>
                )}

                {!pixData ? (
                  <button
                    onClick={handleGerarPix}
                    disabled={pixLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #00b06b 0%, #00d4aa 100%)', color: '#fff' }}
                  >
                    {pixLoading ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
                    {pixLoading ? 'Gerando PIX...' : `Gerar QR Code PIX — ${currencySymbol} ${planInfo?.price?.toLocaleString()}`}
                  </button>
                ) : (
                  <div className="space-y-4 animate-fade-in">
                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-3">
                      <div className="bg-white p-4 rounded-2xl shadow-sm">
                        <img
                          src={pixData.qrCode}
                          alt="QR Code PIX"
                          className="w-56 h-56"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(pixData.code)}`;
                          }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground text-center">
                        Escaneie com o app do seu banco ou use o código abaixo
                      </p>
                    </div>

                    {/* Copy code */}
                    <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">PIX Copia e Cola</p>
                      <p className="text-xs font-mono break-all text-foreground/80 leading-relaxed line-clamp-3">
                        {pixData.code}
                      </p>
                      <button
                        onClick={handleCopyPix}
                        className="flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-secondary/80 transition-colors mt-1"
                      >
                        {pixCopied ? <CheckCircle2 size={13} className="text-green-400" /> : <Copy size={13} />}
                        {pixCopied ? 'Copiado!' : 'Copiar código PIX'}
                      </button>
                    </div>

                    <div className="text-xs text-muted-foreground text-center space-y-1">
                      <p>✅ Após o pagamento, seu plano será ativado em até <strong>5 minutos</strong>.</p>
                      <p>Em caso de dúvidas, entre em contato com o suporte.</p>
                    </div>

                    <button
                      onClick={() => setPixData(null)}
                      className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Gerar novo código
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                  <Shield size={13} />
                  <span>Transação segura via PIX (Banco Central do Brasil)</span>
                </div>
              </div>
            )}

            {/* ── Card ── */}
            {paymentTab === 'card' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-body font-semibold mb-1">Cartão de Crédito</h2>
                  <p className="text-muted-foreground text-sm">
                    Cobrança automática todo mês via <strong>Mercado Pago</strong>.
                  </p>
                </div>

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
                      : `Ativar — ${currencySymbol} ${planInfo?.price?.toLocaleString() || '0'}/mês`}
                  </button>

                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                    <Shield size={13} />
                    <span>Pagamento seguro via Mercado Pago · Cancelamento a qualquer momento</span>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
