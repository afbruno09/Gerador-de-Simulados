export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    return res.status(500).json({ error: "MERCADO_PAGO_ACCESS_TOKEN não configurado" });
  }

  try {
    const {
      email,
      firstName = "Aluno",
      lastName = "Residência"
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "E-mail é obrigatório" });
    }

    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const payload = {
      reason: "Premium Mensal",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 29.9,
        currency_id: "BRL"
      },
      payer_email: email,
      back_url: `${baseUrl}/?subscription=success`,
      status: "pending"
    };

    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro ao criar assinatura",
        details: data
      });
    }

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point || null,
      sandbox_init_point: data.sandbox_init_point || null,
      status: data.status || null
    });
  } catch (error) {
    console.error("Erro create-subscription:", error);
    return res.status(500).json({
      error: "Erro interno ao criar assinatura"
    });
  }
}