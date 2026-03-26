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
    return new Response(null, { 
      status: 204, 
      headers: corsHeaders 
    });
  }

  try {
    const payload = await req.json();
    console.log('Webhook received:', payload);

    // Only process payment notifications
    if (payload.type !== 'payment') {
      return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const paymentId = payload.data?.id;
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
      return new Response('Config error', { status: 500 });
    }

    // 1. Fetch payment details from Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
      },
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('Failed to fetch payment status from MP:', errorText);
      return new Response('MP fetch error', { status: 502 });
    }

    const mpPayment = await mpResponse.json();
    console.log('Payment status:', mpPayment.status);

    // 2. If payment is approved, update company and record payment
    if (mpPayment.status === 'approved') {
      const companyId = mpPayment.metadata?.company_id;
      const planName = mpPayment.metadata?.plan_name || 'Assinatura';
      
      if (!companyId) {
        console.warn('Payment approved but no company_id in metadata');
        return new Response('No company_id', { status: 200 }); // Still return 200 to MP
      }

      // Check if this payment was already processed to avoid duplicates
      const { data: existingPayment } = await supabase
        .from('saas_payments')
        .select('id')
        .eq('description', `MP-PAYMENT-${paymentId}`)
        .single();

      if (existingPayment) {
        return new Response('Already processed', { status: 200 });
      }

      // Calculate expiry (cumulative)
      const { data: companyData } = await supabase
        .from('saas_companies')
        .select('plan_expiry')
        .eq('id', companyId)
        .single();

      const now = new Date();
      let currentExpiry = companyData?.plan_expiry ? new Date(companyData.plan_expiry) : now;
      if (currentExpiry < now) currentExpiry = now;

      // MP PIX usually 30 days, but we can check if it was annual via metadata if we send it
      const isAnnual = mpPayment.metadata?.is_annual === true || mpPayment.metadata?.is_annual === 'true';
      const daysToAdd = isAnnual ? 365 : 30;

      const expiry = new Date(currentExpiry);
      expiry.setDate(expiry.getDate() + daysToAdd);

      // Update Company
      const { error: updateError } = await supabase
        .from('saas_companies')
        .update({
          status: 'ativo',
          plan_expiry: expiry.toISOString(),
        })
        .eq('id', companyId);

      if (updateError) {
        console.error('Error updating company status:', updateError);
        return new Response('DB Update Error', { status: 500 });
      }

      // Record Payment
      await supabase.from('saas_payments').insert({
        company_id: companyId,
        amount: mpPayment.transaction_amount,
        currency: mpPayment.currency_id || 'BRL',
        status: 'pago',
        description: `MP-PAYMENT-${paymentId}`,
        date: new Date().toISOString(),
      });
      
      console.log(`Company ${companyId} activated via webhook.`);
    }

    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
