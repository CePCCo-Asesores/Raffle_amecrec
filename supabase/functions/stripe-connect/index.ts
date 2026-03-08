// ============================================================
// EDGE FUNCTION: stripe-connect
// Modo: PAGO EXTERNO ÚNICAMENTE
// Stripe deshabilitado — toda la lógica es manual
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
// MARK TICKET AS PAID — Organizador confirma pago externo
// ============================================================
async function handleMarkTicketPaid(organizerId: string, body: {
  ticket_id: string;
  payment_reference?: string;
}) {
  const supabase = getAdminClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("*, raffles!raffle_id(organizer_id, name, price_per_ticket)")
    .eq("id", body.ticket_id)
    .single();

  if (error || !ticket) return { error: "Boleto no encontrado" };

  const raffle = ticket.raffles as any;

  if (raffle.organizer_id !== organizerId) {
    return { error: "Sin permiso para confirmar pago en esta rifa" };
  }

  if (!["sold", "reserved"].includes(ticket.status)) {
    return { error: `El boleto está en estado "${ticket.status}", no se puede confirmar pago` };
  }

  await supabase.from("tickets").update({
    status:          "paid",
    payment_method:  "external",
    marked_paid_by:  organizerId,
    marked_paid_at:  new Date().toISOString(),
    stripe_payment_id: body.payment_reference || null,
  }).eq("id", body.ticket_id);

  // Notificar al participante si existe
  if (ticket.participant_id) {
    await supabase.from("notifications").insert({
      user_id: ticket.participant_id,
      title:   "Pago confirmado",
      message: `El organizador confirmó tu pago del boleto #${ticket.ticket_number} de "${raffle.name}".`,
      type:    "success",
      related_raffle_id: ticket.raffle_id,
    });
  }

  await supabase.from("audit_log").insert({
    user_id:     organizerId,
    action:      "ticket_payment_confirmed",
    entity_type: "ticket",
    entity_id:   body.ticket_id,
    new_value:   { status: "paid", payment_reference: body.payment_reference },
  });

  return { success: true };
}

// ============================================================
// MARK MULTIPLE TICKETS AS PAID — Batch
// ============================================================
async function handleMarkBatchPaid(organizerId: string, body: {
  ticket_ids: string[];
  payment_reference?: string;
}) {
  const supabase = getAdminClient();

  const results: { ticket_id: string; success: boolean; error?: string }[] = [];

  for (const ticketId of body.ticket_ids) {
    const result = await handleMarkTicketPaid(organizerId, {
      ticket_id:         ticketId,
      payment_reference: body.payment_reference,
    });
    results.push({ ticket_id: ticketId, ...result });
  }

  return { results };
}

// ============================================================
// GET PENDING PAYMENTS — Boletos vendidos pero no confirmados
// ============================================================
async function handleGetPendingPayments(organizerId: string, body: { raffle_id?: string }) {
  const supabase = getAdminClient();

  let query = supabase
    .from("tickets")
    .select(`
      id, ticket_number, status, purchased_at, payment_method,
      raffle_id,
      participant:profiles!participant_id(full_name, email, phone),
      raffle:raffles!raffle_id(name, price_per_ticket, organizer_id, payment_instructions)
    `)
    .eq("status", "sold") // sold = comprado pero no confirmado como paid
    .not("participant_id", "is", null);

  if (body.raffle_id) {
    query = query.eq("raffle_id", body.raffle_id);
  } else {
    // Filtrar solo las rifas del organizador
    const { data: raffleIds } = await supabase
      .from("raffles")
      .select("id")
      .eq("organizer_id", organizerId);

    const ids = (raffleIds || []).map((r: any) => r.id);
    if (ids.length === 0) return { tickets: [] };
    query = query.in("raffle_id", ids);
  }

  const { data: tickets, error } = await query
    .order("purchased_at", { ascending: true })
    .limit(200);

  if (error) return { tickets: [], error: error.message };

  return {
    tickets: (tickets || []).map((t: any) => ({
      ...t,
      participant_name:  t.participant?.full_name,
      participant_email: t.participant?.email,
      participant_phone: t.participant?.phone,
      raffle_name:       t.raffle?.name,
      price_per_ticket:  t.raffle?.price_per_ticket,
      payment_instructions: t.raffle?.payment_instructions,
    })),
  };
}

