import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  try {
    const {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      MERCADO_PAGO_ACCESS_TOKEN,
    } = process.env;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const paymentId =
      req.query?.id ||
      req.query?.["data.id"] ||
      req.body?.data?.id ||
      req.body?.id ||
      null;

    const topic = req.query?.topic || req.body?.type || req.body?.topic;

    if (!paymentId || (topic && topic !== "payment")) {
      return res.status(200).json({
        received: true,
        message: "Webhook recebido sem pagamento processável.",
      });
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro ao consultar pagamento:", mpData);

      return res.status(200).json({
        received: true,
        message: "Pagamento ainda não consultável.",
      });
    }

    const externalReference = mpData.external_reference;
    const status = mpData.status;
    const userId = mpData.metadata?.user_id;

    if (!externalReference) {
      return res.status(200).json({
        received: true,
        message: "Pagamento sem external_reference.",
      });
    }

    if (status !== "approved") {
      await supabaseAdmin
        .from("access_purchases")
        .update({
          status,
          provider_payment_id: String(mpData.id),
          payer_email: mpData.payer?.email || null,
          updated_at: new Date().toISOString(),
        })
        .eq("external_reference", externalReference);

      return res.status(200).json({
        received: true,
        status,
      });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 60);

    const { error } = await supabaseAdmin
      .from("access_purchases")
      .update({
        status: "approved",
        provider_payment_id: String(mpData.id),
        payer_email: mpData.payer?.email || null,
        access_starts_at: now.toISOString(),
        access_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("external_reference", externalReference);

    if (error) {
      console.error("Erro ao liberar acesso:", error);
    }

    return res.status(200).json({
      received: true,
      status: "approved",
      userId,
      accessExpiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Payment webhook error:", error);

    return res.status(200).json({
      received: true,
      error: "Erro interno tratado.",
    });
  }
}