import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAppData, updateSettings, addExchangeRateSnapshot, getExchangeRateHistory, onDataChange } from '@/services/storageService';
import { AppSettings, Currency, Country, AppLanguage, ExchangeRateSnapshot, LateFeeSettings } from '@/types';
import { useTranslation } from '@/hooks/useI18n';
import { Save, Building2, Coins, Globe, CheckCircle2, ArrowRightLeft, ToggleLeft, ToggleRight, History, UserCog, Percent, Upload, Route, X as XIcon, BookOpen, CreditCard } from 'lucide-react';
import SaveButton from '@/components/SaveButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Usuarios from '@/pages/Usuarios';
import ManualTreinamento from '@/components/ManualTreinamento';
import MeuPlano from '@/components/MeuPlano';

const allCurrencies: { code: Currency; label: string; symbol: string }[] = [
  { code: 'BRL', label: 'Real', symbol: 'R$' },
  { code: 'PYG', label: 'Guaraní', symbol: '₲' },
  { code: 'USD', label: 'Dólar', symbol: '$' },
];

const currencyPairs = [
  { pair: 'BRL_PYG', from: 'BRL', to: 'PYG', label: 'R$ BRL → ₲ PYG', inverse: 'PYG_BRL', color: 'hsl(var(--secondary))' },
  { pair: 'USD_BRL', from: 'USD', to: 'BRL', label: '$ USD → R$ BRL', inverse: 'BRL_USD', color: 'hsl(var(--success))' },
  { pair: 'USD_PYG', from: 'USD', to: 'PYG', label: '$ USD → ₲ PYG', inverse: 'PYG_USD', color: 'hsl(var(--warning))' },
];

const inversePairLabels: Record<string, string> = {
  'PYG_BRL': '₲ PYG → R$ BRL',
  'BRL_USD': 'R$ BRL → $ USD',
  'PYG_USD': '₲ PYG → $ USD',
};

const countries: { code: Country; label: string; flag: string }[] = [
  { code: 'BR', label: 'Brasil', flag: '🇧🇷' },
  { code: 'PY', label: 'Paraguay', flag: '🇵🇾' },
];

const languages: { code: AppLanguage; label: string }[] = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'es-PY', label: 'Español (Paraguay)' },
];

