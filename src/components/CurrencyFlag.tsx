import React from 'react';

const FLAGS: Record<string, { emoji: string; label: string }> = {
  BRL: { emoji: '🇧🇷', label: 'Real Brasileiro' },
  PYG: { emoji: '🇵🇾', label: 'Guaraní Paraguayo' },
  USD: { emoji: '🇺🇸', label: 'Dólar Americano' },
};

interface CurrencyFlagProps {
  currency: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showCode?: boolean;
}

export default function CurrencyFlag({ currency, size = 'md', showLabel = false, showCode = true }: CurrencyFlagProps) {
  const flag = FLAGS[currency] || { emoji: '💱', label: currency };
  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-1.5" title={flag.label}>
      <span className={sizeClass}>{flag.emoji}</span>
      {showCode && <span className="font-bold text-body-sm">{currency}</span>}
      {showLabel && <span className="text-xs text-muted-foreground">{flag.label}</span>}
    </span>
  );
}
