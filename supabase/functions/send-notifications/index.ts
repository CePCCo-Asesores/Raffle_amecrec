// ============================================================
// EDGE FUNCTION: send-notifications
// Manejo de emails transaccionales y preferencias de notificación
// Supabase Edge Functions (Deno)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ============================================================
// Envío de email via Resend
// Inserta con status='pending', actualiza por ID para evitar
// actualizar el registro equivocado en condiciones de concurrencia
// ============================================================
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  emailType: string;
  userId?: string;
  raffleId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminClient();
  const resendKey = Deno.env.get("RESEND_API_KEY");

  // Insertar con status 'pending'; actualizar por ID tras conocer el resultado
  const { data: logEntry } = await supabase.from("email_log").insert({
    recipient_email:   params.to,
    recipient_user_id: params.userId || null,
    email_type:        params.emailType,
    subject:           params.subject,
    raffle_id:         params.raffleId || null,
    status:            "pending",
    metadata:          params.metadata || null,
  }).select("id").single();

  if (!resendKey) {
    if (logEntry?.id) {
      await supabase.from("email_log").update({ status: "sent" }).eq("id", logEntry.id);
    }
    console.log(`[EMAIL] To: ${params.to} | Subject: ${params.subject}`);
    return { success: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    Deno.env.get("EMAIL_FROM") || "RifaMax <noreply@rifamax.mx>",
      to:      [params.to],
      subject: params.subject,
      html:    params.html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    if (logEntry?.id) {
      await supabase.from("email_log").update({ status: "failed", error_message: err }).eq("id", logEntry.id);
    }
    return { success: false, error: err };
  }

  if (logEntry?.id) {
    await supabase.from("email_log").update({ status: "sent" }).eq("id", logEntry.id);
  }
  return { success: true };
}

// ============================================================
// Templates de email
// ============================================================
function templateTicketPurchase(data: {
  userName: string;
  raffleName: string;
  ticketNumbers: number[];
  amount: number;
  paymentMethod: string;
}) {
  const tickets = data.ticketNumbers.join(", ");
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">✅ ¡Compra exitosa en RifaMax!</h2>
      <p>Hola <strong>${data.userName}</strong>,</p>
      <p>Tu compra de boletos para <strong>${data.raffleName}</strong> fue registrada correctamente.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Boletos adquiridos:</strong> ${tickets}</p>
        <p><strong>Total:</strong> $${data.amount.toFixed(2)} MXN</p>
        <p><strong>Método de pago:</strong> ${data.paymentMethod === "external" ? "Pago externo (por confirmar)" : "Stripe"}</p>
      </div>
      ${data.paymentMethod === "external" ? `
        <p style="color: #d97706;">⚠️ Tu pago está pendiente de confirmación por el organizador. Recibirás una notificación cuando se confirme.</p>
      ` : ""}
      <p>¡Buena suerte en el sorteo!</p>
      <p style="color: #6b7280; font-size: 12px;">RifaMax — Plataforma de rifas benéficas</p>
    </div>
  `;
}

function templateWinnerDeclared(data: {
  userName: string;
  raffleName: string;
  winningNumber: number;
  resultHash: string;
  isWinner: boolean;
}) {
  if (data.isWinner) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">🎉 ¡FELICIDADES, GANASTE!</h2>
        <p>Hola <strong>${data.userName}</strong>,</p>
        <p>El número ganador de <strong>${data.raffleName}</strong> fue el <strong>#${data.winningNumber}</strong>.</p>
        <p>¡Ese boleto es TUYO! El organizador se comunicará contigo para coordinar la entrega del premio.</p>
        <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Hash de verificación:</strong> <code>${data.resultHash}</code></p>
          <p style="font-size: 12px; color: #6b7280;">Puedes usar este hash para verificar la autenticidad del resultado.</p>
        </div>
        <p style="color: #6b7280; font-size: 12px;">RifaMax — Plataforma de rifas benéficas</p>
      </div>
    `;
  }
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">📢 Resultado del sorteo: ${data.raffleName}</h2>
      <p>Hola <strong>${data.userName}</strong>,</p>
      <p>El sorteo de <strong>${data.raffleName}</strong> ha concluido.</p>
      <p>El número ganador fue el <strong>#${data.winningNumber}</strong>.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Hash de verificación:</strong> <code>${data.resultHash}</code></p>
      </div>
      <p>¡Gracias por participar! Te esperamos en la próxima rifa.</p>
      <p style="color: #6b7280; font-size: 12px;">RifaMax — Plataforma de rifas benéficas</p>
    </div>
  `;
}

function templateRaffleClosed(data: { userName: string; raffleName: string; drawDate: string }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">🔔 Venta cerrada: ${data.raffleName}</h2>
      <p>Hola <strong>${data.userName}</strong>,</p>
      <p>La venta de boletos para <strong>${data.raffleName}</strong> ha cerrado.</p>
      <p>El sorteo está programado para: <strong>${new Date(data.drawDate).toLocaleDateString("es-MX", { dateStyle: "full" })}</strong></p>
      <p>Te notificaremos en cuanto se declare el ganador. ¡Mucha suerte!</p>
      <p style="color: #6b7280; font-size: 12px;">RifaMax — Plataforma de rifas benéficas</p>
    </div>
  `;
}