export default function Configuracoes() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'geral';
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<ExchangeRateSnapshot[]>([]);
  const [selectedHistoryPair, setSelectedHistoryPair] = useState('BRL_PYG');
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { t, setLanguage } = useTranslation();

  const load = useCallback(() => {
    const data = getAppData();
    const company = data.settings.company as any;
    
    if (!('multiCurrency' in company)) {
      company.multiCurrency = true;
      company.country = 'BR';
      company.language = 'pt-BR';
      company.currencyPriority = company.activeCurrencies?.length ? [...company.activeCurrencies] : ['BRL', 'PYG', 'USD'];
    }
    
    // Initialize exchange rates if missing, empty, or incomplete
    const hasRates = Array.isArray(company.exchangeRates) && company.exchangeRates.length >= 6;
    if (!hasRates) {
      const oldRates = !Array.isArray(company.exchangeRates) ? company.exchangeRates : null;
      const existingRates = Array.isArray(company.exchangeRates) ? company.exchangeRates : [];
      const findExisting = (pair: string) => existingRates.find((r: any) => r.pair === pair)?.rate;
      const now = new Date().toISOString();
      company.exchangeRates = [
        { pair: 'BRL_PYG', rate: findExisting('BRL_PYG') || oldRates?.['BRL_PYG'] || 1250, updatedAt: now },
        { pair: 'USD_BRL', rate: findExisting('USD_BRL') || oldRates?.['USD_BRL'] || 5.5, updatedAt: now },
        { pair: 'USD_PYG', rate: findExisting('USD_PYG') || oldRates?.['USD_PYG'] || 6500, updatedAt: now },
        { pair: 'PYG_BRL', rate: findExisting('PYG_BRL') || (oldRates?.['BRL_PYG'] ? 1 / oldRates['BRL_PYG'] : 0.0008), updatedAt: now },
        { pair: 'BRL_USD', rate: findExisting('BRL_USD') || (oldRates?.['USD_BRL'] ? 1 / oldRates['USD_BRL'] : 0.1818), updatedAt: now },
        { pair: 'PYG_USD', rate: findExisting('PYG_USD') || (oldRates?.['USD_PYG'] ? 1 / oldRates['USD_PYG'] : 0.000154), updatedAt: now },
      ];
    }
    setSettings({ ...data.settings });
    setHistory(getExchangeRateHistory());
  }, []);

  useEffect(() => {
    load();
    // Listen for data changes (e.g. initial pull finishing)
    const unsubscribe = onDataChange((table) => {
      if (table === 'companies' || table === 'exchange_rate_history') {
        load();
      }
    });
    return unsubscribe;
  }, [load]);

  if (!settings) return null;

  const { company } = settings;

  const updateCompany = (updates: Partial<typeof company>) => {
    setSettings({ ...settings, company: { ...company, ...updates } });
    setSaved(false);
  };

  const handleCountryChange = (country: Country) => {
    const lang: AppLanguage = country === 'BR' ? 'pt-BR' : 'es-PY';
    const defaultCurrency: Currency = country === 'BR' ? 'BRL' : 'PYG';
    
    // Update first priority if changing country
    const newPriority = [...(company.currencyPriority || [])];
    if (newPriority.length === 0) {
      newPriority.push(defaultCurrency);
    } else {
      newPriority[0] = defaultCurrency;
    }
    
    updateCompany({ 
      country, 
      language: lang, 
      currencyPriority: newPriority, 
      activeCurrencies: newPriority 
    });
    setLanguage(lang);
  };

  const handleLanguageChange = (lang: AppLanguage) => {
    updateCompany({ language: lang });
    setLanguage(lang);
  };

  const features = (company.planFeatures || '').toLowerCase();
  const canUseMultiCurrency = 
    features.includes('moeda') || 
    features.includes('multi') || 
    features.includes('completo') || 
    features.includes('pro') ||
    features.includes('ilimitado');

  const toggleMultiCurrency = () => {
    if (!canUseMultiCurrency && !company.multiCurrency) {
      alert('Seu plano atual não permite habilitar múltiplas moedas. Migrar para o Plano Completo no painel Admin.');
      return;
    }
    updateCompany({ multiCurrency: !company.multiCurrency });
  };

  const handlePriorityChange = (index: number, code: Currency) => {
    const newPriority = [...company.currencyPriority];
    const existingIdx = newPriority.indexOf(code);
    if (existingIdx !== -1 && existingIdx !== index) {
      newPriority[existingIdx] = newPriority[index];
    }
    newPriority[index] = code;
    updateCompany({ currencyPriority: newPriority, activeCurrencies: newPriority });
  };

  const getRate = (pair: string): number => {
    const found = company.exchangeRates.find((r) => r.pair === pair);
    return found?.rate || 0;
  };

  const getRateDate = (pair: string): string => {
    const found = company.exchangeRates.find((r) => r.pair === pair);
    if (!found?.updatedAt) return '';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(found.updatedAt));
  };

  const updateExchangeRate = (pair: string, rateStr: string, inversePair: string) => {
    // Update local input state for smooth typing
    setRateInputs(prev => ({ ...prev, [pair]: rateStr }));
    
    const rate = parseFloat(rateStr);
    if (isNaN(rate)) return;
    
    const now = new Date().toISOString();
    const newRates = company.exchangeRates.map((r) => {
      if (r.pair === pair) return { ...r, rate, updatedAt: now };
      if (r.pair === inversePair) return { ...r, rate: rate > 0 ? 1 / rate : 0, updatedAt: now };
      return r;
    });
    updateCompany({ exchangeRates: newRates });
  };

  const getRateInputValue = (pair: string): string => {
    if (rateInputs[pair] !== undefined) return rateInputs[pair];
    const rate = getRate(pair);
    return rate ? String(rate) : '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(settings);
      const mainRates = currencyPairs.map((cp) => ({
        pair: cp.pair,
        rate: getRate(cp.pair),
      }));
      await addExchangeRateSnapshot(mainRates);
      setHistory(getExchangeRateHistory());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const inputClass = 'w-full border border-border rounded-lg px-3 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-colors';
  const priorityLabels = [t('cfg_currency_primary'), t('cfg_currency_secondary'), t('cfg_currency_tertiary')];
  const priorityDescriptions = [t('cfg_currency_primary_desc'), t('cfg_currency_secondary_desc'), t('cfg_currency_tertiary_desc')];

  // Chart data for history
  const selectedPairInfo = currencyPairs.find((cp) => cp.pair === selectedHistoryPair);
  const historyChartData = history.map((snap) => {
    const rateEntry = snap.rates.find((r) => r.pair === selectedHistoryPair);
    return {
      date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(snap.date + 'T12:00:00')),
      rate: rateEntry?.rate || 0,
    };
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-title-lg">{t('cfg_title')}</h1>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="bg-muted mb-6">
          <TabsTrigger value="geral" className="gap-1.5"><Building2 size={14} />{t('cfg_company_data')}</TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1.5"><UserCog size={14} />{t('usr_tab')}</TabsTrigger>
          <TabsTrigger value="meu-plano" className="gap-1.5"><CreditCard size={14} />Meu Plano</TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5"><BookOpen size={14} />📚 Manual do Sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6 max-w-3xl">

      {/* Company */}
      <div className="bg-card rounded-lg p-6 card-shadow border border-border space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={20} className="text-secondary" />
          <h2 className="text-body font-semibold">{t('cfg_company_data')}</h2>
        </div>
        <div className="flex items-start gap-6">
          {/* Logo upload */}
          <div className="flex flex-col items-center gap-2">
            <label className="block text-body-sm font-medium mb-1">Logo</label>
            <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden group cursor-pointer hover:border-secondary transition-colors">
              {company.logo ? (
                <>
                  <img src={company.logo} alt="Logo" className="w-full h-full object-contain p-1" />
                  <button
                    type="button"
                    onClick={() => updateCompany({ logo: undefined })}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <XIcon size={12} />
                  </button>
                </>
              ) : (
                <Upload size={20} className="text-muted-foreground" />
              )}
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500 * 1024) {
                    alert('A imagem deve ter no máximo 500KB');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const base64 = ev.target?.result as string;
                    updateCompany({ logo: base64 });
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">Máx. 500KB</span>
          </div>
          {/* Company name */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-body-sm font-medium mb-1">{t('cfg_company_name')}</label>
              <input value={company.name} onChange={(e) => updateCompany({ name: e.target.value })} className={inputClass} />
              <p className="text-[11px] text-muted-foreground mt-1">Este nome e logo aparecerão no menu lateral e nos relatórios.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-body-sm font-medium mb-1">{company.country === 'BR' ? 'CNPJ' : 'RUC'}</label>
                <input value={company.document || ''} onChange={(e) => updateCompany({ document: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Telefone / WhatsApp</label>
                <input value={company.phone || ''} onChange={(e) => updateCompany({ phone: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">E-mail</label>
                <input type="email" value={company.email || ''} onChange={(e) => updateCompany({ email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-body-sm font-medium mb-1">Endereço Completo</label>
                <input value={company.address || ''} onChange={(e) => updateCompany({ address: e.target.value })} className={inputClass} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Country & Language */}
      <div className="bg-card rounded-lg p-6 card-shadow border border-border space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={20} className="text-secondary" />
          <h2 className="text-body font-semibold">{t('cfg_country_language')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-body-sm font-medium mb-1">{t('cfg_country')}</label>
            <select value={company.country} onChange={(e) => handleCountryChange(e.target.value as Country)} className={inputClass}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-body-sm font-medium mb-1">{t('cfg_language')}</label>
            <select value={company.language} onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)} className={inputClass}>
              {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-body-sm font-medium mb-1">{t('cfg_default_currency')}</label>
            <select 
              value={company.currencyPriority?.[0] || ''} 
              onChange={(e) => handlePriorityChange(0, e.target.value as Currency)} 
              className={inputClass}
            >
              {allCurrencies.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.label} ({c.code})</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">{t('cfg_currency_primary_desc')}</p>
          </div>
        </div>
      </div>

      {/* Multi-currency toggle */}
      <div className="bg-card rounded-lg p-6 card-shadow border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={20} className="text-secondary" />
            <div>
              <h2 className="text-body font-semibold">{t('cfg_multi_currency')}</h2>
              <p className="text-body-sm text-muted-foreground">{t('cfg_multi_currency_desc')}</p>
            </div>
          </div>
          <button 
            onClick={toggleMultiCurrency} 
            className={`flex items-center gap-2 transition-colors ${!canUseMultiCurrency && !company.multiCurrency ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!canUseMultiCurrency && !company.multiCurrency ? 'Recurso bloqueado pelo seu plano' : ''}
          >
            {company.multiCurrency ? <ToggleRight size={36} className="text-secondary" /> : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
        {!canUseMultiCurrency && !company.multiCurrency && (
          <p className="text-[11px] text-amber-500 font-medium">
            ⚠️ Este recurso está disponível apenas no <strong>Plano Financeiro Completo</strong>.
          </p>
        )}
      </div>

      {/* Moedas Tab */}
      {company.multiCurrency && (
        <div className="bg-card rounded-lg card-shadow border border-border overflow-hidden">
          <div className="p-6 pb-0">
            <div className="flex items-center gap-2 mb-1">
              <Coins size={20} className="text-secondary" />
              <h2 className="text-title-section font-bold">{t('cfg_currencies')}</h2>
            </div>
            <p className="text-body-sm text-muted-foreground mb-4">{t('cfg_currencies_desc')}</p>
          </div>

          <Tabs defaultValue="cadastro" className="w-full">
            <div className="px-6">
              <TabsList className="bg-muted">
                <TabsTrigger value="cadastro" className="gap-1.5"><Coins size={14} />{t('cfg_currency_register')}</TabsTrigger>
                <TabsTrigger value="cotacao" className="gap-1.5"><ArrowRightLeft size={14} />{t('cfg_daily_rate')}</TabsTrigger>
                <TabsTrigger value="historico" className="gap-1.5"><History size={14} />{t('cfg_rate_history')}</TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: Cadastro */}
            <TabsContent value="cadastro" className="p-6 pt-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Coins size={16} className="text-secondary" />
                  <h3 className="text-body font-semibold">{t('cfg_priority')}</h3>
                </div>
                <p className="text-body-sm text-muted-foreground mb-4">{t('cfg_priority_desc')}</p>
              </div>
              <div className="space-y-3">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background">
                    <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                      <span className="text-secondary font-bold text-body-sm">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-semibold">{t('cfg_currencies')} {idx + 1} ({priorityLabels[idx]})</p>
                      <p className="text-xs text-muted-foreground">{priorityDescriptions[idx]}</p>
                    </div>
                    <select
                      value={company.currencyPriority[idx] || ''}
                      onChange={(e) => handlePriorityChange(idx, e.target.value as Currency)}
                      className="border border-border rounded-lg px-4 py-2 text-body-sm bg-background focus:ring-2 focus:ring-secondary focus:border-secondary outline-none min-w-[180px]"
                    >
                      {allCurrencies.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.label} ({c.code})</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Tab: Cotação Diária */}
            <TabsContent value="cotacao" className="p-6 pt-4 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={16} className="text-success" />
                  <h3 className="text-body font-semibold">{t('cfg_current_rate')}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {currencyPairs.map((cp) => (
                    <div key={cp.pair} className="p-4 rounded-lg border border-border bg-background">
                      <p className="text-xs text-muted-foreground mb-1">{cp.label}</p>
                      <p className="text-title-section font-bold">{getRate(cp.pair).toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground mt-1">⏱ {getRateDate(cp.pair)}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  {currencyPairs.map((cp) => (
                    <div key={cp.inverse} className="p-4 rounded-lg border border-border bg-background">
                      <p className="text-xs text-muted-foreground mb-1">{inversePairLabels[cp.inverse]}</p>
                      <p className="text-title-section font-bold">{getRate(cp.inverse).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</p>
                      <p className="text-xs text-muted-foreground mt-1">⏱ {getRateDate(cp.inverse)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowRightLeft size={16} className="text-secondary" />
                  <h3 className="text-body font-semibold">{t('cfg_new_rate')}</h3>
                </div>
                <p className="text-body-sm text-muted-foreground mb-4">{t('cfg_new_rate_desc')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                  {currencyPairs.map((cp, i) => (
                    <div key={cp.pair} className="p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
                      <p className="text-body-sm font-semibold text-secondary mb-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-secondary-foreground text-xs mr-1.5">{i + 1}</span>
                        {cp.label}
                      </p>
                      <input type="text" inputMode="decimal" value={getRateInputValue(cp.pair)} onChange={(e) => updateExchangeRate(cp.pair, e.target.value, cp.inverse)} onBlur={() => setRateInputs(prev => { const next = {...prev}; delete next[cp.pair]; return next; })} className={inputClass} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {currencyPairs.map((cp) => (
                    <div key={cp.inverse} className="p-3 rounded-lg border border-border bg-muted/30">
                      <p className="text-body-sm text-muted-foreground mb-2">{inversePairLabels[cp.inverse]}</p>
                      <input type="number" step="any" value={getRate(cp.inverse) ? Number(getRate(cp.inverse).toFixed(10)) : ''} readOnly className={`${inputClass} bg-muted cursor-not-allowed`} />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Tab: Histórico */}
            <TabsContent value="historico" className="p-6 pt-4 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <History size={16} className="text-secondary" />
                  <h3 className="text-body font-semibold">{t('cfg_rate_history')}</h3>
                </div>
                <p className="text-body-sm text-muted-foreground mb-4">{t('cfg_rate_history_desc')}</p>

                {/* Pair selector */}
                <div className="flex items-center gap-2 mb-4">
                  {currencyPairs.map((cp) => (
                    <button
                      key={cp.pair}
                      onClick={() => setSelectedHistoryPair(cp.pair)}
                      className={`px-3 py-1.5 rounded-lg text-body-sm font-medium border transition-colors ${
                        selectedHistoryPair === cp.pair
                          ? 'bg-secondary text-secondary-foreground border-secondary'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      {cp.label}
                    </button>
                  ))}
                </div>

                {historyChartData.length === 0 ? (
                  <p className="text-muted-foreground text-body-sm">{t('cfg_no_history')}</p>
                ) : (
                  <div className="bg-background rounded-lg border border-border p-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={historyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid hsl(var(--border))',
                            fontSize: '14px',
                            background: 'hsl(var(--card))',
                          }}
                          formatter={(value: number) => [value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), selectedPairInfo?.label]}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="rate"
                          name={selectedPairInfo?.label}
                          stroke={selectedPairInfo?.color || 'hsl(var(--secondary))'}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* History table */}
                {historyChartData.length > 0 && (
                  <div className="bg-background rounded-lg border border-border overflow-x-auto mt-4">
                    <table className="w-full text-body-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                          {currencyPairs.map((cp) => (
                            <th key={cp.pair} className="text-right p-3 font-medium text-muted-foreground">{cp.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...history].reverse().slice(0, 15).map((snap) => (
                          <tr key={snap.date} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-muted-foreground">
                              {new Intl.DateTimeFormat('pt-BR').format(new Date(snap.date + 'T12:00:00'))}
                            </td>
                            {currencyPairs.map((cp) => {
                              const r = snap.rates.find((x) => x.pair === cp.pair);
                              return (
                                <td key={cp.pair} className="p-3 text-right font-semibold">
                                  {r ? r.rate.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Cobradores Module */}
      <div className="bg-card rounded-lg p-6 card-shadow border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route size={20} className="text-secondary" />
            <div>
              <h2 className="text-body font-semibold">Módulo de Cobradores</h2>
              <p className="text-body-sm text-muted-foreground">Ativar gestão de rotas e fechamento para cobradores.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setSettings({ ...settings, cobradoresEnabled: !settings.cobradoresEnabled });
              setSaved(false);
            }}
            className="flex items-center gap-2 transition-colors"
          >
            {settings.cobradoresEnabled ? <ToggleRight size={36} className="text-secondary" /> : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Late Fees & Interest */}
      <div className="bg-card rounded-lg p-6 card-shadow border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent size={20} className="text-secondary" />
            <div>
              <h2 className="text-body font-semibold">{t('cfg_late_fees')}</h2>
              <p className="text-body-sm text-muted-foreground">{t('cfg_late_fees_desc')}</p>
            </div>
          </div>
          <button
            onClick={() => {
              const current = settings.lateFees || { enabled: false, feePercent: 2, interestPerDay: 0.033 };
              setSettings({ ...settings, lateFees: { ...current, enabled: !current.enabled } });
              setSaved(false);
            }}
            className="flex items-center gap-2 transition-colors"
          >
            {settings.lateFees?.enabled ? <ToggleRight size={36} className="text-secondary" /> : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
        {settings.lateFees?.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-body-sm font-medium mb-1">{t('cfg_late_fee_percent')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={settings.lateFees.feePercent}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setSettings({ ...settings, lateFees: { ...settings.lateFees!, feePercent: v } });
                  setSaved(false);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium mb-1">{t('cfg_interest_per_day')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={settings.lateFees.interestPerDay}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setSettings({ ...settings, lateFees: { ...settings.lateFees!, interestPerDay: v } });
                  setSaved(false);
                }}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      <SaveButton
        onClick={handleSave}
        saving={saving}
        label={saved ? t('cfg_saved') : t('cfg_save')}
        icon={<Save size={18} />}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
      />
        </TabsContent>

        <TabsContent value="usuarios">
          <Usuarios />
        </TabsContent>

        <TabsContent value="meu-plano">
          <MeuPlano />
        </TabsContent>

        <TabsContent value="manual" className="w-full">
          <ManualTreinamento />
        </TabsContent>
      </Tabs>
    </div>
  );
}
