import { AdminSettings } from '@/types/admin';
import { fetchAdminSettings } from '@/services/adminSupabaseService';

export interface PaymentInitiation {
  amount: number;
  currency: string;
  description: string;
  companyId: string;
  isAnnual: boolean;
  customer: {
    name: string;
    email: string;
    document: string;
    phone: string;
  };
}

export interface PaymentResponse {
  success: boolean;
  paymentUrl?: string;
  pixCode?: string;
  pixQrCode?: string;
  externalId?: string;
  error?: string;
}

export async function initiatePayment(data: PaymentInitiation, country: 'BR' | 'PY'): Promise<PaymentResponse> {
  const settings = await fetchAdminSettings();

  if (country === 'BR') {
    return initiatePixPayment(data, settings);
  } else {
    return initiatePagoparPayment(data, settings);
  }
}

// ─── PIX EMV BR Code Generator ────────────────────────────────────────────────
// Implements the BR Code standard (ISO 20022 / BCB spec)
// https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function buildPixEMV(
  pixKey: string,
  merchantName: string,
  merchantCity: string,
  amount: number,
  description?: string
): string {
  // Truncate name/city to EMV limits and sanitize (no special chars)
  const sanitize = (s: string, maxLen: number) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, maxLen).toUpperCase();

  const name = sanitize(merchantName || 'VELTOR FINANCE', 25);
  const city = sanitize(merchantCity || 'SAO PAULO', 15);
  const desc = sanitize(description || '***', 25) || '***';

  // Merchant Account Info (ID 26)
  const gui = emvField('00', 'BR.GOV.BCB.PIX');
  const key = emvField('01', pixKey.trim());
  const txnDesc = emvField('02', desc);
  const mai = emvField('26', gui + key + txnDesc);

  // Additional Data Field (ID 62) — reference label required
  const refLabel = emvField('05', '***');
  const adf = emvField('62', refLabel);

  // Base payload (without CRC)
  const amountStr = amount > 0 ? amount.toFixed(2) : '';
  const payload =
    emvField('00', '01') +         // Payload Format Indicator
    emvField('01', '12') +         // Point of Initiation: 12 = dynamic (unique), 11 = static reusable
    mai +                           // Merchant Account Info
    emvField('52', '0000') +       // MCC
    emvField('53', '986') +        // Currency (986 = BRL)
    (amountStr ? emvField('54', amountStr) : '') +  // Amount
    emvField('58', 'BR') +         // Country
    emvField('59', name) +         // Merchant Name
    emvField('60', city) +         // Merchant City
    adf +                           // Additional Data
    '6304';                         // CRC placeholder (ID 63, length 04)

  const checksum = crc16(payload);
  return payload + checksum;
}

async function initiatePixPayment(data: PaymentInitiation, settings: AdminSettings): Promise<PaymentResponse> {
  // If Mercado Pago is configured, use it for automated PIX
  if (settings.mpPublicKey && settings.mpSecretKey) {
    try {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.mpSecretKey}`,
          'X-Idempotency-Key': `pix-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: data.amount,
          description: data.description,
          payment_method_id: 'pix',
          payer: {
            email: data.customer.email,
            first_name: data.customer.name.split(' ')[0],
            last_name: data.customer.name.split(' ').slice(1).join(' ') || 'User',
            identification: {
              type: data.customer.document.length > 11 ? 'CNPJ' : 'CPF',
              number: data.customer.document.replace(/\D/g, ''),
            },
          },
          metadata: {
            customer_email: data.customer.email,
            description: data.description,
            company_id: data.companyId,
            is_annual: data.isAnnual
          }
        }),
      });

      const mpData = await response.json();

      if (response.ok && mpData.point_of_interaction?.transaction_data) {
        return {
          success: true,
          pixCode: mpData.point_of_interaction.transaction_data.qr_code,
          pixQrCode: `data:image/png;base64,${mpData.point_of_interaction.transaction_data.qr_code_base64}`,
          externalId: String(mpData.id),
        };
      } else {
        console.warn('[PaymentService] MP PIX failed, falling back to static:', mpData);
      }
    } catch (err) {
      console.error('[PaymentService] Error initiating MP PIX:', err);
    }
  }

  // Fallback to Static PIX (requires manual confirmation)
  if (!settings.pixKey) {
    return {
      success: false,
      error: 'Chave PIX não configurada. Peça ao administrador para configurar em Admin → APIs → PIX (Brasil).',
    };
  }

  try {
    const pixCode = buildPixEMV(
      settings.pixKey,
      settings.pixMerchantName || 'VELTOR FINANCE',
      settings.pixCity || 'SAO PAULO',
      data.amount,
      data.description
    );

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=16&data=${encodeURIComponent(pixCode)}`;

    return {
      success: true,
      pixCode,
      pixQrCode: qrUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'Erro ao gerar código PIX: ' + (err?.message || 'Erro desconhecido'),
    };
  }
}

async function initiatePagoparPayment(data: PaymentInitiation, settings: AdminSettings): Promise<PaymentResponse> {
  if (!settings.pagoparPublicKey || !settings.pagoparPrivateKey) {
    return { success: false, error: 'Pagopar não configurado pelo administrador.' };
  }

  console.log('Initiating Pagopar for:', data.amount);

  return {
    success: true,
    paymentUrl: 'https://www.pagopar.com/pagar/placeholder-token-' + Math.random().toString(36).substring(7),
  };
}

async function initiateBancardPayment(data: PaymentInitiation, settings: AdminSettings): Promise<PaymentResponse> {
  if (!settings.bancardPublicKey || !settings.bancardPrivateKey) {
    return { success: false, error: 'Bancard não configurado pelo administrador.' };
  }

  console.log('Initiating Bancard for:', data.amount);

  return {
    success: true,
    paymentUrl: 'https://vpos.infonet.com.py/checkout/placeholder',
  };
}

/**
 * Checks if a payment for the company has been registered in the database as 'pago'.
 * This is used for polling or manual verification.
 */
export async function checkPaymentStatus(companyId: string): Promise<{ paid: boolean; error?: string }> {
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const supabase = getSupabase();
    if (!supabase) return { paid: false, error: 'Supabase not configured' };

    const { data, error } = await supabase
      .from('saas_payments')
      .select('status')
      .eq('company_id', companyId)
      .eq('status', 'pago')
      .order('date', { ascending: false })
      .limit(1);

    if (error) throw error;

    return { paid: Boolean(data && data.length > 0) };
  } catch (err: any) {
    return { paid: false, error: err.message };
  }
}

/**
 * Calls the mp-check Edge Function to verify payment status directly with Mercado Pago.
 * This is a fallback/force-check that also updates the DB if paid.
 */
export async function checkExternalPaymentStatus(paymentId: string, companyId: string): Promise<{ paid: boolean; status?: string; error?: string }> {
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const supabase = getSupabase();
    if (!supabase) return { paid: false, error: 'Supabase not configured' };

    const { data, error } = await supabase.functions.invoke('mp-check', {
      body: { paymentId, companyId },
    });

    if (error) throw error;
    return { paid: Boolean(data?.paid), status: data?.status };
  } catch (err: any) {
    console.error('External verify error:', err);
    return { paid: false, error: err.message };
  }
}
