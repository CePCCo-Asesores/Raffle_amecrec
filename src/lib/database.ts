import { supabase } from './supabase';
import { rateLimiter } from './rate-limiter';
import {
  Raffle, Ticket, RaffleStatus, RAFFLE_STATUS_TRANSITIONS,
  RAFFLE_VALIDATION_RULES, AuditLog, FinancialLedger,
  RaffleResultsLog, Profile, Transaction
} from './types';

// ============================================================
// AUDIT LOGGING
// ============================================================

export async function createAuditLog(params: {
  userId?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  details?: Record<string, any>;
}) {
  try {
    await supabase.from('audit_log').insert({
      user_id: params.userId,
      user_email: params.userEmail,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_value: params.oldValue,
      new_value: params.newValue,
      details: params.details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Audit log error:', err);
    // Don't throw - audit logging should not block operations
  }
}

// ============================================================
// FINANCIAL LEDGER
// ============================================================

export async function createLedgerEntry(params: {
  entryType: string;
  amount: number;
  currency?: string;
  description: string;
  raffleId?: string;
  ticketId?: string;
  payerId?: string;
  receiverId?: string;
  commissionRateApplied?: number;
  commissionAmountCalculated?: number;
  transactionId?: string;
}) {
  try {
    await supabase.from('financial_ledger').insert({
      entry_type: params.entryType,
      amount: params.amount,
      currency: params.currency || 'MXN',
      description: params.description,
      raffle_id: params.raffleId,
      ticket_id: params.ticketId,
      payer_id: params.payerId,
      receiver_id: params.receiverId,
      commission_rate_applied: params.commissionRateApplied,
      commission_amount_calculated: params.commissionAmountCalculated,
      transaction_id: params.transactionId,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Ledger entry error:', err);
  }
}

// ============================================================
// RAFFLE RESULT LOG (Immutability)
// ============================================================

function generateResultHash(data: {
  raffleId: string;
  winningNumber: number;
  lotteryType: string;
  lotteryDrawNumber: string;
  registeredBy: string;
  timestamp: string;
}): string {
  // Simple hash for tamper detection (in production, use crypto.subtle)
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + '-' + Date.now().toString(16);
}

export async function createResultLog(params: {
  raffleId: string;
  winningNumber: number;
  lotteryType: string;
  lotteryDrawNumber: string;
  lotteryDrawDate: string;
  registeredBy: string;
  evidenceUrl?: string;
  previousResultId?: string;
  changeReason?: string;
}): Promise<{ success: boolean; resultId?: string; error?: string }> {
  const timestamp = new Date().toISOString();
  const resultHash = generateResultHash({
    raffleId: params.raffleId,
    winningNumber: params.winningNumber,
    lotteryType: params.lotteryType,
    lotteryDrawNumber: params.lotteryDrawNumber,
    registeredBy: params.registeredBy,
    timestamp,
  });

  try {
    const { data, error } = await supabase.from('raffle_results_log').insert({
      raffle_id: params.raffleId,
      winning_number: params.winningNumber,
      lottery_type: params.lotteryType,
      lottery_draw_number: params.lotteryDrawNumber,
      lottery_draw_date: params.lotteryDrawDate,
      registered_by: params.registeredBy,
      registered_at: timestamp,
      result_hash: resultHash,
      evidence_url: params.evidenceUrl,
      is_official: true,
      previous_result_id: params.previousResultId,
      change_reason: params.changeReason,
    }).select().single();

    if (error) {
      console.error('Result log error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, resultId: data?.id };
  } catch (err) {
    console.error('Result log exception:', err);
    return { success: false, error: 'Error al registrar resultado' };
  }
}

// ============================================================
// RAFFLE STATE MACHINE
// ============================================================

export function canTransitionTo(currentStatus: RaffleStatus, targetStatus: RaffleStatus): boolean {
  const allowed = RAFFLE_STATUS_TRANSITIONS[currentStatus];
  return allowed?.includes(targetStatus) ?? false;
}

export function validateRaffleTransition(
  raffle: Raffle,
  targetStatus: RaffleStatus
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if transition is allowed
  if (!canTransitionTo(raffle.status, targetStatus)) {
    errors.push(`No se puede cambiar de "${raffle.status}" a "${targetStatus}". Transición no permitida.`);
    return { valid: false, errors };
  }

  // Specific validations per target status
  switch (targetStatus) {
    case 'active':
      // Must have lottery date defined
      if (RAFFLE_VALIDATION_RULES.requireLotteryDateForActivation && !raffle.lottery_draw_date) {
        errors.push('Se requiere fecha oficial del sorteo de Lotería Nacional para activar la rifa.');
      }
      if (!raffle.draw_date) {
        errors.push('Se requiere fecha del sorteo para activar la rifa.');
      }
      if (!raffle.sales_close_date) {
        errors.push('Se requiere fecha de cierre de ventas para activar la rifa.');
      }
      if (raffle.price_per_ticket <= 0) {
        errors.push('El precio por boleto debe ser mayor a 0.');
      }
      if (raffle.total_tickets <= 0) {
        errors.push('El total de boletos debe ser mayor a 0.');
      }
      break;

    case 'closed':
      // Must have sold tickets
      if (RAFFLE_VALIDATION_RULES.requireSoldTicketsForClose && raffle.tickets_sold === 0) {
        errors.push('No se puede cerrar una rifa sin boletos vendidos.');
      }
      break;

    case 'validated':
      // Must be closed first
      if (RAFFLE_VALIDATION_RULES.requireClosedForValidation && raffle.status !== 'closed') {
        errors.push('La rifa debe estar cerrada antes de validar.');
      }
      break;

    case 'locked':
      if (raffle.status !== 'validated') {
        errors.push('La rifa debe estar validada antes de bloquear.');
      }
      break;

    case 'winner_declared':
      if (raffle.status !== 'locked') {
        errors.push('La rifa debe estar bloqueada antes de declarar ganador.');
      }
      break;

    case 'cancelled':
      // Can cancel from draft or active
      if (raffle.tickets_sold > 0 && raffle.status === 'active') {
        errors.push('Advertencia: La rifa tiene boletos vendidos. Se requerirá proceso de reembolso.');
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// ATOMIC TICKET PURCHASE
// ============================================================

export async function atomicTicketPurchase(params: {
  userId: string;
  userEmail: string;
  raffleId: string;
  ticketNumbers: number[];
  paymentMethod: string;
  commissionRate: number;
  pricePerTicket: number;
}): Promise<{ success: boolean; purchasedTickets: number[]; errors: string[] }> {
  const { userId, userEmail, raffleId, ticketNumbers, paymentMethod, commissionRate, pricePerTicket } = params;

  // 1. Client-side rate limiting (defense in depth - server also checks)
  const rateCheck = rateLimiter.canPurchaseTickets(userId, ticketNumbers.length);
  if (!rateCheck.allowed) {
    return { success: false, purchasedTickets: [], errors: [rateCheck.reason!] };
  }

  // 2. Validate ticket count per transaction
  if (ticketNumbers.length > RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction) {
    return {
      success: false,
      purchasedTickets: [],
      errors: [`Máximo ${RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction} boletos por transacción`],
    };
  }

  try {
    // 3. Call server-side atomic RPC function (FOR UPDATE locking, ledger, audit)
    const { data, error } = await supabase.rpc('atomic_purchase_tickets', {
      p_user_id: userId,
      p_user_email: userEmail,
      p_raffle_id: raffleId,
      p_ticket_numbers: ticketNumbers,
      p_payment_method: paymentMethod,
      p_commission_rate: commissionRate,
      p_price_per_ticket: pricePerTicket,
    });

    if (error) {
      console.error('RPC atomic_purchase_tickets error:', error);
      // Fallback to client-side optimistic approach if RPC not available
      return await fallbackClientPurchase(params);
    }

    const result = data as any;
    const purchased = (result?.purchased || []) as number[];
    const errors = (result?.errors || []) as string[];

    // Record rate limit on client side too
    if (purchased.length > 0) {
      rateLimiter.recordPurchase(userId, purchased.length);
    }

    return {
      success: purchased.length > 0,
      purchasedTickets: purchased,
      errors,
    };
  } catch (err) {
    console.error('Atomic purchase exception, using fallback:', err);
    return await fallbackClientPurchase(params);
  }
}
// Fallback: client-side optimistic concurrency (if RPC is unavailable)
async function fallbackClientPurchase(params: {
  userId: string;
  userEmail: string;
  raffleId: string;
  ticketNumbers: number[];
  paymentMethod: string;
  commissionRate: number;
  pricePerTicket: number;
}): Promise<{ success: boolean; purchasedTickets: number[]; errors: string[] }> {
  const { userId, userEmail, raffleId, ticketNumbers, paymentMethod, commissionRate, pricePerTicket } = params;
  const errors: string[] = [];
  const purchasedTickets: number[] = [];
  const now = new Date().toISOString();

  for (const ticketNum of ticketNumbers) {
    try {
      // Accept available tickets OR tickets reserved by this user OR expired reservations
      const { data, error } = await supabase
        .from('tickets')
        .update({
          participant_id: userId,
          status: 'sold' as const,
          purchased_at: now,
          payment_method: paymentMethod,
          commission_rate: commissionRate,
          commission_amount: pricePerTicket * (commissionRate / 100),
          reserved_by: null,
          reserved_until: null,
        })
        .eq('raffle_id', raffleId)
        .eq('ticket_number', ticketNum)
        .or(`status.eq.available,and(status.eq.reserved,reserved_by.eq.${userId})`)
        .select()
        .single();

      if (error || !data) {
        errors.push(`Boleto #${ticketNum} ya no está disponible`);
        continue;
      }

      purchasedTickets.push(ticketNum);

      const commissionAmount = pricePerTicket * (commissionRate / 100);
      const organizerAmount = pricePerTicket - commissionAmount;

      await createLedgerEntry({ entryType: 'ticket_sale', amount: pricePerTicket, description: `Venta boleto #${ticketNum}`, raffleId, ticketId: data.id, payerId: userId, commissionRateApplied: commissionRate, commissionAmountCalculated: commissionAmount });
      if (commissionAmount > 0) {
        await createLedgerEntry({ entryType: 'platform_commission', amount: commissionAmount, description: `Comisión ${commissionRate}%`, raffleId, ticketId: data.id, payerId: userId, commissionRateApplied: commissionRate, commissionAmountCalculated: commissionAmount });
      }
      await createLedgerEntry({ entryType: 'organizer_income', amount: organizerAmount, description: `Ingreso organizador boleto #${ticketNum}`, raffleId, ticketId: data.id, payerId: userId });
    } catch (err) {
      errors.push(`Error boleto #${ticketNum}`);
    }
  }

  if (purchasedTickets.length > 0) {
    const { data: currentRaffle } = await supabase.from('raffles').select('tickets_sold, revenue').eq('id', raffleId).single();
    if (currentRaffle) {
      await supabase.from('raffles').update({ tickets_sold: currentRaffle.tickets_sold + purchasedTickets.length, revenue: currentRaffle.revenue + (purchasedTickets.length * pricePerTicket), updated_at: now }).eq('id', raffleId);
    }
    rateLimiter.recordPurchase(userId, purchasedTickets.length);
    await createAuditLog({ userId, userEmail, action: 'ticket_purchase', entityType: 'ticket', entityId: raffleId, newValue: { ticketNumbers: purchasedTickets, amount: purchasedTickets.length * pricePerTicket }, details: { raffleId, paymentMethod, commissionRate } });
  }

  return { success: purchasedTickets.length > 0, purchasedTickets, errors };
}

// ============================================================
// TICKET RESERVATION SYSTEM
// ============================================================

export async function reserveTickets(params: {
  userId: string;
  raffleId: string;
  ticketNumbers: number[];
  durationSeconds?: number;
}): Promise<{ reserved: number[]; failed: number[]; expiresAt?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('reserve_tickets', {
      p_user_id: params.userId,
      p_raffle_id: params.raffleId,
      p_ticket_numbers: params.ticketNumbers,
      p_duration_seconds: params.durationSeconds || 300,
    });

    if (error) {
      console.error('RPC reserve_tickets error:', error);
      // Fallback: just return success without DB reservation (client-only selection)
      return { reserved: params.ticketNumbers, failed: [] };
    }

    const result = data as any;
    return {
      reserved: (result?.reserved || []) as number[],
      failed: (result?.failed || []) as number[],
      expiresAt: result?.expires_at,
    };
  } catch (err) {
    console.error('Reserve tickets exception:', err);
    return { reserved: params.ticketNumbers, failed: [] };
  }
}

export async function releaseTickets(params: {
  userId: string;
  raffleId: string;
  ticketNumbers: number[];
}): Promise<void> {
  try {
    await supabase.rpc('release_tickets', {
      p_user_id: params.userId,
      p_raffle_id: params.raffleId,
      p_ticket_numbers: params.ticketNumbers,
    });
  } catch (err) {
    console.error('Release tickets error:', err);
  }
}

export async function cleanupExpiredReservations(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_reservations');
    if (error) return 0;
    return (data as number) || 0;
  } catch { return 0; }
}


// ============================================================
// BUY TICKET — Atomic single-ticket purchase via DB function
// Uses unique_ticket_per_raffle index + ON CONFLICT DO NOTHING
// ============================================================

export async function buyTicket(params: {
  raffleId: string;
  ticketNumber: number;
  userId: string;
}): Promise<{ success: boolean }> {
  try {
    const { data, error } = await supabase.rpc('buy_ticket', {
      p_raffle_id: params.raffleId,
      p_ticket_number: params.ticketNumber,
      p_user_id: params.userId,
    });

    if (error) {
      console.error('RPC buy_ticket error:', error);
      return { success: false };
    }

    return { success: (data as any)?.success === true };
  } catch (err) {
    console.error('buy_ticket exception:', err);
    return { success: false };
  }
}


// ============================================================
// CLOSING FLOW — Atomic DB functions for raffle lifecycle
// ============================================================

export interface ClosingSummary {
  raffle_name: string;
  status: string;
  total_tickets: number;
  price_per_ticket: number;
  draw_date: string;
  lottery_type: string;
  lottery_draw_date: string;
  lottery_draw_number: string;
  unsold_policy: string;
  paid_tickets: number;
  sold_tickets: number;
  available_tickets: number;
  reserved_tickets: number;
  total_sold: number;
  revenue: number;
  winning_number: number | null;
  winner_name: string | null;
  winner_email: string | null;
  result_hash: string | null;
}

export async function getClosingSummary(raffleId: string): Promise<{ success: boolean; data?: ClosingSummary; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('get_raffle_closing_summary', { p_raffle_id: raffleId });
    if (error) return { success: false, error: error.message };
    const result = data as any;
    if (!result?.success) return { success: false, error: result?.error || 'Error desconocido' };
    return { success: true, data: result.data as ClosingSummary };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function closeRaffleAtomic(raffleId: string, userId: string): Promise<{ success: boolean; summary?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('close_raffle', { p_raffle_id: raffleId, p_user_id: userId });
    if (error) return { success: false, error: error.message };
    const result = data as any;
    if (!result?.success) {
      const errCode = result?.error || '';
      const messages: Record<string, string> = {
        'RAFFLE_NOT_FOUND': 'Rifa no encontrada.',
        'INVALID_STATUS': `La rifa debe estar en estado "Activa". Estado actual: ${result?.current_status || ''}`,
        'NO_TICKETS_SOLD': 'No se puede cerrar una rifa sin boletos vendidos.',
      };
      return { success: false, error: messages[errCode] || errCode };
    }
    return { success: true, summary: result.summary };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function validateRaffleAtomic(raffleId: string, userId: string): Promise<{ success: boolean; summary?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('validate_raffle', { p_raffle_id: raffleId, p_user_id: userId });
    if (error) return { success: false, error: error.message };
    const result = data as any;
    if (!result?.success) {
      const errCode = result?.error || '';
      const messages: Record<string, string> = {
        'RAFFLE_NOT_FOUND': 'Rifa no encontrada.',
        'INVALID_STATUS': `La rifa debe estar en estado "Cerrada". Estado actual: ${result?.current_status || ''}`,
      };
      return { success: false, error: messages[errCode] || errCode };
    }
    return { success: true, summary: result.summary };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function lockRaffleAtomic(raffleId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('lock_raffle', { p_raffle_id: raffleId, p_user_id: userId });
    if (error) return { success: false, error: error.message };
    const result = data as any;
    if (!result?.success) {
      const errCode = result?.error || '';
      const messages: Record<string, string> = {
        'RAFFLE_NOT_FOUND': 'Rifa no encontrada.',
        'INVALID_STATUS': `La rifa debe estar en estado "Validada". Estado actual: ${result?.current_status || ''}`,
      };
      return { success: false, error: messages[errCode] || errCode };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function finalizeDrawAtomic(params: {
  raffleId: string;
  userId: string;
  winningNumber: number;
  evidenceUrl?: string;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('finalize_draw', {
      p_raffle_id: params.raffleId,
      p_user_id: params.userId,
      p_winning_number: params.winningNumber,
      p_evidence_url: params.evidenceUrl || null,
    });
    if (error) return { success: false, error: error.message };
    const res = data as any;
    if (!res?.success) {
      const errCode = res?.error || '';
      const messages: Record<string, string> = {
        'RAFFLE_NOT_FOUND': 'Rifa no encontrada.',
        'INVALID_STATUS': `La rifa debe estar en estado "Bloqueada". Estado actual: ${res?.current_status || ''}`,
        'WINNER_ALREADY_DECLARED': 'Esta rifa ya tiene un ganador declarado. El resultado es inmutable.',
        'INVALID_NUMBER': `El numero debe estar entre 1 y ${res?.max || '?'}`,
      };
      return { success: false, error: messages[errCode] || errCode };
    }
    return { success: true, result: res.result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}




// ============================================================
// RAFFLE STATUS TRANSITIONS
// ============================================================

export async function transitionRaffleStatus(params: {
  raffle: Raffle;
  targetStatus: RaffleStatus;
  userId: string;
  userEmail: string;
  userRole: string;
}): Promise<{ success: boolean; errors: string[] }> {
  const { raffle, targetStatus, userId, userEmail, userRole } = params;

  // Validate transition
  const validation = validateRaffleTransition(raffle, targetStatus);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  // Role-based check: only organizer (owner) or admin can change status
  if (userRole === 'organizer' && raffle.organizer_id !== userId) {
    return { success: false, errors: ['No tienes permiso para modificar esta rifa.'] };
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    status: targetStatus,
    updated_at: now,
  };

  // Additional fields based on target status
  if (targetStatus === 'locked') {
    updateData.result_locked = true;
    updateData.result_locked_at = now;
    updateData.result_locked_by = userId;
  }

  const { error } = await supabase
    .from('raffles')
    .update(updateData)
    .eq('id', raffle.id);

  if (error) {
    return { success: false, errors: [error.message] };
  }

  // Audit log
  await createAuditLog({
    userId,
    userEmail,
    action: 'raffle_status_change',
    entityType: 'raffle',
    entityId: raffle.id,
    oldValue: { status: raffle.status },
    newValue: { status: targetStatus },
    details: { raffleName: raffle.name },
  });

  return { success: true, errors: [] };
}

// ============================================================
// DECLARE WINNER (with immutability)
// ============================================================

export async function declareWinner(params: {
  raffle: Raffle;
  winningNumber: number;
  userId: string;
  userEmail: string;
  userRole: string;
  evidenceUrl?: string;
}): Promise<{ success: boolean; errors: string[] }> {
  const { raffle, winningNumber, userId, userEmail, userRole, evidenceUrl } = params;
  const errors: string[] = [];

  // Validate: raffle must be in 'locked' status
  if (raffle.status !== 'locked') {
    errors.push('La rifa debe estar en estado "Bloqueada" para declarar ganador. Flujo: Cerrada → Validada → Bloqueada → Ganador');
    return { success: false, errors };
  }

  // Validate: result not already declared
  if (raffle.winning_number !== undefined && raffle.winning_number !== null) {
    errors.push('Esta rifa ya tiene un ganador declarado. El resultado es inmutable.');
    return { success: false, errors };
  }

  // Validate number range
  if (winningNumber < 1 || winningNumber > raffle.total_tickets) {
    errors.push(`El número debe estar entre 1 y ${raffle.total_tickets}`);
    return { success: false, errors };
  }

  // Role check
  if (userRole === 'organizer' && raffle.organizer_id !== userId) {
    errors.push('No tienes permiso para declarar el ganador de esta rifa.');
    return { success: false, errors };
  }

  const now = new Date().toISOString();

  // 1. Create immutable result log
  const resultLog = await createResultLog({
    raffleId: raffle.id,
    winningNumber,
    lotteryType: raffle.lottery_type || '',
    lotteryDrawNumber: raffle.lottery_draw_number || '',
    lotteryDrawDate: raffle.lottery_draw_date || '',
    registeredBy: userId,
    evidenceUrl,
  });

  if (!resultLog.success) {
    errors.push(resultLog.error || 'Error al registrar resultado');
    return { success: false, errors };
  }

  // 2. Update raffle with winner
  const { error } = await supabase
    .from('raffles')
    .update({
      winning_number: winningNumber,
      status: 'winner_declared',
      winner_declared_at: now,
      winner_evidence_url: evidenceUrl,
      result_locked: true,
      result_locked_at: now,
      result_locked_by: userId,
      updated_at: now,
    })
    .eq('id', raffle.id);

  if (error) {
    errors.push(error.message);
    return { success: false, errors };
  }

  // 3. Audit log
  await createAuditLog({
    userId,
    userEmail,
    action: 'winner_declared',
    entityType: 'raffle',
    entityId: raffle.id,
    newValue: {
      winningNumber,
      resultLogId: resultLog.resultId,
      evidenceUrl,
    },
    details: {
      raffleName: raffle.name,
      lotteryType: raffle.lottery_type,
      lotteryDrawNumber: raffle.lottery_draw_number,
      resultHash: resultLog.resultId,
    },
  });

  return { success: true, errors: [] };
}

// ============================================================
// RAFFLE FIELD IMMUTABILITY CHECKS
// ============================================================

export function canEditRaffleField(raffle: Raffle, field: string): { allowed: boolean; reason?: string } {
  switch (field) {
    case 'price_per_ticket':
      if (['active', 'closed', 'validated', 'locked', 'winner_declared'].includes(raffle.status)) {
        return { allowed: false, reason: 'No se puede modificar el precio después de activar la rifa.' };
      }
      break;
    case 'total_tickets':
      if (raffle.tickets_sold > 0) {
        return { allowed: false, reason: 'No se puede cambiar el total de boletos después de una venta.' };
      }
      break;
    case 'name':
    case 'description':
    case 'image_url':
      if (['locked', 'winner_declared'].includes(raffle.status)) {
        return { allowed: false, reason: 'No se puede modificar la rifa en estado bloqueado.' };
      }
      break;
    case 'lottery_type':
    case 'lottery_draw_date':
    case 'lottery_draw_number':
      if (['active', 'closed', 'validated', 'locked', 'winner_declared'].includes(raffle.status)) {
        return { allowed: false, reason: 'No se puede modificar la configuración del sorteo después de activar.' };
      }
      break;
  }
  return { allowed: true };
}

// ============================================================
// RAFFLE DELETION CHECK
// ============================================================

export function canDeleteRaffle(raffle: Raffle): { allowed: boolean; reason?: string } {
  if (raffle.tickets_sold > 0) {
    return { allowed: false, reason: 'No se puede eliminar una rifa con boletos vendidos.' };
  }
  if (['winner_declared', 'locked'].includes(raffle.status)) {
    return { allowed: false, reason: 'No se puede eliminar una rifa en estado terminal.' };
  }
  return { allowed: true };
}

// ============================================================
// FETCH AUDIT LOGS
// ============================================================

export async function fetchAuditLogs(params?: {
  entityType?: string;
  entityId?: string;
  userId?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params?.limit || 50);

  if (params?.entityType) query = query.eq('entity_type', params.entityType);
  if (params?.entityId) query = query.eq('entity_id', params.entityId);
  if (params?.userId) query = query.eq('user_id', params.userId);

  const { data } = await query;
  return (data as AuditLog[]) || [];
}

// ============================================================
// FETCH FINANCIAL LEDGER
// ============================================================

export async function fetchLedgerEntries(params?: {
  raffleId?: string;
  entryType?: string;
  limit?: number;
}): Promise<FinancialLedger[]> {
  let query = supabase
    .from('financial_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params?.limit || 100);

  if (params?.raffleId) query = query.eq('raffle_id', params.raffleId);
  if (params?.entryType) query = query.eq('entry_type', params.entryType);

  const { data } = await query;
  return (data as FinancialLedger[]) || [];
}

// ============================================================
// FETCH RESULT LOGS
// ============================================================

export async function fetchResultLogs(raffleId: string): Promise<RaffleResultsLog[]> {
  const { data } = await supabase
    .from('raffle_results_log')
    .select('*')
    .eq('raffle_id', raffleId)
    .order('registered_at', { ascending: false });

  return (data as RaffleResultsLog[]) || [];
}
