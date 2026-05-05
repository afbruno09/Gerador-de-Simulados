const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

async function updateSubscriptionByPreapprovalId(preapprovalId, status) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?mercado_pago_preapproval_id=eq.${encodeURIComponent(preapprovalId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString()
      })
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Erro ao atualizar assinatura no Supabase: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function getPreapproval(preapprovalId) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data
    };
  }

  return {
    ok: true,
    data
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({
      received: true,
      ignored: true,
      reason: 'Method not POST'
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MERCADO_PAGO_ACCESS_TOKEN) {
    return res.status(500).json({
      error: 'Variáveis de ambiente não configuradas'
    });
  }

  try {
    const body = req.body || {};
    const preapprovalId =
      body?.data?.id ||
      body?.id ||
      req.query?.id ||
      null;

    if (!preapprovalId) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason: 'Sem preapproval id'
      });
    }

    const preapprovalResult = await getPreapproval(preapprovalId);

    if (!preapprovalResult.ok) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason: 'Preapproval não encontrada ou id de teste',
        id: preapprovalId,
        mercado_pago_status: preapprovalResult.status
      });
    }

    const preapproval = preapprovalResult.data;

    await updateSubscriptionByPreapprovalId(
      preapproval.id,
      preapproval.status || 'pending'
    );

    return res.status(200).json({
      received: true,
      updated: true,
      id: preapproval.id,
      status: preapproval.status || 'pending'
    });
  } catch (error) {
    console.error('Erro webhook Mercado Pago:', error);

    return res.status(500).json({
      error: 'Erro ao processar webhook',
      details: error.message
    });
  }
}