// ============================================================
// CREATE CHECKOUT SESSION — DESHABILITADO (pago externo)
// ============================================================
function handleCreateCheckoutSession() {
  return {
    error: "Stripe no está configurado. Esta plataforma usa pago externo. El organizador confirmará tu pago manualmente.",
    mode:  "external_payment",
  };
}

// ============================================================
// CREATE CONNECT ACCOUNT — DESHABILITADO
// ============================================================
function handleCreateConnectAccount() {
  return {
    error: "Stripe Connect no está configurado en esta instalación.",
    mode:  "external_payment",
  };
}

// ============================================================
// CHECK CONNECT STATUS — Retorna not_connected siempre
// ============================================================
function handleCheckConnectStatus() {
  return {
    connected: false,
    status:    "not_connected",
    mode:      "external_payment",
  };
}

// ============================================================
// VERIFY PAYMENT — Para pago externo, verificar en DB
// ============================================================
async function handleVerifyPayment(_userId: string, body: { session_id?: string; ticket_id?: string }) {
  if (!body.ticket_id) {
    return { error: "Para pago externo, proporciona ticket_id" };
  }

  const supabase = getAdminClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("status, marked_paid_at")
    .eq("id", body.ticket_id)
    .single();

  return {
    status:       ticket?.status || "unknown",
    amount_total: null,
    paid:         ticket?.status === "paid",
    paid_at:      ticket?.marked_paid_at,
  };
}

// ============================================================
// GET PAYMENT SUMMARY — Resumen financiero de una rifa
// ============================================================
async function handleGetPaymentSummary(organizerId: string, body: { raffle_id: string }) {
  const supabase = getAdminClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("name, price_per_ticket, total_tickets, tickets_sold, revenue, organizer_id")
    .eq("id", body.raffle_id)
    .single();

  if (!raffle) return { error: "Rifa no encontrada" };
  if (raffle.organizer_id !== organizerId) return { error: "Sin acceso" };

  const { data: ticketStats } = await supabase
    .from("tickets")
    .select("status")
    .eq("raffle_id", body.raffle_id);

  const stats = (ticketStats || []).reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return {
    raffle_name:       raffle.name,
    price_per_ticket:  raffle.price_per_ticket,
    total_tickets:     raffle.total_tickets,
    available:         stats.available || 0,
    reserved:          stats.reserved  || 0,
    sold:              stats.sold      || 0,
    paid:              stats.paid      || 0,
    revenue_confirmed: (stats.paid || 0) * raffle.price_per_ticket,
    revenue_pending:   (stats.sold || 0) * raffle.price_per_ticket,
    revenue_total:     raffle.revenue,
  };
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
      // Pagos externos
      case "mark-ticket-paid":
        result = await handleMarkTicketPaid(user.id, body);
        break;
      case "mark-batch-paid":
        result = await handleMarkBatchPaid(user.id, body);
        break;
      case "get-pending-payments":
        result = await handleGetPendingPayments(user.id, body);
        break;
      case "get-payment-summary":
        result = await handleGetPaymentSummary(user.id, body);
        break;
      case "verify-payment":
        result = await handleVerifyPayment(user.id, body);
        break;
      // Stripe (deshabilitado)
      case "create-checkout-session":
        result = handleCreateCheckoutSession();
        break;
      case "create-connect-account":
        result = handleCreateConnectAccount();
        break;
      case "check-connect-status":
        result = handleCheckConnectStatus();
        break;
      default:
        result = { error: "Acción no reconocida: " + action };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("stripe-connect error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