// ============================================================
// Handlers por acción
// ============================================================
async function handleGetPreferences(userId: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  const defaults = {
    ticket_purchase_email: true,
    raffle_closed_email: true,
    winner_declared_email: true,
    sales_threshold_email: true,
    marketing_email: false,
  };

  return { preferences: data || defaults };
}

async function handleUpdatePreferences(userId: string, preferences: Record<string, boolean>) {
  const supabase = getAdminClient();
  await supabase.from("notification_preferences").upsert({
    user_id: userId,
    ...preferences,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  return { success: true };
}

async function handleGetEmailLog(userId: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("email_log")
    .select("*")
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return { logs: data || [] };
}

async function handleTicketPurchase(requesterId: string, body: {
  user_id: string;
  raffle_id: string;
  ticket_numbers: number[];
  amount: number;
  payment_method: string;
}) {
  // Validate that the requester is sending notifications for themselves
  if (body.user_id && body.user_id !== requesterId) {
    return { error: "No autorizado: user_id no coincide con el token" };
  }

  const supabase = getAdminClient();
  const userId = body.user_id || requesterId;

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("ticket_purchase_email")
    .eq("user_id", userId)
    .single();

  if (prefs && prefs.ticket_purchase_email === false) {
    return { success: true, skipped: true };
  }

  const [{ data: user }, { data: raffle }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).single(),
    supabase.from("raffles").select("name").eq("id", body.raffle_id).single(),
  ]);

  if (!user || !raffle) return { success: false, error: "Usuario o rifa no encontrados" };

  await sendEmail({
    to:        user.email,
    subject:   `✅ Boletos adquiridos: ${raffle.name}`,
    html:      templateTicketPurchase({
      userName:      user.full_name,
      raffleName:    raffle.name,
      ticketNumbers: body.ticket_numbers,
      amount:        body.amount,
      paymentMethod: body.payment_method,
    }),
    emailType: "ticket_purchase",
    userId,
    raffleId:  body.raffle_id,
  });

  await supabase.from("notifications").insert({
    user_id:           userId,
    title:             "Compra exitosa",
    message:           `Adquiriste ${body.ticket_numbers.length} boleto(s) para ${raffle.name}.`,
    type:              "success",
    related_raffle_id: body.raffle_id,
  });

  return { success: true };
}

