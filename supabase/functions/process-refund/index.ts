// ============================================================
// EDGE FUNCTION: process-refund
// Gestión de solicitudes de reembolso (pago externo)
// Supabase Edge Functions (Deno)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ============================================================
// REQUEST REFUND — Participante solicita reembolso
// ============================================================
async function handleRequestRefund(userId: string, body: {
  ticket_id: string;
  reason: string;
}) {
  const supabase = getAdminClient();

  // Obtener datos del boleto
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select(`
      id, ticket_number, raffle_id, participant_id, status,
      payment_method, commission_amount,
      raffles!raffle_id(id, name, status, organizer_id, price_per_ticket, payment_method)
    `)
    .eq("id", body.ticket_id)
    .single();

  if (ticketErr || !ticket) {
    return { error: "Boleto no encontrado" };
  }

  // Validar que el boleto pertenece al usuario
  if (ticket.participant_id !== userId) {
    return { error: "No tienes permiso para solicitar reembolso de este boleto" };
  }

  const raffle = ticket.raffles as any;

  // Solo se pueden pedir reembolsos de rifas no terminadas
  if (["winner_declared", "cancelled"].includes(raffle.status)) {
    if (raffle.status === "cancelled") {
      // Rifas canceladas: reembolso automático permitido
    } else {
      return { error: "No se puede solicitar reembolso de una rifa con ganador declarado" };
    }
  }

  if (!["sold", "paid"].includes(ticket.status)) {
    return { error: "Solo se pueden reembolsar boletos comprados o pagados" };
  }

  // Verificar que no exista ya una solicitud activa
  const { data: existing } = await supabase
    .from("refund_requests")
    .select("id, status")
    .eq("ticket_id", body.ticket_id)
    .not("status", "in", '("denied","failed")')
    .single();

  if (existing) {
    return { error: "Ya existe una solicitud de reembolso activa para este boleto" };
  }

  // Calcular monto del reembolso
  const amount = raffle.price_per_ticket;

  // Crear solicitud
  const { data: refundRequest, error: insertErr } = await supabase
    .from("refund_requests")
    .insert({
      ticket_id:      body.ticket_id,
      raffle_id:      raffle.id,
      participant_id: userId,
      organizer_id:   raffle.organizer_id,
      ticket_number:  ticket.ticket_number,
      amount,
      currency:       "MXN",
      reason:         body.reason,
      status:         "pending",
      stripe_payment_id: ticket.payment_method === "stripe" ? ticket.stripe_payment_id : null,
    })
    .select()
    .single();

  if (insertErr) {
    return { error: insertErr.message };
  }

  // Notificar al organizador
  await supabase.from("notifications").insert({
    user_id: raffle.organizer_id,
    title:   "Nueva solicitud de reembolso",
    message: `El participante solicitó reembolso del boleto #${ticket.ticket_number} de "${raffle.name}".`,
    type:    "warning",
    related_raffle_id: raffle.id,
  });

  // Audit log
  await supabase.from("audit_log").insert({
    user_id:     userId,
    action:      "refund_requested",
    entity_type: "refund_request",
    entity_id:   refundRequest.id,
    new_value:   { ticket_number: ticket.ticket_number, amount, reason: body.reason },
  });

  return { success: true, refund_request: refundRequest };
}

// ============================================================
// LIST REFUND REQUESTS
// ============================================================
async function handleListRefundRequests(userId: string, body: {
  raffle_id?: string;
  status?: string;
  role?: string;
}) {
  const supabase = getAdminClient();

  // Obtener rol del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role;

  let query = supabase
    .from("refund_requests")
    .select(`
      *,
      profiles!participant_id(full_name, email),
      raffles!raffle_id(name, status, payment_method)
    `)
    .order("created_at", { ascending: false });

  if (role === "participant") {
    query = query.eq("participant_id", userId);
  } else if (role === "organizer") {
    query = query.eq("organizer_id", userId);
  }
  // admin ve todo

  if (body.raffle_id) query = query.eq("raffle_id", body.raffle_id);
  if (body.status)    query = query.eq("status", body.status);

  const { data: requests, error } = await query.limit(100);

  if (error) return { requests: [], error: error.message };

  // Enriquecer datos
  const enriched = (requests || []).map((r: any) => ({
    ...r,
    participant_name:     r.profiles?.full_name,
    participant_email:    r.profiles?.email,
    raffle_name:          r.raffles?.name,
    raffle_status:        r.raffles?.status,
    raffle_payment_method: r.raffles?.payment_method,
  }));

  return { requests: enriched };
}

