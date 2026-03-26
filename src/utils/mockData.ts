import { AppData } from '@/types';

/**
 * Returns empty initial data (no mock/test data).
 */
export function generateMockData(): AppData {
  return {
    users: [],
    companies: [],
    clients: [],
    transactions: [],
    contracts: [],
    categories: [],
    bankAccounts: [],
    cashMovements: [],
    auditLogs: [],
    cobradores: [],
    settings: {
      company: {
        id: crypto.randomUUID(),
        name: '',
        country: 'BR',
        language: 'pt-BR',
        multiCurrency: true,
        currencyPriority: ['BRL', 'PYG', 'USD'],
        activeCurrencies: ['BRL', 'PYG', 'USD'],
        exchangeRates: [],
      },
      cobradoresEnabled: true,
    },
    exchangeRateHistory: [],
  };
}
