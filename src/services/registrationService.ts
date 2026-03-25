import { getSupabase } from '@/lib/supabase';
import { initiatePayment, PaymentResponse, PaymentInitiation } from './paymentService';

export interface RegisterData {
  name: string;
  email: string;
  password?: string; // Optional if we just want to create profile, but needed for signUp
  country: 'BR' | 'PY';
  accountType: 'empresa' | 'pessoal';
  companyName?: string;
  document: string;
  phone: string;
  planId?: string;
}

/**
 * Creates a new user account in Supabase Auth and updates the profiles table.
 */
export async function registerAccount(data: RegisterData, isTrial: boolean = false): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return 'supabase_not_configured';

  if (!data.password) return 'Senha obrigatória para registro.';

  const { data: authData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        name: data.name,
        country: data.country,
        account_type: data.accountType,
        company_name: data.accountType === 'empresa' ? (data.companyName || '') : '',
        document: data.document,
        phone: data.phone,
        plan_id: data.planId,
      },
    },
  });

  if (error) {
    if (error.message.includes('already registered')) return 'register_email_exists';
    return error.message;
  }

  // Update profile with additional data
  if (authData.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        name: data.name,
        country: data.country,
        account_type: data.accountType,
        company_name: data.accountType === 'empresa' ? data.companyName : null,
        document: data.document,
        phone: data.phone,
        role: 'proprietario',
        plan_id: data.planId || null,
      })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    if (isTrial) {
      // Need to wait slightly for triggers to run and create the company
      setTimeout(async () => {
        const { error: rpcError } = await supabase.rpc('start_free_trial', { p_user_id: authData.user.id, p_days: 7 });
        if (rpcError) {
          console.error('Failed to start free trial:', rpcError);
        }
      }, 2000);
    }
  }

  return null;
}

export interface SetupAccountFlowParams {
  registrationData: RegisterData;
  paymentData: PaymentResponse | null;
  selectedPlanPrice: number;
  selectedPlanCurrency: string;
  selectedPlanName: string;
  isTrial?: boolean;
}

export interface SetupAccountFlowResult {
  error?: string;
  paymentData?: PaymentResponse;
  redirectUrl?: string;
  success?: boolean;
}

/**
 * Orchestrates the full flow: initiates payment if needed,
 * or completes registration if payment is already initialized (e.g. PIX).
 */
export async function setupAccountFlow({
  registrationData,
  paymentData,
  selectedPlanPrice,
  selectedPlanCurrency,
  selectedPlanName,
  isTrial
}: SetupAccountFlowParams): Promise<SetupAccountFlowResult> {
  
  if (!paymentData && !isTrial) {
    // Phase 1: Initiate payment
    const paymentPayload: PaymentInitiation = {
      amount: selectedPlanPrice,
      currency: selectedPlanCurrency,
      description: `Assinatura Plano ${selectedPlanName}`,
      customer: { 
        name: registrationData.name, 
        email: registrationData.email, 
        document: registrationData.document, 
        phone: registrationData.phone 
      }
    };
    
    const res = await initiatePayment(paymentPayload, registrationData.country);

    if (!res.success) {
      return { error: res.error || 'Erro ao processar pagamento.' };
    }

    if (res.paymentUrl) {
      // Return redirect URL for gateways like Pagopar/Bancard
      return { redirectUrl: res.paymentUrl };
    }

    // Return PIX data to be shown to user
    return { paymentData: res };
  }

  // Phase 2: Complete Registration (e.g. after PIX generation or IF isTrial)
  const err = await registerAccount(registrationData, isTrial);
  
  if (err === 'register_email_exists') {
    return { error: 'Este email já está cadastrado.' };
  } else if (err === 'supabase_not_configured') {
    return { error: 'Banco de dados não configurado. Configure o Supabase no painel admin.' };
  } else if (err) {
    return { error: err };
  }

  return { success: true };
}
