import { createClient } from "@supabase/supabase-js";

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Variáveis de ambiente obrigatórias não configuradas.",
      });
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

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
      console.error("Erro ao consultar pagamento no Mercado Pago:", mpData);

      return res.status(200).json({
        received: true,
        message: "Pagamento ainda não consultável.",
      });
    }

    const externalReference = mpData.external_reference || null;
    const paymentStatus = mpData.status || null;
    const payerEmail = mpData.payer?.email || null;
    const providerPaymentId = String(mpData.id || paymentId);
    const accessDays = Number(mpData.metadata?.access_days || 60);

    if (!externalReference) {
      return res.status(200).json({
        received: true,
        message: "Pagamento sem external_reference.",
      });
    }

    const { data: purchaseRow, error: purchaseLookupError } = await supabaseAdmin
      .from("access_purchases")
      .select("*")
      .eq("external_reference", externalReference)
      .maybeSingle();

    if (purchaseLookupError) {
      console.error("Erro ao buscar access_purchases:", purchaseLookupError);

      return res.status(200).json({
        received: true,
        message: "Erro ao buscar compra local.",
      });
    }

    if (!purchaseRow) {
      console.error("Compra não encontrada para external_reference:", externalReference);

      return res.status(200).json({
        received: true,
        message: "Compra local não encontrada.",
      });
    }

    const purchaseUserId = purchaseRow.user_id || null;
    const metadataUserId = mpData.metadata?.user_id || null;

    const resolvedUserId = purchaseUserId || metadataUserId;

    if (!resolvedUserId) {
      console.error("Não foi possível resolver user_id para a compra:", {
        externalReference,
        purchaseUserId,
        metadataUserId,
      });

      return res.status(200).json({
        received: true,
        message: "Pagamento sem user_id resolvido.",
      });
    }

    if (paymentStatus !== "approved") {
      const { error: pendingUpdateError } = await supabaseAdmin
        .from("access_purchases")
        .update({
          status: paymentStatus,
          provider_payment_id: providerPaymentId,
          payer_email: payerEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("external_reference", externalReference);

      if (pendingUpdateError) {
        console.error("Erro ao atualizar access_purchases com status não aprovado:", pendingUpdateError);
      }

      return res.status(200).json({
        received: true,
        status: paymentStatus,
      });
    }

    const now = new Date();

    let premiumUntil;

    if (
      purchaseRow.access_expires_at &&
      new Date(purchaseRow.access_expires_at).getTime() > now.getTime()
    ) {
      premiumUntil = addDays(new Date(purchaseRow.access_expires_at), accessDays);
    } else {
      premiumUntil = addDays(now, accessDays);
    }

    const { error: purchaseUpdateError } = await supabaseAdmin
      .from("access_purchases")
      .update({
        user_id: resolvedUserId,
        status: "approved",
        provider_payment_id: providerPaymentId,
        payer_email: payerEmail,
        access_starts_at: now.toISOString(),
        access_expires_at: premiumUntil.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("external_reference", externalReference);

    if (purchaseUpdateError) {
      console.error("Erro ao atualizar access_purchases:", purchaseUpdateError);
    }

    const { error: accessUpsertError } = await supabaseAdmin
      .from("user_access")
      .upsert(
        {
          user_id: resolvedUserId,
          plan: "premium",
          premium_until: premiumUntil.toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

    if (accessUpsertError) {
      console.error("Erro ao atualizar user_access:", accessUpsertError);

      return res.status(200).json({
        received: true,
        status: "approved",
        message: "Pagamento aprovado, mas user_access não foi atualizado.",
      });
    }

    return res.status(200).json({
      received: true,
      status: "approved",
      userId: resolvedUserId,
      premiumUntil: premiumUntil.toISOString(),
    });
  } catch (error) {
    console.error("Payment webhook error:", error);

    return res.status(200).json({
      received: true,
      error: "Erro interno tratado.",
    });
  }
}
