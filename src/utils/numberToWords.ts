const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function groupToWords(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const u = remainder % 10;

  if (h > 0) parts.push(hundreds[h]);

  if (remainder >= 10 && remainder <= 19) {
    parts.push(teens[remainder - 10]);
  } else {
    if (t > 0) parts.push(tens[t]);
    if (u > 0) parts.push(units[u]);
  }

  return parts.join(' e ');
}

const scaleNames: [number, string, string][] = [
  [1_000_000_000, 'bilhão', 'bilhões'],
  [1_000_000, 'milhão', 'milhões'],
  [1_000, 'mil', 'mil'],
];

function integerToWords(n: number): string {
  if (n === 0) return 'zero';

  const parts: string[] = [];
  let remaining = n;

  for (const [value, singular, plural] of scaleNames) {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      if (value === 1000 && count === 1) {
        parts.push('mil');
      } else {
        parts.push(`${groupToWords(count)} ${count === 1 ? singular : plural}`);
      }
      remaining %= value;
    }
  }

  if (remaining > 0) {
    parts.push(groupToWords(remaining));
  }

  if (parts.length <= 1) return parts[0] || 'zero';

  const last = parts.pop()!;
  return parts.join(', ') + ' e ' + last;
}

type CurrencyLabel = { singular: string; plural: string; centSingular: string; centPlural: string };

const currencyLabels: Record<string, CurrencyLabel> = {
  BRL: { singular: 'real', plural: 'reais', centSingular: 'centavo', centPlural: 'centavos' },
  USD: { singular: 'dólar', plural: 'dólares', centSingular: 'centavo', centPlural: 'centavos' },
  PYG: { singular: 'guarani', plural: 'guaranis', centSingular: 'céntimo', centPlural: 'céntimos' },
};

export function currencyToWords(value: number, currency: string): string {
  const labels = currencyLabels[currency] || currencyLabels.BRL;
  const absValue = Math.abs(value);
  const intPart = Math.floor(absValue);
  const centPart = Math.round((absValue - intPart) * 100);

  const parts: string[] = [];

  if (intPart > 0 || centPart === 0) {
    parts.push(`${integerToWords(intPart)} ${intPart === 1 ? labels.singular : labels.plural}`);
  }

  if (centPart > 0) {
    parts.push(`${integerToWords(centPart)} ${centPart === 1 ? labels.centSingular : labels.centPlural}`);
  }

  return parts.join(' e ');
}
