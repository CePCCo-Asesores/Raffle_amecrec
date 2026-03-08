import { supabase } from './supabase';
import { StripeConnectStatus } from './types';

// ============================================================
// STRIPE CHECKOUT - Create checkout session for ticket purchase
// ============================================================

export async function createCheckoutSession(params: {
  raffleId: string;
  raffleName: string;
  ticketNumbers: number[];
  pricePerTicket: number;
}): Promise<{ sessionId?: string; url?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: {
        action: 'create-checkout-session',
        raffle_id: params.raffleId,
        raffle_name: params.raffleName,
        ticket_numbers: params.ticketNumbers,
        price_per_ticket: params.pricePerTicket,
        success_url: `${window.location.origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}?payment=cancelled`,
      },
    });

    if (error) {
      console.error('Checkout session error:', error);
      return { error: error.message || 'Error al crear sesión de pago' };
    }

    if (data?.error) {
      return { error: data.error };
    }

    return {
      sessionId: data.session_id,
      url: data.url,
    };
  } catch (err: any) {
    console.error('Checkout exception:', err);
    return { error: err.message || 'Error inesperado al crear sesión de pago' };
  }
}

// ============================================================
// STRIPE CONNECT - Create Connect account for organizer
// ============================================================

export async function createConnectAccount(): Promise<{ connectId?: string; onboardingUrl?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: {
        action: 'create-connect-account',
        return_url: `${window.location.origin}?connect=complete`,
        refresh_url: `${window.location.origin}?connect=refresh`,
      },
    });

    if (error) {
      console.error('Connect account error:', error);
      return { error: error.message || 'Error al crear cuenta Connect' };
    }

    if (data?.error) {
      return { error: data.error };
    }

    return {
      connectId: data.connect_id,
      onboardingUrl: data.onboarding_url,
    };
  } catch (err: any) {
    console.error('Connect exception:', err);
    return { error: err.message || 'Error inesperado' };
  }
}

// ============================================================
// CHECK CONNECT STATUS
// ============================================================

export async function checkConnectStatus(): Promise<StripeConnectStatus> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: { action: 'check-connect-status' },
    });

    if (error || data?.error) {
      return {
        connected: false,
        status: 'not_connected',
      };
    }

    return {
      connected: data.connected,
      status: data.status,
      connect_id: data.connect_id,
      charges_enabled: data.charges_enabled,
      payouts_enabled: data.payouts_enabled,
      details_submitted: data.details_submitted,
    };
  } catch (err) {
    console.error('Connect status check error:', err);
    return {
      connected: false,
      status: 'not_connected',
    };
  }
}

// ============================================================
// VERIFY PAYMENT - Check if checkout session was completed
// ============================================================

export async function verifyPayment(sessionId: string): Promise<{
  status?: string;
  amount_total?: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: {
        action: 'verify-payment',
        session_id: sessionId,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return {
      status: data.status,
      amount_total: data.amount_total,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ============================================================
// HANDLE PAYMENT RETURN - Process URL params after Stripe redirect
// ============================================================

export function handlePaymentReturn(): {
  isPaymentReturn: boolean;
  status?: 'success' | 'cancelled';
  sessionId?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const sessionId = params.get('session_id');

  if (!payment) {
    return { isPaymentReturn: false };
  }

  // Clean URL
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, '', cleanUrl);

  return {
    isPaymentReturn: true,
    status: payment as 'success' | 'cancelled',
    sessionId: sessionId || undefined,
  };
}

// ============================================================
// HANDLE CONNECT RETURN - Process URL params after Connect redirect
// ============================================================

export function handleConnectReturn(): {
  isConnectReturn: boolean;
  status?: 'complete' | 'refresh';
} {
  const params = new URLSearchParams(window.location.search);
  const connect = params.get('connect');

  if (!connect) {
    return { isConnectReturn: false };
  }

  // Clean URL
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, '', cleanUrl);

  return {
    isConnectReturn: true,
    status: connect as 'complete' | 'refresh',
  };
}
