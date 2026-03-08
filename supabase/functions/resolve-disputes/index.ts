// ============================================================
// EDGE FUNCTION: resolve-disputes
// Sistema de disputas entre participantes y organizadores
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
// CREATE DISPUTE — Participante escala reembolso rechazado
// ============================================================
async function handleCreateDispute(userId: string, body: {
  refund_request_id: string;
  reason: string;
}) {
  const supabase = getAdminClient();

  const { data: refund, error } = await supabase
    .from("refund_requests")
    .select("*, raffles!raffle_id(id, name, organizer_id, price_per_ticket)")
    .eq("id", body.refund_request_id)
    .single();

  if (error || !refund) return { error: "Solicitud de reembolso no encontrada" };

  if (refund.participant_id !== userId) {
    return { error: "Sin permiso para abrir disputa en esta solicitud" };
  }

  if (refund.status !== "denied") {
    return { error: "Solo se pueden disputar solicitudes rechazadas" };
  }

  // Verificar que no exista disputa activa
  const { data: existing } = await supabase
    .from("disputes")
    .select("id")
    .eq("refund_request_id", body.refund_request_id)
    .not("status", "in", '("resolved_participant","resolved_organizer","closed")')
    .single();

  if (existing) return { error: "Ya existe una disputa activa para esta solicitud" };

  const raffle = refund.raffles as any;

  const { data: dispute, error: insertErr } = await supabase
    .from("disputes")
    .insert({
      refund_request_id: body.refund_request_id,
      raffle_id:         raffle.id,
      ticket_id:         refund.ticket_id,
      participant_id:    userId,
      organizer_id:      raffle.organizer_id,
      ticket_number:     refund.ticket_number,
      amount:            refund.amount,
      currency:          "MXN",
      status:            "open",
      reason:            body.reason,
    })
    .select()
    .single();

  if (insertErr) return { error: insertErr.message };

  // Mensaje inicial del sistema
  await supabase.from("dispute_messages").insert({
    dispute_id:   dispute.id,
    sender_id:    userId,
    sender_role:  "system",
    sender_name:  "Sistema RifaMax",
    message:      `Disputa abierta por el participante. Motivo: ${body.reason}`,
    message_type: "system",
    is_internal:  false,
  });

  // Notificar a admins
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);

  for (const admin of (admins || [])) {
    await supabase.from("notifications").insert({
      user_id: admin.id,
      title:   "Nueva disputa abierta",
      message: `Disputa en "${raffle.name}" por boleto #${refund.ticket_number}. Requiere revisión.`,
      type:    "warning",
      related_raffle_id: raffle.id,
    });
  }

  // Notificar al organizador
  await supabase.from("notifications").insert({
    user_id: raffle.organizer_id,
    title:   "Disputa abierta",
    message: `Un participante abrió una disputa por el boleto #${refund.ticket_number} de "${raffle.name}".`,
    type:    "error",
    related_raffle_id: raffle.id,
  });

  await supabase.from("audit_log").insert({
    user_id:     userId,
    action:      "dispute_created",
    entity_type: "dispute",
    entity_id:   dispute.id,
    new_value:   { refund_request_id: body.refund_request_id, reason: body.reason },
  });

  return { success: true, dispute };
}

// ============================================================
// LIST DISPUTES
// ============================================================
async function handleListDisputes(userId: string, body: { status?: string }) {
  const supabase = getAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  let query = supabase
    .from("disputes")
    .select(`
      *,
      participant:profiles!participant_id(full_name, email),
      organizer:profiles!organizer_id(full_name, email),
      assigned_admin:profiles!assigned_admin_id(full_name),
      raffle:raffles!raffle_id(name, status),
      refund:refund_requests!refund_request_id(reason, organizer_notes)
    `)
    .order("created_at", { ascending: false });

  if (profile?.role === "participant") {
    query = query.eq("participant_id", userId);
  } else if (profile?.role === "organizer") {
    query = query.eq("organizer_id", userId);
  }
  // admin ve todo

  if (body.status) query = query.eq("status", body.status);

  const { data: disputes, error } = await query.limit(100);
  if (error) return { disputes: [], error: error.message };

  const enriched = (disputes || []).map((d: any) => ({
    ...d,
    participant_name:      d.participant?.full_name,
    participant_email:     d.participant?.email,
    organizer_name:        d.organizer?.full_name,
    organizer_email:       d.organizer?.email,
    assigned_admin_name:   d.assigned_admin?.full_name,
    raffle_name:           d.raffle?.name,
    raffle_status:         d.raffle?.status,
    refund_reason:         d.refund?.reason,
    refund_organizer_notes: d.refund?.organizer_notes,
  }));

  return { disputes: enriched };
}

