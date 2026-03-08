import { supabase } from './supabase';
import { Dispute, DisputeMessage, DisputeStats } from './types';

// ============================================================
// CREATE DISPUTE - Participant escalates denied refund
// ============================================================

export async function createDispute(params: {
  refundRequestId: string;
  reason: string;
}): Promise<{ success: boolean; dispute?: Dispute; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: {
        action: 'create-dispute',
        refund_request_id: params.refundRequestId,
        reason: params.reason,
      },
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true, dispute: data.dispute };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// LIST DISPUTES
// ============================================================

export async function listDisputes(params?: {
  status?: string;
}): Promise<{ disputes: Dispute[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: {
        action: 'list-disputes',
        status: params?.status,
      },
    });

    if (error) return { disputes: [], error: error.message };
    if (data?.error) return { disputes: [], error: data.error };
    return { disputes: data.disputes || [] };
  } catch (err: any) {
    return { disputes: [], error: err.message };
  }
}

// ============================================================
// GET DISPUTE DETAIL with timeline
// ============================================================

export async function getDisputeDetail(disputeId: string): Promise<{
  dispute?: Dispute;
  messages: DisputeMessage[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: {
        action: 'get-dispute-detail',
        dispute_id: disputeId,
      },
    });

    if (error) return { messages: [], error: error.message };
    if (data?.error) return { messages: [], error: data.error };
    return { dispute: data.dispute, messages: data.messages || [] };
  } catch (err: any) {
    return { messages: [], error: err.message };
  }
}

// ============================================================
// ADD MESSAGE
// ============================================================

export async function addDisputeMessage(params: {
  disputeId: string;
  message: string;
  isInternal?: boolean;
}): Promise<{ success: boolean; message?: DisputeMessage; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: {
        action: 'add-message',
        dispute_id: params.disputeId,
        message: params.message,
        is_internal: params.isInternal || false,
      },
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// UPDATE STATUS - Admin only
// ============================================================

export async function updateDisputeStatus(params: {
  disputeId: string;
  newStatus: string;
  adminNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: {
        action: 'update-status',
        dispute_id: params.disputeId,
        new_status: params.newStatus,
        admin_notes: params.adminNotes,
      },
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// FORCE REFUND - Admin only
// ============================================================

export async function forceRefund(params: {
  disputeId: string;
  adminDecision: string;
  adminNotes?: string;
}): Promise<{ success: boolean; stripeRefundId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: {
        action: 'force-refund',
        dispute_id: params.disputeId,
        admin_decision: params.adminDecision,
        admin_notes: params.adminNotes,
      },
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true, stripeRefundId: data.stripe_refund_id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// DISPUTE STATS
// ============================================================

export async function getDisputeStats(): Promise<DisputeStats> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-disputes', {
      body: { action: 'dispute-stats' },
    });

    if (error || data?.error) {
      return { total: 0, open: 0, under_review: 0, resolved_participant: 0, resolved_organizer: 0, closed: 0 };
    }

    return data.stats;
  } catch {
    return { total: 0, open: 0, under_review: 0, resolved_participant: 0, resolved_organizer: 0, closed: 0 };
  }
}
