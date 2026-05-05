const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

async function insertSubscription({
  userId,
  preapprovalId,
  planName,
  status,
  payerEmail
}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      user_id: userId,
      mercado_pago_preapproval_id: preapprovalId,
      plan_name: planName,
      status,
      payer_email: payerEmail
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Erro ao salvar assinatura no Supabase: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    return res.status(500).json({
      error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado'
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Variáveis do Supabase não configuradas'
    });
  }

  try {
    const {
      email,
      userId,
      firstName = 'Aluno',
      lastName = 'Residência'
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const payload = {
      reason: 'Premium Mensal',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 29.9,
        currency_id: 'BRL'
      },
      payer_email: email,
      back_url: `${baseUrl}/?subscription=success`,
      external_reference: userId,
      status: 'pending'
    };

    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      return res.status(mpResponse.status).json({
        error: 'Erro ao criar assinatura no Mercado Pago',
        details: mpData
      });
    }

    await insertSubscription({
      userId,
      preapprovalId: mpData.id,
      planName: 'Premium Mensal',
      status: mpData.status || 'pending',
      payerEmail: email
    });

    return res.status(200).json({
      id: mpData.id,
      init_point: mpData.init_point || null,
      sandbox_init_point: mpData.sandbox_init_point || null,
      status: mpData.status || null
    });
  } catch (error) {
    console.error('Erro create-subscription:', error);

    return res.status(500).json({
      error: 'Erro interno ao criar assinatura',
      details: error.message
    });
  }
}