// ============================================================
// GET DISPUTE DETAIL con timeline de mensajes
// ============================================================
async function handleGetDisputeDetail(userId: string, body: { dispute_id: string }) {
  const supabase = getAdminClient();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();

  const { data: dispute, error } = await supabase
    .from("disputes")
    .select(`
      *,
      participant:profiles!participant_id(full_name, email),
      organizer:profiles!organizer_id(full_name, email),
      raffle:raffles!raffle_id(name, status),
      refund:refund_requests!refund_request_id(reason, organizer_notes, amount)
    `)
    .eq("id", body.dispute_id)
    .single();

  if (error || !dispute) return { error: "Disputa no encontrada" };

  // Verificar acceso
  if (profile?.role === "participant" && dispute.participant_id !== userId) {
    return { error: "Sin acceso" };
  }
  if (profile?.role === "organizer" && dispute.organizer_id !== userId) {
    return { error: "Sin acceso" };
  }

  // Mensajes (internos solo para admin)
  let msgQuery = supabase
    .from("dispute_messages")
    .select("*")
    .eq("dispute_id", body.dispute_id)
    .order("created_at", { ascending: true });

  if (profile?.role !== "admin") {
    msgQuery = msgQuery.eq("is_internal", false);
  }

  const { data: messages } = await msgQuery;

  return { dispute, messages: messages || [] };
}

// ============================================================
// ADD MESSAGE — Cualquier parte puede agregar mensajes
// ============================================================
async function handleAddMessage(userId: string, body: {
  dispute_id: string;
  message: string;
  message_type?: string;
  is_internal?: boolean;
}) {
  const supabase = getAdminClient();

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", userId).single();

  const { data: dispute } = await supabase
    .from("disputes")
    .select("participant_id, organizer_id, status")
    .eq("id", body.dispute_id)
    .single();

  if (!dispute) return { error: "Disputa no encontrada" };

  if (["resolved_participant","resolved_organizer","closed"].includes(dispute.status)) {
    return { error: "No se pueden agregar mensajes a una disputa cerrada" };
  }

  // Verificar que el usuario es parte de la disputa o es admin
  const isParticipant = dispute.participant_id === userId;
  const isOrganizer   = dispute.organizer_id === userId;
  const isAdmin       = profile?.role === "admin";

  if (!isParticipant && !isOrganizer && !isAdmin) {
    return { error: "Sin permiso para comentar en esta disputa" };
  }

  const senderRole = isAdmin ? "admin" : isOrganizer ? "organizer" : "participant";
  const isInternal = body.is_internal && isAdmin ? true : false;

  const { data: msg, error: msgErr } = await supabase
    .from("dispute_messages")
    .insert({
      dispute_id:   body.dispute_id,
      sender_id:    userId,
      sender_role:  senderRole,
      sender_name:  profile?.full_name,
      message:      body.message,
      message_type: body.message_type || "message",
      is_internal:  isInternal,
    })
    .select()
    .single();

  if (msgErr) return { error: msgErr.message };

  // Notificar a las otras partes
  const notifyIds = [];
  if (!isParticipant) notifyIds.push(dispute.participant_id);
  if (!isOrganizer)   notifyIds.push(dispute.organizer_id);

  for (const notifyId of notifyIds) {
    await supabase.from("notifications").insert({
      user_id: notifyId,
      title:   "Nuevo mensaje en disputa",
      message: `${profile?.full_name} agregó un mensaje a la disputa.`,
      type:    "info",
    });
  }

  return { success: true, message: msg };
}

