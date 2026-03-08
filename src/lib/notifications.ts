import { supabase } from './supabase';
import { NotificationPreferences, EmailLog } from './types';

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

const DEFAULT_PREFERENCES: NotificationPreferences = {
  ticket_purchase_email: true,
  raffle_closed_email: true,
  winner_declared_email: true,
  sales_threshold_email: true,
  marketing_email: false,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data, error } = await supabase.functions.invoke('send-notifications', {
      body: { action: 'get-preferences' },
    });

    if (error || data?.error) {
      console.error('Get preferences error:', error || data?.error);
      return DEFAULT_PREFERENCES;
    }

    return data.preferences || DEFAULT_PREFERENCES;
  } catch (err) {
    console.error('Get preferences exception:', err);
    return DEFAULT_PREFERENCES;
  }
}

export async function updateNotificationPreferences(
  preferences: Partial<NotificationPreferences>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-notifications', {
      body: {
        action: 'update-preferences',
        preferences,
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
// EMAIL LOG
// ============================================================

export async function getEmailLog(): Promise<EmailLog[]> {
  try {
    const { data, error } = await supabase.functions.invoke('send-notifications', {
      body: { action: 'get-email-log' },
    });

    if (error || data?.error) {
      return [];
    }

    return data.logs || [];
  } catch (err) {
    console.error('Get email log error:', err);
    return [];
  }
}

// ============================================================
// TRIGGER NOTIFICATIONS (called from frontend after actions)
// ============================================================

export async function sendTicketPurchaseNotification(params: {
  userId: string;
  raffleId: string;
  ticketNumbers: number[];
  amount: number;
  paymentMethod: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-notifications', {
      body: {
        action: 'ticket-purchase',
        user_id: params.userId,
        raffle_id: params.raffleId,
        ticket_numbers: params.ticketNumbers,
        amount: params.amount,
        payment_method: params.paymentMethod,
      },
    });
  } catch (err) {
    console.error('Failed to send purchase notification:', err);
    // Non-blocking - don't throw
  }
}

export async function sendRaffleClosedNotification(raffleId: string): Promise<void> {
  try {
    await supabase.functions.invoke('send-notifications', {
      body: {
        action: 'raffle-closed',
        raffle_id: raffleId,
      },
    });
  } catch (err) {
    console.error('Failed to send raffle closed notification:', err);
  }
}

export async function sendWinnerDeclaredNotification(params: {
  raffleId: string;
  winningNumber: number;
  resultHash?: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-notifications', {
      body: {
        action: 'winner-declared',
        raffle_id: params.raffleId,
        winning_number: params.winningNumber,
        result_hash: params.resultHash,
      },
    });
  } catch (err) {
    console.error('Failed to send winner notification:', err);
  }
}

export async function sendSalesThresholdNotification(params: {
  raffleId: string;
  raffleName: string;
  organizerId: string;
  soldCount: number;
  totalTickets: number;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-notifications', {
      body: {
        action: 'sales-threshold',
        raffle_id: params.raffleId,
        raffle_name: params.raffleName,
        organizer_id: params.organizerId,
        sold_count: params.soldCount,
        total_tickets: params.totalTickets,
      },
    });
  } catch (err) {
    console.error('Failed to send threshold notification:', err);
  }
}