async function handleRaffleClosed(requesterId: string, body: { raffle_id: string }) {
  const supabase = getAdminClient();

  // Verify the requester is the organizer of this raffle
  const { data: raffle } = await supabase
    .from("raffles")
    .select("name, draw_date, organizer_id")
    .eq("id", body.raffle_id)
    .single();

  if (!raffle) return { success: false, error: "Rifa no encontrada" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", requesterId).single();
  if (profile?.role !== "admin" && raffle.organizer_id !== requesterId) {
    return { error: "No autorizado para enviar notificaciones de esta rifa" };
  }

  const { data: participants } = await supabase
    .from("tickets")
    .select("participant_id, profiles!participant_id(full_name, email)")
    .eq("raffle_id", body.raffle_id)
    .in("status", ["sold", "paid"])
    .not("participant_id", "is", null);

  const uniqueParticipants = new Map();
  for (const t of (participants || [])) {
    if (t.participant_id && !uniqueParticipants.has(t.participant_id)) {
      uniqueParticipants.set(t.participant_id, t.profiles);
    }
  }

  for (const [userId, profile] of uniqueParticipants) {
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("raffle_closed_email")
      .eq("user_id", userId)
      .single();

    if (!prefs || prefs.raffle_closed_email !== false) {
      await sendEmail({
        to:        profile.email,
        subject:   `🔔 Venta cerrada: ${raffle.name}`,
        html:      templateRaffleClosed({ userName: profile.full_name, raffleName: raffle.name, drawDate: raffle.draw_date }),
        emailType: "raffle_closed",
        userId,
        raffleId:  body.raffle_id,
      });
    }

    await supabase.from("notifications").insert({
      user_id: userId,
      title:   "Rifa cerrada",
      message: `La venta de boletos para ${raffle.name} ha cerrado. ¡Pronto conocerás el resultado!`,
      type:    "info",
      related_raffle_id: body.raffle_id,
    });
  }

  return { success: true };
}

async function handleWinnerDeclared(requesterId: string, body: {
  raffle_id: string;
  winning_number: number;
  result_hash?: string;
}) {
  const supabase = getAdminClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("name, organizer_id")
    .eq("id", body.raffle_id)
    .single();

  if (!raffle) return { success: false, error: "Rifa no encontrada" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", requesterId).single();
  if (profile?.role !== "admin" && raffle.organizer_id !== requesterId) {
    return { error: "No autorizado para enviar notificaciones de esta rifa" };
  }

  const { data: participants } = await supabase
    .from("tickets")
    .select("participant_id, ticket_number, profiles!participant_id(full_name, email)")
    .eq("raffle_id", body.raffle_id)
    .in("status", ["sold", "paid"])
    .not("participant_id", "is", null);

  const uniqueParticipants = new Map<string, { full_name: string; email: string; tickets: number[] }>();
  for (const t of (participants || [])) {
    if (!t.participant_id) continue;
    if (!uniqueParticipants.has(t.participant_id)) {
      uniqueParticipants.set(t.participant_id, { ...(t.profiles as any), tickets: [] });
    }
    uniqueParticipants.get(t.participant_id)!.tickets.push(t.ticket_number);
  }

  for (const [userId, data] of uniqueParticipants) {
    const isWinner = data.tickets.includes(body.winning_number);

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("winner_declared_email")
      .eq("user_id", userId)
      .single();

    if (!prefs || prefs.winner_declared_email !== false) {
      await sendEmail({
        to:      data.email,
        subject: isWinner ? `🎉 ¡GANASTE en ${raffle.name}!` : `📢 Resultado: ${raffle.name}`,
        html:    templateWinnerDeclared({
          userName:      data.full_name,
          raffleName:    raffle.name,
          winningNumber: body.winning_number,
          resultHash:    body.result_hash || "",
          isWinner,
        }),
        emailType: "winner_declared",
        userId,
        raffleId:  body.raffle_id,
      });
    }

    await supabase.from("notifications").insert({
      user_id: userId,
      title:   isWinner ? "🎉 ¡Ganaste!" : "Resultado del sorteo",
      message: isWinner
        ? `¡El número ganador de ${raffle.name} es el #${body.winning_number} — ese boleto es tuyo!`
        : `El número ganador de ${raffle.name} fue el #${body.winning_number}.`,
      type:    isWinner ? "success" : "info",
      related_raffle_id: body.raffle_id,
    });
  }

  return { success: true };
}

async function handleExternalPaymentRequest(requesterId: string, body: {
  raffle_id: string;
  ticket_numbers: number[];
}) {
  const supabase = getAdminClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("name, organizer_id")
    .eq("id", body.raffle_id)
    .single();

  if (!raffle) return { success: false, error: "Rifa no encontrada" };

  const { data: participant } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", requesterId)
    .single();

  const ticketList = body.ticket_numbers.map((n) => `#${n}`).join(", ");

  await supabase.from("notifications").insert({
    user_id:           raffle.organizer_id,
    title:             "Solicitud de confirmación de pago externo",
    message:           `${participant?.full_name || "Un participante"} solicita confirmar el pago de ${body.ticket_numbers.length} boleto(s) para "${raffle.name}": ${ticketList}.`,
    type:              "info",
    related_raffle_id: body.raffle_id,
  });

  return { success: true };
}

// ============================================================
// Handler principal
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader || "" } } },
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id;

    const body = await req.json();
    const { action } = body;

    let result;
    switch (action) {
      case "get-preferences":
        if (!userId) throw new Error("No autenticado");
        result = await handleGetPreferences(userId);
        break;
      case "update-preferences":
        if (!userId) throw new Error("No autenticado");
        result = await handleUpdatePreferences(userId, body.preferences);
        break;
      case "get-email-log":
        if (!userId) throw new Error("No autenticado");
        result = await handleGetEmailLog(userId);
        break;
      case "ticket-purchase":
        if (!userId) throw new Error("No autenticado");
        result = await handleTicketPurchase(userId, body);
        break;
      case "raffle-closed":
        if (!userId) throw new Error("No autenticado");
        result = await handleRaffleClosed(userId, body);
        break;
      case "winner-declared":
        if (!userId) throw new Error("No autenticado");
        result = await handleWinnerDeclared(userId, body);
        break;
      case "external-payment-request":
        if (!userId) throw new Error("No autenticado");
        result = await handleExternalPaymentRequest(userId, body);
        break;
      default:
        result = { error: "Acción no reconocida: " + action };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("send-notifications error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
