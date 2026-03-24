import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, UserPlus, ArrowLeft, Loader2, CreditCard } from 'lucide-react';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';
import { applyDocumentMask, applyPhoneMask } from '@/utils/masks';
import { fetchPlans } from '@/services/adminSupabaseService';
import { SaasPlan } from '@/types/admin';
import { useEffect } from 'react';
import { initiatePayment, PaymentResponse } from '@/services/paymentService';

interface Props {
  onBackToLogin: () => void;
}

export default function Register({ onBackToLogin }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [country, setCountry] = useState<'BR' | 'PY'>('BR');
  const [accountType, setAccountType] = useState<'empresa' | 'pessoal'>('pessoal');
  const [companyName, setCompanyName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'pagopar' | 'bancard'>('pix');
  const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
  const { register } = useAuth();

  useEffect(() => {
    fetchPlans().then(setPlans);
  }, []);

  useEffect(() => {
    if (country === 'BR') setPaymentMethod('pix');
    else setPaymentMethod('pagopar');
    setPaymentData(null);
  }, [country]);

  const filteredPlans = plans.filter(p => {
    if (country === 'BR') return p.currency === 'BRL';
    if (country === 'PY') return p.currency === 'PYG';
    return true;
  });

  const inputClass =
    'w-full border border-white/20 rounded-lg px-4 py-3 text-sm bg-white/10 text-white placeholder:text-white/50 focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors backdrop-blur-sm';

  const selectClass =
    'w-full border border-white/20 rounded-lg px-4 py-3 text-sm bg-white/10 text-white focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors backdrop-blur-sm [&>option]:bg-gray-900 [&>option]:text-white';

  const passwordStrength = (pw: string) => {
    const hasMinLength = pw.length >= 6;
    const hasLetter = /[a-zA-Z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    return { hasMinLength, hasLetter, hasNumber, valid: hasMinLength && hasLetter && hasNumber };
  };

  const strength = passwordStrength(password);

  const handleNext = () => {
    setError('');
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Preencha todos os campos.');
      return;
    }
    if (!strength.valid) {
      setError('A senha deve ter no mínimo 6 caracteres, com letras e números.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setStep(2);
  };

  const handleNextStep2 = () => {
    setError('');
    if (!document.trim() || !phone.trim() || !planId) {
      setError('Preencha todos os campos e selecione um plano.');
      return;
    }
    if (accountType === 'empresa' && !companyName.trim()) {
      setError('Informe o nome da empresa.');
      return;
    }
    setStep(3);
  };

  const selectedPlan = plans.find(p => p.id === planId);

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    // Final registration logic will be triggered after payment confirmation
    setLoading(true);
    try {
      if (!paymentData) {
        // First, initiate payment
        const res = await initiatePayment({
          amount: selectedPlan?.price || 0,
          currency: selectedPlan?.currency || 'BRL',
          description: `Assinatura Plano ${selectedPlan?.name}`,
          customer: { name, email, document, phone }
        }, country);

        if (!res.success) {
          setError(res.error || 'Erro ao processar pagamento.');
          setLoading(false);
          return;
        }

        if (res.paymentUrl) {
          // Store intent and Redirect to Pagopar/Bancard
          window.location.href = res.paymentUrl;
          return;
        }

        setPaymentData(res);
        setLoading(false);
        return;
      }

      // If we are here, it's a PIX payment where the user already saw the QR code
      // We proceed with the registration
      const err = await register({
        name,
        email,
        password,
        country,
        accountType,
        companyName: accountType === 'empresa' ? companyName : undefined,
        document,
        phone,
        planId: planId || undefined,
      });

      if (err === 'register_email_exists') {
        setError('Este email já está cadastrado.');
      } else if (err === 'supabase_not_configured') {
        setError('Banco de dados não configurado. Configure o Supabase no painel admin.');
      } else if (err) {
        setError(err);
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getDocumentLabel = () => {
    if (country === 'BR') return accountType === 'empresa' ? 'CNPJ' : 'CPF';
    return accountType === 'empresa' ? 'RUC' : 'Cédula de Identidad';
  };

  const getDocumentPlaceholder = () => {
    if (country === 'BR') return accountType === 'empresa' ? '00.000.000/0000-00' : '000.000.000-00';
    return accountType === 'empresa' ? '80000000-0' : '0.000.000';
  };

  const getPhonePlaceholder = () => {
    return country === 'BR' ? '(11) 99999-0000' : '(0981) 000-000';
  };

  if (success) {
    return (
      <div
        className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 relative"
        style={{ backgroundColor: '#0a1628' }}
      >
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20" style={{ backgroundImage: `url(${veltorBg})` }} />
        <div className="w-full max-w-sm flex flex-col items-center relative z-10">
          <img src={veltorLogo} alt="Velrix" className="w-3/4 max-w-[220px] h-auto drop-shadow-lg mb-6" />
          <div className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-6 space-y-4 shadow-2xl text-center">
            <div className="text-4xl mb-2">✉️</div>
            <h2 className="text-white font-semibold text-lg">Verifique seu email</h2>
            <p className="text-white/60 text-sm">
              Enviamos um link de confirmação para <strong className="text-white">{email}</strong>. Clique no link para ativar sua conta.
            </p>
            <button
              onClick={onBackToLogin}
              className="w-full px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 relative overflow-y-auto py-8"
      style={{ backgroundColor: '#0a1628' }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
        style={{ backgroundImage: `url(${veltorBg})` }}
      />
      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <img
          src={veltorLogo}
          alt="Veltor"
          className="w-3/4 max-w-[200px] h-auto drop-shadow-lg mb-4"
        />

        <p className="text-white/70 text-xs tracking-wide mb-5">
          Crie sua conta
        </p>

        <form onSubmit={(e) => {
          e.preventDefault();
          if (step === 1) handleNext();
          else if (step === 2) handleNextStep2();
          else handleSubmit(e);
        }} className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-5 space-y-3.5 shadow-2xl">
          
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Nome completo</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Seu nome" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="email@empresa.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Senha</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Mínimo 6 caracteres" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && (
                  <div className="space-y-0.5 text-xs mt-1.5">
                    <p className={strength.hasMinLength ? 'text-green-400' : 'text-red-400'}>
                      {strength.hasMinLength ? '✓' : '✗'} Mínimo 6 caracteres
                    </p>
                    <p className={strength.hasLetter ? 'text-green-400' : 'text-red-400'}>
                      {strength.hasLetter ? '✓' : '✗'} Contém letras
                    </p>
                    <p className={strength.hasNumber ? 'text-green-400' : 'text-red-400'}>
                      {strength.hasNumber ? '✓' : '✗'} Contém números
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Confirmar senha</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} placeholder="Repita a senha" required />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">País</label>
                <select value={country} onChange={(e) => { setCountry(e.target.value as 'BR' | 'PY'); setDocument(''); setPhone(''); }} className={selectClass}>
                  <option value="BR">🇧🇷 Brasil</option>
                  <option value="PY">🇵🇾 Paraguay</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Tipo de conta</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setAccountType('pessoal'); setDocument(''); }}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${accountType === 'pessoal' ? 'bg-secondary text-secondary-foreground border-secondary' : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/15'}`}>
                    Uso Pessoal
                  </button>
                  <button type="button" onClick={() => { setAccountType('empresa'); setDocument(''); }}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${accountType === 'empresa' ? 'bg-secondary text-secondary-foreground border-secondary' : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/15'}`}>
                    Empresa
                  </button>
                </div>
              </div>
              {accountType === 'empresa' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/90">Nome da empresa</label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} placeholder="Nome da empresa" required />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">{getDocumentLabel()}</label>
                <input type="text" value={document} onChange={(e) => setDocument(applyDocumentMask(e.target.value, country, accountType))} className={inputClass} placeholder={getDocumentPlaceholder()} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Telefone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(applyPhoneMask(e.target.value, country))} className={inputClass} placeholder={getPhonePlaceholder()} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/90">Plano mensal</label>
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={selectClass} required>
                  <option value="">Selecione um plano</option>
                  {filteredPlans.length === 0 ? (
                    <option value="" disabled>{plans.length === 0 ? 'Carregando planos...' : 'Nenhum plano para este país'}</option>
                  ) : (
                    filteredPlans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.currency === 'PYG' ? '₲' : 'R$'} {p.price.toLocaleString()})</option>
                    ))
                  )}
                </select>
                {filteredPlans.length === 0 && plans.length > 0 && (
                  <p className="text-[10px] text-white/40 mt-1">Nenhum plano disponível para {country === 'BR' ? 'Brasil' : 'Paraguay'}.</p>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4 py-2">
              {!paymentData ? (
                <>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2 text-center">
                    <p className="text-white/60 text-[10px] uppercase tracking-wider">Plano Selecionado</p>
                    <h3 className="text-white font-semibold text-sm">{selectedPlan?.name}</h3>
                    <div className="text-secondary font-bold text-xl">
                      {selectedPlan?.currency === 'PYG' ? '₲' : 'R$'} {selectedPlan?.price.toLocaleString()}
                    </div>
                    <p className="text-white/40 text-[10px]">{selectedPlan?.features}</p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-white/80 text-sm font-medium">Forma de Pagamento</p>
                    {country === 'BR' ? (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <CreditCard size={20} className="text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">PIX (Brasil)</p>
                          <p className="text-white/40 text-[10px]">Ativação imediata após confirmação</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setPaymentMethod('pagopar')}
                          className={`py-2.5 rounded-lg text-xs font-medium border transition-colors ${paymentMethod === 'pagopar' ? 'bg-secondary text-secondary-foreground border-secondary' : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/15'}`}>
                          Pagopar
                        </button>
                        <button type="button" onClick={() => setPaymentMethod('bancard')}
                          className={`py-2.5 rounded-lg text-xs font-medium border transition-colors ${paymentMethod === 'bancard' ? 'bg-secondary text-secondary-foreground border-secondary' : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/15'}`}>
                          Bancard
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-white/40 text-[10px] text-center leading-relaxed italic">
                    {country === 'BR' ? 'Ao clicar em "Gerar QR Code PIX", um código será gerado para pagamento.' : 'Ao clicar em "Ir para Pagamento", você será redirecionado para o ambiente seguro.'}
                  </p>
                </>
              ) : (
                <div className="space-y-4 text-center animate-fade-in">
                  <div className="bg-white rounded-lg p-4 inline-block mx-auto mb-2">
                    <img src={paymentData.pixQrCode} alt="PIX QR Code" className="w-48 h-48" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-white font-medium text-sm">Escaneie o QR Code</p>
                    <p className="text-white/60 text-xs px-4">Após o pagamento, clique no botão abaixo para finalizar seu cadastro.</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 overflow-hidden">
                    <p className="text-white/40 text-[10px] uppercase mb-1">Código PIX (Copia e Cola)</p>
                    <p className="text-white text-[10px] font-mono break-all line-clamp-2">{paymentData.pixCode}</p>
                    <button type="button" onClick={() => navigator.clipboard.writeText(paymentData.pixCode || '')}
                      className="mt-2 text-secondary text-[10px] font-medium hover:underline">Copiar código</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400 font-medium">{error}</p>}

          {step === 1 ? (
            <button type="submit" className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity">
              Continuar
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep(step - 1); setError(''); }}
                className="flex items-center justify-center gap-1 px-4 py-3 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors">
                <ArrowLeft size={16} /> Voltar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin" /> : (
                  paymentData ? <UserPlus size={18} /> : 
                  (step === 3 ? (country === 'BR' ? <CreditCard size={18} /> : <ArrowLeft size={18} className="rotate-180" />) : <UserPlus size={18} />)
                )}
                {loading ? 'Processando...' : (
                  paymentData ? 'Confirmar Pagamento e Finalizar' :
                  (step === 3 ? (country === 'BR' ? 'Gerar QR Code PIX' : 'Ir para Pagamento') : 'Próximo')
                )}
              </button>
            </div>
          )}
        </form>

        <button onClick={onBackToLogin} className="mt-4 text-sm text-white/60 hover:text-white transition-colors">
          Já tem conta? <span className="text-secondary font-medium">Entrar</span>
        </button>
      </div>
    </div>
  );
}
