import { Currency } from '@/types';
import { getAppData } from '@/services/storageService';

export interface ConversionResult {
  originalAmount: number;
  originalCurrency: Currency;
  convertedAmount: number;
  convertedCurrency: Currency;
  rate: number;
  wasConverted: boolean;
}

const DEFAULT_RATES: Record<string, number> = {
  'BRL_PYG': 1250,
  'USD_BRL': 5.5,
  'USD_PYG': 6500,
  'PYG_BRL': 1 / 1250,
  'BRL_USD': 1 / 5.5,
  'PYG_USD': 1 / 6500,
};

/**
 * Get the exchange rate between two currencies from app settings.
 * Tries direct pair and inverse pair.
 */
export function getExchangeRate(from: Currency, to: Currency): number {
  if (from === to) return 1;
  const rates = getAppData().settings.company.exchangeRates || [];
  
  // Try direct pair: from_to
  const direct = rates.find((r: any) => r.pair === `${from}_${to}`);
  if (direct && direct.rate > 0) return direct.rate;
  
  // Try inverse pair: to_from
  const inverse = rates.find((r: any) => r.pair === `${to}_${from}`);
  if (inverse && inverse.rate > 0) return 1 / inverse.rate;
  
  console.warn(`[CurrencyConversion] No rate found for ${from} → ${to}, using default system fallback.`);
  return DEFAULT_RATES[`${from}_${to}`] || 1;
}

/**
 * Convert an amount from one currency to another using configured exchange rates.
 */
export function convertAmount(amount: number, from: Currency, to: Currency): ConversionResult {
  const rate = getExchangeRate(from, to);
  const wasConverted = from !== to;
  return {
    originalAmount: amount,
    originalCurrency: from,
    convertedAmount: wasConverted ? Math.round(amount * rate * 100) / 100 : amount,
    convertedCurrency: to,
    rate,
    wasConverted,
  };
}

/**
 * Format a conversion description for audit/display purposes.
 */
export function conversionDescription(conv: ConversionResult): string {
  if (!conv.wasConverted) return '';
  return ` (${conv.originalCurrency} → ${conv.convertedCurrency} @ ${conv.rate.toFixed(4)})`;
}
