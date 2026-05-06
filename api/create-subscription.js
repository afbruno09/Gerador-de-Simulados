import { createClient } from "@supabase/supabase-js";

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

    if (!SUPABASE_URL) {
      return res.status(500).json({
        error: "SUPABASE_URL não configurada na Vercel.",
      });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "SUPABASE_SERVICE_ROLE_KEY não configurada na Vercel.",
      });
    }

    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "MERCADO_PAGO_ACCESS_TOKEN não configurada na Vercel.",
      });
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const { userId, loginEmail, payerEmail, plan } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        error: "Usuário não identificado.",
      });
    }

    if (!payerEmail) {
      return res.status(400).json({
        error: "Informe o e-mail que será usado no pagamento.",
      });
    }

    const selectedPlan = plan || "monthly";
    const siteUrl =
      PUBLIC_SITE_URL || "https://gerador-de-simulados-two.vercel.app";

    const mercadoPagoPayload = {
      reason: "Assinatura Gerador de Simulados",
      external_reference: userId,
      payer_email: payerEmail,
      back_url: `${siteUrl}/?payment=processing`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 29.9,
        currency_id: "BRL",
      },
    };

    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mercadoPagoPayload),
    });

    const mpText = await mpResponse.text();

    let mpData;
    try {
      mpData = JSON.parse(mpText);
    } catch {
      return res.status(500).json({
        error: "Mercado Pago retornou uma resposta inválida.",
        raw: mpText,
      });
    }

    if (!mpResponse.ok) {
      console.error("Mercado Pago error:", mpData);

      return res.status(500).json({
        error:
          "Não foi possível iniciar a assinatura. Tente novamente em alguns instantes.",
        details: mpData,
      });
    }

    const subscriptionPayload = {
      user_id: userId,
      provider: "mercado_pago",
      provider_subscription_id: mpData.id,
      provider_payer_email: payerEmail,
      login_email: loginEmail || null,
      plan: selectedPlan,
      status: mpData.status || "pending",
      init_point: mpData.init_point || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existingSubscription, error: findError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,status")
      .eq("user_id", userId)
      .in("status", ["pending", "authorized", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error("Supabase subscription find error:", findError);

      return res.status(500).json({
        error: "Não foi possível verificar sua assinatura atual.",
        details: findError.message,
      });
    }

    let dbError = null;

    if (existingSubscription) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update(subscriptionPayload)
        .eq("id", existingSubscription.id);

      dbError = error;
    } else {
      const { error } = await supabaseAdmin.from("subscriptions").insert({
        ...subscriptionPayload,
        created_at: new Date().toISOString(),
      });

      dbError = error;
    }

    if (dbError) {
      console.error("Supabase subscription save error:", dbError);

      return res.status(500).json({
        error:
          "A assinatura foi criada, mas não conseguimos salvar o vínculo no sistema.",
        details: dbError.message,
      });
    }

    return res.status(200).json({
      success: true,
      subscriptionId: mpData.id,
      initPoint: mpData.init_point,
      status: mpData.status,
    });
  } catch (error) {
    console.error("Create subscription error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Erro inesperado ao iniciar assinatura. Tente novamente em alguns instantes.",
    });
  }
}
