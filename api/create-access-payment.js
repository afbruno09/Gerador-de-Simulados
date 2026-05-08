import { createClient } from "@supabase/supabase-js";

function sanitizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      MERCADO_PAGO_ACCESS_TOKEN,
      PUBLIC_SITE_URL,
    } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Variáveis de ambiente obrigatórias não configuradas.",
      });
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const { userId, loginEmail } = req.body || {};
    const safeLoginEmail = sanitizeEmail(loginEmail);

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "Usuário não identificado.",
      });
    }

    const siteUrl =
      PUBLIC_SITE_URL || "https://gerador-de-simulados-two.vercel.app";

    const externalReference = `premium60__${userId}__${Date.now()}`;

    console.log("Creating Mercado Pago preference", {
      userId,
      loginEmail: safeLoginEmail,
      externalReference,
    });

    const preferencePayload = {
      external_reference: externalReference,
      items: [
        {
          id: "premium_60_days",
          title: "Acesso Premium 60 dias - Gerador de Simulados",
          description: "Compre 30 dias e ganhe mais 30 dias grátis.",
          quantity: 1,
          currency_id: "BRL",
          unit_price: 29.9,
        },
      ],
      payer: {
        email: safeLoginEmail || undefined,
      },
      payment_methods: {
        installments: 1,
      },
      back_urls: {
        success: `${siteUrl}/?payment=success`,
        failure: `${siteUrl}/?payment=failure`,
        pending: `${siteUrl}/?payment=pending`,
      },
      auto_return: "approved",
      notification_url: `${siteUrl}/api/mercadopago-payment-webhook`,
      metadata: {
        user_id: userId,
        login_email: safeLoginEmail,
        access_days: 60,
        product: "premium_60_days",
        external_reference: externalReference,
      },
    };

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferencePayload),
      }
    );

    const mpText = await mpResponse.text();

    let mpData;
    try {
      mpData = JSON.parse(mpText);
    } catch {
      console.error("Mercado Pago returned invalid JSON:", mpText);

      return res.status(500).json({
        error: "Mercado Pago retornou uma resposta inválida.",
      });
    }

    if (!mpResponse.ok) {
      console.error("Erro ao criar preference no Mercado Pago:", mpData);

      return res.status(500).json({
        error: "Não foi possível criar o pagamento.",
        details: mpData,
      });
    }

    const purchasePayload = {
      user_id: userId,
      provider: "mercado_pago",
      provider_preference_id: mpData.id,
      login_email: safeLoginEmail,
      status: "pending",
      amount: 29.9,
      currency: "BRL",
      access_days: 60,
      external_reference: externalReference,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabaseAdmin
      .from("access_purchases")
      .insert(purchasePayload);

    if (dbError) {
      console.error("Erro ao salvar access_purchases:", dbError);

      return res.status(500).json({
        error: "Pagamento criado, mas não foi possível salvar no sistema.",
        details: dbError.message,
      });
    }

    console.log("Mercado Pago preference created successfully", {
      userId,
      preferenceId: mpData.id,
      externalReference,
    });

    return res.status(200).json({
      success: true,
      preferenceId: mpData.id,
      externalReference,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
    });
  } catch (error) {
    console.error("Create access payment error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Erro inesperado ao iniciar pagamento. Tente novamente.",
    });
  }
}
