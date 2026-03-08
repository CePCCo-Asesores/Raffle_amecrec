import { supabase } from './supabase';
import { RefundRequest, RefundStats } from './types';

// ============================================================
// REQUEST REFUND - Participant requests a refund
// ============================================================

export async function requestRefund(params: {
  ticketId: string;
  reason: string;
}): Promise<{ success: boolean; refundRequest?: RefundRequest; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        action: 'request-refund',
        ticket_id: params.ticketId,
        reason: params.reason,
      },
    });

    if (error) {
      return { success: false, error: error.message || 'Error al solicitar reembolso' };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, refundRequest: data.refund_request };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' };
  }
}

// ============================================================
// LIST REFUND REQUESTS
// ============================================================

export async function listRefundRequests(params?: {
  raffleId?: string;
  status?: string;
  role?: 'participant' | 'organizer';
}): Promise<{ requests: RefundRequest[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        action: 'list-refund-requests',
        raffle_id: params?.raffleId,
        status: params?.status,
        role: params?.role,
      },
    });

    if (error) {
      return { requests: [], error: error.message };
    }

    if (data?.error) {
      return { requests: [], error: data.error };
    }

    return { requests: data.requests || [] };
  } catch (err: any) {
    return { requests: [], error: err.message };
  }
}

// ============================================================
// APPROVE REFUND - Organizer approves
// ============================================================

export async function approveRefund(params: {
  refundRequestId: string;
  organizerNotes?: string;
}): Promise<{ success: boolean; stripeRefundId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        action: 'approve-refund',
        refund_request_id: params.refundRequestId,
        organizer_notes: params.organizerNotes,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, stripeRefundId: data.stripe_refund_id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// DENY REFUND - Organizer denies
// ============================================================

export async function denyRefund(params: {
  refundRequestId: string;
  organizerNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        action: 'deny-refund',
        refund_request_id: params.refundRequestId,
        organizer_notes: params.organizerNotes,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// BULK REFUND - For cancelled raffles
// ============================================================

export async function bulkRefundCancelledRaffle(raffleId: string): Promise<{
  success: boolean;
  processed?: number;
  failed?: number;
  total?: number;
  errors?: string[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        action: 'bulk-refund-cancelled',
        raffle_id: raffleId,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return {
      success: true,
      processed: data.processed,
      failed: data.failed,
      total: data.total,
      errors: data.errors,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// GET REFUND STATS
// ============================================================

export async function getRefundStats(raffleId?: string): Promise<RefundStats> {
  try {
    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: {
        action: 'refund-stats',
        raffle_id: raffleId,
      },
    });

    if (error || data?.error) {
      return {
        total: 0, pending: 0, approved: 0, denied: 0,
        refunded: 0, failed: 0, total_amount_refunded: 0, total_amount_pending: 0,
      };
    }

    return data.stats;
  } catch (err) {
    return {
      total: 0, pending: 0, approved: 0, denied: 0,
      refunded: 0, failed: 0, total_amount_refunded: 0, total_amount_pending: 0,
    };
  }
}