// ============================================================
// RESOLVE DISPUTE — Solo admin puede resolver
// ============================================================
async function handleResolveDispute(userId: string, body: {
  dispute_id: string;
  resolution: "participant" | "organizer";
  admin_notes: string;
  force_refund?: boolean;
  resolution_summary: string;
}) {
  const supabase = getAdminClient();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "admin") return { error: "Solo administradores pueden resolver disputas" };

  const { data: dispute } = await supabase
    .from("disputes")
    .select("*, raffles!raffle_id(name, payment_method)")
    .eq("id", body.dispute_id)
    .single();

  if (!dispute) return { error: "Disputa no encontrada" };

  const newStatus = body.resolution === "participant"
    ? "resolved_participant"
    : "resolved_organizer";

  await supabase.from("disputes").update({
    status:             newStatus,
    admin_notes:        body.admin_notes,
    admin_decision:     body.resolution,
    force_refund:       body.force_refund || false,
    resolution_summary: body.resolution_summary,
    resolved_by:        userId,
    resolved_at:        new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }).eq("id", body.dispute_id);

  // Si se resuelve a favor del participante con fuerza de reembolso
  if (body.resolution === "participant" && body.force_refund) {
    await supabase.from("refund_requests").update({
      status:     "refunded",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      refunded_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }).eq("id", dispute.refund_request_id);

    // Liberar boleto
    await supabase.from("tickets").update({
      status:         "available",
      participant_id: null,
      purchased_at:   null,
    }).eq("id", dispute.ticket_id);

    // Ledger
    await supabase.from("financial_ledger").insert({
      entry_type:  "refund",
      amount:      dispute.amount,
      currency:    "MXN",
      description: `Reembolso forzado por admin - disputa #${dispute.id.slice(0,8)}`,
      raffle_id:   dispute.raffle_id,
      ticket_id:   dispute.ticket_id,
      payer_id:    dispute.organizer_id,
      receiver_id: dispute.participant_id,
    });
  }

  // Mensaje de resolución
  await supabase.from("dispute_messages").insert({
    dispute_id:   body.dispute_id,
    sender_id:    userId,
    sender_role:  "admin",
    sender_name:  "Administración RifaMax",
    message:      `Disputa resuelta. Decisión: ${body.resolution === "participant" ? "A favor del participante" : "A favor del organizador"}. ${body.resolution_summary}`,
    message_type: "admin_action",
    is_internal:  false,
  });

  // Notificar a ambas partes
  const raffle = dispute.raffles as any;
  const decisionText = body.resolution === "participant"
    ? "a tu favor"
    : "a favor del organizador";

  await supabase.from("notifications").insert([
    {
      user_id: dispute.participant_id,
      title:   "Disputa resuelta",
      message: `La disputa por el boleto #${dispute.ticket_number} fue resuelta ${decisionText}. ${body.resolution_summary}`,
      type:    body.resolution === "participant" ? "success" : "info",
      related_raffle_id: dispute.raffle_id,
    },
    {
      user_id: dispute.organizer_id,
      title:   "Disputa resuelta",
      message: `La disputa del boleto #${dispute.ticket_number} de "${raffle?.name}" fue resuelta ${decisionText}.`,
      type:    body.resolution === "organizer" ? "success" : "warning",
      related_raffle_id: dispute.raffle_id,
    },
  ]);

  await supabase.from("audit_log").insert({
    user_id:     userId,
    action:      "dispute_resolved",
    entity_type: "dispute",
    entity_id:   body.dispute_id,
    new_value:   { status: newStatus, resolution: body.resolution, force_refund: body.force_refund },
  });

  return { success: true, new_status: newStatus };
}

// ============================================================
// GET DISPUTE STATS (para admin)
// ============================================================
async function handleGetStats(userId: string) {
  const supabase = getAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "admin") return { error: "Solo administradores" };

  const { data } = await supabase.from("disputes").select("status");
  const rows = data || [];

  return {
    stats: {
      total:                 rows.length,
      open:                  rows.filter((r: any) => r.status === "open").length,
      under_review:          rows.filter((r: any) => r.status === "under_review").length,
      resolved_participant:  rows.filter((r: any) => r.status === "resolved_participant").length,
      resolved_organizer:    rows.filter((r: any) => r.status === "resolved_organizer").length,
      closed:                rows.filter((r: any) => r.status === "closed").length,
    },
  };
}

// ============================================================
// ASSIGN ADMIN — Admin asigna disputa a sí mismo
// ============================================================
async function handleAssignAdmin(userId: string, body: { dispute_id: string }) {
  const supabase = getAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "admin") return { error: "Solo administradores" };

  await supabase.from("disputes").update({
    assigned_admin_id: userId,
    status:            "under_review",
    updated_at:        new Date().toISOString(),
  }).eq("id", body.dispute_id);

  await supabase.from("dispute_messages").insert({
    dispute_id:   body.dispute_id,
    sender_id:    userId,
    sender_role:  "admin",
    message:      "Esta disputa ha sido tomada bajo revisión por un administrador.",
    message_type: "status_change",
    is_internal:  false,
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
      case "create-dispute":
        result = await handleCreateDispute(user.id, body);
        break;
      case "list-disputes":
        result = await handleListDisputes(user.id, body);
        break;
      case "get-dispute-detail":
        result = await handleGetDisputeDetail(user.id, body);
        break;
      case "add-message":
        result = await handleAddMessage(user.id, body);
        break;
      case "resolve-dispute":
        result = await handleResolveDispute(user.id, body);
        break;
      case "assign-admin":
        result = await handleAssignAdmin(user.id, body);
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
    console.error("resolve-disputes error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
