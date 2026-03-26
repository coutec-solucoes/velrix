// @ts-nocheck
// Supabase Edge Function: mp-subscribe
// Handles Mercado Pago card payment processing
// Deploy: supabase functions deploy mp-subscribe --no-verify-jwt --project-ref iapvzhetbytxafseyffx

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, paymentId, companyId, tokenId, planName, price, currency, paymentMethodId, payerEmail, isAnnual } = body;

    // ── PIX Verification Logic (New) ─────────────────────────────────────────
    if (action === 'check' || paymentId) {
      if (!paymentId) {
        return new Response(JSON.stringify({ error: 'ID de pagamento ausente' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      const { data: settingsData } = await supabase.from('admin_settings').select('value').eq('key', 'mpSecretKey').single();
      const mpAccessToken = settingsData?.value || Deno.env.get('MP_ACCESS_TOKEN');

      if (!mpAccessToken) {
        return new Response(JSON.stringify({ error: 'MP Access Token não configurado' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${mpAccessToken}` },
      });

      if (!mpResponse.ok) {
        return new Response(JSON.stringify({ error: 'Erro ao consultar Mercado Pago' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const mpPayment = await mpResponse.json();
      
      if (mpPayment.status === 'approved') {
        const finalCompanyId = companyId || mpPayment.metadata?.company_id;
        if (finalCompanyId) {
          // Calculate cumulative expiry
          const { data: companyData } = await supabase.from('saas_companies').select('plan_expiry').eq('id', finalCompanyId).single();
          const now = new Date();
          let currentExpiry = companyData?.plan_expiry ? new Date(companyData.plan_expiry) : now;
          if (currentExpiry < now) currentExpiry = now;
          const days = (mpPayment.metadata?.is_annual === true || mpPayment.metadata?.is_annual === 'true') ? 365 : 30;
          const expiry = new Date(currentExpiry);
          expiry.setDate(expiry.getDate() + days);

          await supabase.from('saas_companies').update({ status: 'ativo', plan_expiry: expiry.toISOString() }).eq('id', finalCompanyId);
          console.log(`[mp-subscribe] PIX check: Company ${finalCompanyId} updated. New expiry: ${expiry.toISOString()}`);
          
          // Record Payment
          const { data: existing } = await supabase.from('saas_payments').select('id').eq('description', `MP-PAYMENT-${paymentId}`).maybeSingle();
          if (!existing) {
            await supabase.from('saas_payments').insert({
              company_id: finalCompanyId,
              amount: mpPayment.transaction_amount,
              currency: mpPayment.currency_id || 'BRL',
              status: 'pago',
              description: `MP-PAYMENT-${paymentId}`,
              date: new Date().toISOString(),
            });
          }
        }
        return new Response(JSON.stringify({ paid: true, status: 'approved' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ paid: false, status: mpPayment.status }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Original Card Subscription Logic ────────────────────────────────────
    if (!companyId || !tokenId || !price) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes: companyId, tokenId, price' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Pre-initialize Supabase ─────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── Get MP Access Token from Database (Admin Settings) ───────────────────
    // This allows managing the secret via the Admin UI
    const { data: settingsData, error: settingsError } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'mpSecretKey')
      .single();

    let mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN'); // Fallback to env var
    
    if (settingsData?.value) {
      mpAccessToken = settingsData.value;
    }

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'Mercado Pago Secret Key (Access Token) não configurado no Admin -> APIs.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 1. Create payment at Mercado Pago ─────────────────────────────────────
    const mpPayload = {
      transaction_amount: Number(price),
      token: tokenId,
      description: `Assinatura ${planName || 'Veltor Finance'}`,
      installments: 1,
      payment_method_id: paymentMethodId || 'visa', // e.g., 'visa', 'master', 'elo', 'amex'
      payer: {
        email: payerEmail || 'pagador@email.com',
      },
      metadata: {
        company_id: companyId,
        plan_name: planName,
        is_annual: isAnnual,
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken}`,
        'X-Idempotency-Key': `${companyId}-${Date.now()}`,
      },
      body: JSON.stringify(mpPayload),
    });

    const mpResult = await mpResponse.json();

    if (!mpResponse.ok || mpResult.status === 'rejected') {
      const reason = mpResult?.status_detail || mpResult?.message || 'Pagamento rejeitado pelo Mercado Pago';
      return new Response(
        JSON.stringify({ error: reason, mp_status: mpResult?.status, mp_detail: mpResult?.status_detail }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Update company status in Supabase ──────────────────────────────────
    // (supabase client is already initialized at the top)

    // Fetch current company data to get existing plan_expiry
    const { data: companyData } = await supabase
      .from('saas_companies')
      .select('plan_expiry')
      .eq('id', companyId)
      .single();

    // Set plan expiry: 365 days for annual plans, 30 days for monthly
    const now = new Date();
    let currentExpiry = companyData?.plan_expiry ? new Date(companyData.plan_expiry) : now;
    
    // If current expiry is in the past, start from now
    if (currentExpiry < now) {
      currentExpiry = now;
    }

    const expiry = new Date(currentExpiry);
    expiry.setDate(expiry.getDate() + (isAnnual ? 365 : 30));

    const { error: updateError } = await supabase
      .from('saas_companies')
      .update({
        status: 'ativo',
        plan_expiry: expiry.toISOString(),
      })
      .eq('id', companyId);

    console.log(`[mp-subscribe] Company ${companyId} updated. New expiry: ${expiry.toISOString()}`);

    if (updateError) {
      console.error('Failed to update company status:', updateError);
      // Payment succeeded but DB update failed — log and continue
    }

    // ── 3. Record payment ──────────────────────────────────────────────────────
    await supabase.from('saas_payments').insert({
      company_id: companyId,
      amount: price,
      currency: currency || 'BRL',
      status: 'pago',
      description: `MP-PAYMENT-${mpResult.id}`,
      date: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: mpResult.id,
        status: mpResult.status,
        expires_at: expiry.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('mp-subscribe error:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno: ' + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
