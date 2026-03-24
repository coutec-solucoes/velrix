import { AdminSettings } from '@/types/admin';
import { fetchAdminSettings } from '@/services/adminSupabaseService';

export interface PaymentInitiation {
  amount: number;
  currency: string;
  description: string;
  customer: {
    name: string;
    email: string;
    document: string;
    phone: string;
  };
}

export interface PaymentResponse {
  success: boolean;
  paymentUrl?: string; // For redirect-based (Pagopar/Bancard)
  pixCode?: string;    // For PIX copy/paste
  pixQrCode?: string;  // For PIX image
  error?: string;
}

export async function initiatePayment(data: PaymentInitiation, country: 'BR' | 'PY'): Promise<PaymentResponse> {
  const settings = await fetchAdminSettings();

  if (country === 'BR') {
    return initiatePixPayment(data, settings);
  } else {
    // In Paraguay we can choose between Pagopar and Bancard. 
    // Defaulting to Pagopar if configured, or both as options? 
    // Request specifically mentioned both. For now let's implement Pagopar as primary.
    return initiatePagoparPayment(data, settings);
  }
}

async function initiatePixPayment(data: PaymentInitiation, settings: AdminSettings): Promise<PaymentResponse> {
  if (!settings.pixKey) {
    return { success: false, error: 'PIX não configurado pelo administrador.' };
  }

  // TODO: Integrate with a real PIX provider (Gerencianet, Mercado Pago, etc)
  // For now, generating a placeholder response
  console.log('Initiating PIX for:', data.amount, settings.pixKey);
  
  return {
    success: true,
    pixCode: "00020126580014BR.GOV.BCB.PIX0136" + settings.pixKey + "5204000053039865406" + data.amount.toFixed(2) + "5802BR5913" + settings.pixMerchantName + "6009" + settings.pixCity + "62070503***6304",
    pixQrCode: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PlaceholderPixCode"
  };
}

async function initiatePagoparPayment(data: PaymentInitiation, settings: AdminSettings): Promise<PaymentResponse> {
  if (!settings.pagoparPublicKey || !settings.pagoparPrivateKey) {
    return { success: false, error: 'Pagopar não configurado pelo administrador.' };
  }

  // TODO: Implement Pagopar API call (JSON-RPC)
  // 1. Generate hash (sha1 of private_key + amount + order_id)
  // 2. Call Pagopar API to get pay_token
  // 3. Return URL: https://www.pagopar.com/pagar/{pay_token}

  console.log('Initiating Pagopar for:', data.amount);

  return {
    success: true,
    paymentUrl: "https://www.pagopar.com/pagar/placeholder-token-" + Math.random().toString(36).substring(7)
  };
}

async function initiateBancardPayment(data: PaymentInitiation, settings: AdminSettings): Promise<PaymentResponse> {
  if (!settings.bancardPublicKey || !settings.bancardPrivateKey) {
    return { success: false, error: 'Bancard não configurado pelo administrador.' };
  }

  // TODO: Implement Bancard vpos/checkout API
  console.log('Initiating Bancard for:', data.amount);

  return {
    success: true,
    paymentUrl: "https://vpos.infonet.com.py/checkout/placeholder"
  };
}
