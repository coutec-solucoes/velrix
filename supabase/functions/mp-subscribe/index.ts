// Supabase Edge Function: mp-subscribe
// Handles Mercado Pago card payment processing
// Deploy: supabase functions deploy mp-subscribe

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
    const { companyId, tokenId, planName, price, currency } = await req.json();

    if (!companyId || !tokenId || !price) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios ausentes: companyId, tokenId, price' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get MP Access Token from environment variable (set in Supabase Dashboard)
    // Dashboard → Edge Functions → mp-subscribe → Secrets → MP_ACCESS_TOKEN
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN não configurado nas variáveis de ambiente da Edge Function.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 1. Create payment at Mercado Pago ─────────────────────────────────────
    const mpPayload = {
      transaction_amount: Number(price),
      token: tokenId,
      description: `Assinatura ${planName || 'Veltor Finance'}`,
      installments: 1,
      payment_method_id: 'credit_card',
      // If you want to create a subscription instead of a single charge, use preapproval API
      // For monthly recurring billing, this needs to be called every month or use MP subscriptions
      metadata: {
        company_id: companyId,
        plan_name: planName,
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Set plan expiry to 30 days from now
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    const { error: updateError } = await supabase
      .from('saas_companies')
      .update({
        status: 'ativo',
        plan_expiry: expiry.toISOString(),
      })
      .eq('id', companyId);

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
      description: `Assinatura ${planName} — Cartão MP (${mpResult.id})`,
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
