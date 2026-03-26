// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { paymentId, companyId } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'No payment ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get MP Access Token from Database (Admin Settings)
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'mpSecretKey')
      .single();

    const mpAccessToken = settingsData?.value || Deno.env.get('MP_ACCESS_TOKEN');

    if (!mpAccessToken) {
      console.error('MP_ACCESS_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'MP not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }  });
    }

    // 1. Fetch payment details directly from Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
      },
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('Failed to fetch from MP:', errorText);
      return new Response(JSON.stringify({ error: 'MP error', details: errorText }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }  });
    }

    const mpPayment = await mpResponse.json();
    
    // 2. If payment is approved, update company and record payment
    if (mpPayment.status === 'approved') {
      const finalCompanyId = companyId || mpPayment.metadata?.company_id;
      
      if (!finalCompanyId) {
        return new Response(JSON.stringify({ paid: true, status: 'approved', warning: 'No company_id found' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Calculate cumulative expiry
      const { data: companyData } = await supabase
        .from('saas_companies')
        .select('plan_expiry')
        .eq('id', finalCompanyId)
        .single();

      const now = new Date();
      let currentExpiry = companyData?.plan_expiry ? new Date(companyData.plan_expiry) : now;
      if (currentExpiry < now) currentExpiry = now;

      const DAYS_TO_ADD = (mpPayment.metadata?.is_annual === true || mpPayment.metadata?.is_annual === 'true') ? 365 : 30;
      
      const expiry = new Date(currentExpiry);
      expiry.setDate(expiry.getDate() + DAYS_TO_ADD);

      // Update Company
      await supabase
        .from('saas_companies')
        .update({
          status: 'ativo',
          plan_expiry: expiry.toISOString(),
        })
        .eq('id', finalCompanyId);

      // Record Payment (if not already recorded)
      const { data: existingPayment } = await supabase
        .from('saas_payments')
        .select('id')
        .eq('description', `MP-CHECK-${paymentId}`)
        .or(`description.eq.MP-WEBHOOK-${paymentId}`)
        .maybeSingle();

      if (!existingPayment) {
        await supabase.from('saas_payments').insert({
          company_id: finalCompanyId,
          amount: mpPayment.transaction_amount,
          currency: mpPayment.currency_id || 'BRL',
          status: 'pago',
          description: `Confirmação manual PIX Mercado Pago (${paymentId})`,
          date: new Date().toISOString(),
        });
      }
      
      return new Response(JSON.stringify({ paid: true, status: 'approved' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ paid: false, status: mpPayment.status }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Check error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