// ============================================================
// APPROVE REFUND — Organizador aprueba
// ============================================================
async function handleApproveRefund(userId: string, body: {
  refund_request_id: string;
  organizer_notes?: string;
}) {
  const supabase = getAdminClient();

  const { data: refund, error } = await supabase
    .from("refund_requests")
    .select("*, raffles!raffle_id(organizer_id, payment_method, name)")
    .eq("id", body.refund_request_id)
    .single();

  if (error || !refund) return { error: "Solicitud no encontrada" };

  const raffle = refund.raffles as any;

  // Solo el organizador o admin puede aprobar
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "admin" && raffle.organizer_id !== userId) {
    return { error: "Sin permiso para aprobar esta solicitud" };
  }

  if (refund.status !== "pending") {
    return { error: `No se puede aprobar una solicitud en estado "${refund.status}"` };
  }

  // Para pagos externos: marcar como reembolsado directamente (el organizador hace el reembolso manual)
  const newStatus = raffle.payment_method === "external" ? "refunded" : "approved";

  await supabase.from("refund_requests").update({
    status:          newStatus,
    organizer_notes: body.organizer_notes,
    reviewed_by:     userId,
    reviewed_at:     new Date().toISOString(),
    refunded_at:     newStatus === "refunded" ? new Date().toISOString() : null,
    updated_at:      new Date().toISOString(),
  }).eq("id", body.refund_request_id);

  // Devolver el boleto al estado disponible
  await supabase.from("tickets").update({
    status:         "available",
    participant_id: null,
    purchased_at:   null,
    payment_method: null,
  }).eq("id", refund.ticket_id);

  // Actualizar contadores de la rifa
  await supabase.from("raffles").update({
    tickets_sold: supabase.rpc("greatest", { a: 0, b: -1 }), // decrement safely
    revenue:      supabase.rpc("greatest", { a: 0, b: -refund.amount }),
    updated_at:   new Date().toISOString(),
  }).eq("id", refund.raffle_id);

  // Notificar al participante
  await supabase.from("notifications").insert({
    user_id: refund.participant_id,
    title:   newStatus === "refunded" ? "Reembolso aprobado" : "Solicitud aprobada",
    message: `Tu solicitud de reembolso para el boleto #${refund.ticket_number} de "${raffle.name}" fue aprobada.${
      newStatus === "refunded" ? " El organizador procederá a devolverte el dinero." : ""
    }`,
    type: "success",
    related_raffle_id: refund.raffle_id,
  });

  // Ledger de reembolso
  await supabase.from("financial_ledger").insert({
    entry_type:   "refund",
    amount:       refund.amount,
    currency:     "MXN",
    description:  `Reembolso boleto #${refund.ticket_number} - ${raffle.name}`,
    raffle_id:    refund.raffle_id,
    ticket_id:    refund.ticket_id,
    payer_id:     raffle.organizer_id,
    receiver_id:  refund.participant_id,
  });

  await supabase.from("audit_log").insert({
    user_id:     userId,
    action:      "refund_approved",
    entity_type: "refund_request",
    entity_id:   body.refund_request_id,
    new_value:   { status: newStatus, organizer_notes: body.organizer_notes },
  });

  return { success: true, new_status: newStatus };
}

// ============================================================
// DENY REFUND — Organizador rechaza
// ============================================================
async function handleDenyRefund(userId: string, body: {
  refund_request_id: string;
  organizer_notes: string;
}) {
  const supabase = getAdminClient();

  const { data: refund, error } = await supabase
    .from("refund_requests")
    .select("*, raffles!raffle_id(organizer_id, name)")
    .eq("id", body.refund_request_id)
    .single();

  if (error || !refund) return { error: "Solicitud no encontrada" };

  const raffle = refund.raffles as any;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "admin" && raffle.organizer_id !== userId) {
    return { error: "Sin permiso" };
  }

  if (refund.status !== "pending") {
    return { error: "Solo se pueden rechazar solicitudes pendientes" };
  }

  await supabase.from("refund_requests").update({
    status:          "denied",
    organizer_notes: body.organizer_notes,
    reviewed_by:     userId,
    reviewed_at:     new Date().toISOString(),
    updated_at:      new Date().toISOString(),
  }).eq("id", body.refund_request_id);

  // Notificar al participante
  await supabase.from("notifications").insert({
    user_id: refund.participant_id,
    title:   "Solicitud de reembolso rechazada",
    message: `Tu solicitud de reembolso para "${raffle.name}" fue rechazada. Motivo: ${body.organizer_notes}. Puedes abrir una disputa si no estás de acuerdo.`,
    type:    "warning",
    related_raffle_id: refund.raffle_id,
  });

  await supabase.from("audit_log").insert({
    user_id:     userId,
    action:      "refund_denied",
    entity_type: "refund_request",
    entity_id:   body.refund_request_id,
    new_value:   { status: "denied", organizer_notes: body.organizer_notes },
  });

  return { success: true };
}

// ============================================================
// GET REFUND STATS
// ============================================================
async function handleGetStats(userId: string) {
  const supabase = getAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();

  let query = supabase.from("refund_requests").select("status, amount");
  if (profile?.role === "organizer") query = query.eq("organizer_id", userId);
  if (profile?.role === "participant") query = query.eq("participant_id", userId);

  const { data } = await query;
  const rows = data || [];

  const stats = {
    total:   rows.length,
    pending: rows.filter((r: any) => r.status === "pending").length,
    approved: rows.filter((r: any) => r.status === "approved").length,
    denied:   rows.filter((r: any) => r.status === "denied").length,
    refunded: rows.filter((r: any) => r.status === "refunded").length,
    failed:   rows.filter((r: any) => r.status === "failed").length,
    total_amount_refunded: rows.filter((r: any) => r.status === "refunded").reduce((s: number, r: any) => s + r.amount, 0),
    total_amount_pending:  rows.filter((r: any) => r.status === "pending").reduce((s: number, r: any) => s + r.amount, 0),
  };

  return { stats };
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
    if (!user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const body = await req.json();
    const { action } = body;

    let result;
    switch (action) {
      case "request-refund":
        result = await handleRequestRefund(user.id, body);
        break;
      case "list-refund-requests":
        result = await handleListRefundRequests(user.id, body);
        break;
      case "approve-refund":
        result = await handleApproveRefund(user.id, body);
        break;
      case "deny-refund":
        result = await handleDenyRefund(user.id, body);
        break;
      case "get-stats":
        result = await handleGetStats(user.id);
        break;
      default:
        result = { error: "Acción no reconocida: " + action };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("process-refund error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
