export function maskCPF(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function maskCedulaPY(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 7)
    .replace(/(\d{1})(\d{3})(\d{1,3})/, '$1.$2.$3');
}

export function maskRUC(value: string): string {
  return value
    .replace(/[^0-9-]/g, '')
    .slice(0, 10)
    .replace(/^(\d{8})(\d)/, '$1-$2');
}

export function maskPhoneBR(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function maskPhonePY(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 10)
    .replace(/(\d{4})(\d)/, '($1) $2')
    .replace(/(\d{3})(\d{1,3})$/, '$1-$2');
}

export function applyDocumentMask(value: string, country: 'BR' | 'PY', accountType: 'empresa' | 'pessoal'): string {
  if (country === 'BR') return accountType === 'empresa' ? maskCNPJ(value) : maskCPF(value);
  return accountType === 'empresa' ? maskRUC(value) : maskCedulaPY(value);
}

export function applyPhoneMask(value: string, country: 'BR' | 'PY'): string {
  return country === 'BR' ? maskPhoneBR(value) : maskPhonePY(value);
}
