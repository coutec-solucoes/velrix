import { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, Star } from 'lucide-react';
import veltorBg from '@/assets/veltor-bg.png';
import veltorLogo from '@/assets/veltor-logo.png';
import { applyDocumentMask, applyPhoneMask } from '@/utils/masks';
import { fetchPlans } from '@/services/adminSupabaseService';
import { SaasPlan } from '@/types/admin';
import { registerAccount } from '@/services/registrationService';

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
  const [billingCycle, setBillingCycle] = useState<'mensal' | 'anual'>('mensal');

  useEffect(() => {
    fetchPlans().then((fetchedPlans) => {
      setPlans(fetchedPlans);
      const params = new URLSearchParams(window.location.search);
      const urlCountry = params.get('country');
      if (urlCountry === 'BR' || urlCountry === 'PY') setCountry(urlCountry);
      const urlType = params.get('type');
      if (urlType === 'empresa' || urlType === 'pessoal') setAccountType(urlType);
      const urlPlanId = params.get('planId');
      if (urlPlanId && fetchedPlans.some(p => p.id === urlPlanId)) setPlanId(urlPlanId);
    });
  }, []);

  useEffect(() => {
    // Reset plan selection when country changes
    setPlanId('');
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
    handleSubmitTrial();
  };

  const selectedPlan = plans.find(p => p.id === planId);

  const handleSubmitTrial = async () => {
    setError('');
    setLoading(true);
    try {
      const err = await registerAccount({
        name,
        email,
        password,
        country,
        accountType,
        companyName: accountType === 'empresa' ? companyName : undefined,
        document,
        phone,
        planId: planId || undefined,
        billingCycle,
      }, true); // isTrial = true always

      if (err === 'register_email_exists') {
        setError('Este email já está cadastrado.');
      } else if (err === 'supabase_not_configured') {
        setError('Banco de dados não configurado.');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) handleNext();
    else if (step === 2) handleNextStep2();
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

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s < step ? 'bg-green-500 text-white' : s === step ? 'bg-secondary text-secondary-foreground' : 'bg-white/10 text-white/40'
              }`}>
                {s < step ? '✓' : s}
              </div>
              {s < 2 && <div className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-white/20'}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="w-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-5 space-y-3.5 shadow-2xl">
          
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-white/90">Escolha seu plano <span className="text-green-400 text-xs font-normal">(7 dias grátis!)</span></label>
                  <div className="flex items-center gap-2 bg-white/10 p-1 rounded-lg border border-white/10 scale-90 origin-right">
                    <button type="button" onClick={() => setBillingCycle('mensal')} 
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${billingCycle === 'mensal' ? 'bg-secondary text-secondary-foreground shadow-lg' : 'text-white/40 hover:text-white'}`}>
                      MENSAL
                    </button>
                    <button type="button" onClick={() => setBillingCycle('anual')} 
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${billingCycle === 'anual' ? 'bg-secondary text-secondary-foreground shadow-lg' : 'text-white/40 hover:text-white'}`}>
                      ANUAL
                      <span className="bg-green-500 text-white px-1.5 py-0.5 rounded text-[8px] animate-pulse whitespace-nowrap">-2 meses</span>
                    </button>
                  </div>
                </div>
                {filteredPlans.length === 0 && (
                  <p className="text-white/40 text-xs">{plans.length === 0 ? 'Carregando planos...' : 'Nenhum plano para este país'}</p>
                )}
                <div className="space-y-2">
                  {filteredPlans.map(p => {
                    const isSelected = planId === p.id;
                    const isPro = p.name.toLowerCase().includes('pro');
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPlanId(p.id)}
                        className={`w-full rounded-xl p-3 border-2 text-left transition-all relative overflow-hidden ${
                          isSelected
                            ? 'border-secondary bg-secondary/10'
                            : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
                        }`}
                      >
                        {isPro && (
                          <span className="absolute top-2 right-2 text-[10px] font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Star size={9} fill="currentColor" /> POPULAR
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-secondary' : 'border-white/30'
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-secondary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold">{p.name}</p>
                            {p.features && <p className="text-white/50 text-[10px] truncate">{p.features}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-secondary font-bold text-sm">
                              {p.currency === 'PYG' ? '₲' : 'R$'} {billingCycle === 'anual' ? (p.annualPrice || Math.round(p.price * 10)).toLocaleString() : p.price.toLocaleString()}
                            </p>
                            <p className="text-white/40 text-[9px]">/{billingCycle === 'anual' ? 'ano' : 'mês'} após trial</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {planId && (
                  <div className="mt-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
                    <p className="text-green-300 text-xs">✨ <strong>7 dias grátis</strong> — sem precisar de cartão agora!</p>
                  </div>
                )}
              </div>
            </>
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
              <button type="submit" disabled={loading || !planId}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
                style={{
                  background: loading || !planId ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)',
                  color: '#fff',
                }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                {loading ? 'Criando conta...' : 'Criar conta — 7 dias grátis 🚀'}
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
