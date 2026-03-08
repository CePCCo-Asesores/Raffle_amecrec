export type UserRole = 'admin' | 'organizer' | 'participant';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  stripe_customer_id?: string;
  stripe_connect_id?: string;
  stripe_connect_status: 'not_connected' | 'pending' | 'active' | 'disabled';
  onboarding_completed: boolean;
  payment_instructions?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price_monthly: number;
  max_active_raffles: number;
  max_tickets_per_raffle: number;
  features: string[];
  is_active: boolean;
  created_at: string;
}

export interface OrganizerSubscription {
  id: string;
  organizer_id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'cancelled' | 'suspended';
  stripe_subscription_id?: string;
  current_period_start?: string;
  current_period_end?: string;
  created_at: string;
  plan?: SubscriptionPlan;
}

// IMPROVED: Expanded raffle status with irreversible flow
// Draft → Active → Closed → Validated → Locked
export type RaffleStatus = 'draft' | 'active' | 'closed' | 'validated' | 'locked' | 'winner_declared' | 'cancelled';
export type PaymentMethod = 'stripe' | 'external';
export type UnsoldWinnerPolicy = 'desert' | 'redraw' | 'absorb' | 'extend';
export type LotteryType = 'Mayor' | 'Superior' | 'Zodiaco' | 'Especial' | 'Gordo' | 'Otro';

// State machine: allowed transitions
export const RAFFLE_STATUS_TRANSITIONS: Record<RaffleStatus, RaffleStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: ['validated'],
  validated: ['locked'],
  locked: ['winner_declared'],
  winner_declared: [], // Terminal state - no further transitions
  cancelled: [], // Terminal state
};

export const RAFFLE_STATUS_LABELS: Record<RaffleStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  closed: 'Cerrada',
  validated: 'Validada',
  locked: 'Bloqueada',
  winner_declared: 'Con Ganador',
  cancelled: 'Cancelada',
};

export const RAFFLE_STATUS_COLORS: Record<RaffleStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-amber-100 text-amber-700',
  validated: 'bg-blue-100 text-blue-700',
  locked: 'bg-indigo-100 text-indigo-700',
  winner_declared: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

export interface Raffle {
  id: string;
  organizer_id: string;
  name: string;
  description?: string;
  image_url?: string;
  price_per_ticket: number;
  total_tickets: number;
  sales_close_date: string;
  draw_date: string;
  payment_method: PaymentMethod;
  unsold_winner_policy: UnsoldWinnerPolicy;
  status: RaffleStatus;
  lottery_type?: string;
  lottery_draw_date?: string;
  lottery_draw_number?: string;
  winning_number?: number;
  winner_ticket_id?: string;
  winner_evidence_url?: string;
  winner_declared_at?: string;
  tickets_sold: number;
  revenue: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  organizer?: Profile;
  // NEW: Immutability fields
  result_locked: boolean;
  result_locked_at?: string;
  result_locked_by?: string;
}

export type TicketStatus = 'available' | 'reserved' | 'sold' | 'paid';

export interface Ticket {
  id: string;
  raffle_id: string;
  ticket_number: number;
  participant_id?: string;
  status: TicketStatus;
  reserved_at?: string;
  purchased_at?: string;
  payment_method?: string;
  stripe_payment_id?: string;
  marked_paid_by?: string;
  marked_paid_at?: string;
  created_at: string;
  participant?: Profile;
  // NEW: Commission tracking per ticket
  commission_rate?: number;
  commission_amount?: number;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  related_raffle_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: 'ticket_purchase' | 'subscription' | 'commission' | 'refund';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payer_id?: string;
  receiver_id?: string;
  raffle_id?: string;
  ticket_id?: string;
  stripe_payment_intent_id?: string;
  commission_amount: number;
  commission_rate?: number;
  description?: string;
  created_at: string;
}

// IMPROVED: Comprehensive audit log
export interface AuditLog {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

// NEW: Financial Ledger for formal accounting
export type LedgerEntryType = 'ticket_sale' | 'platform_commission' | 'organizer_income' | 'subscription_payment' | 'refund';

export interface FinancialLedger {
  id: string;
  entry_type: LedgerEntryType;
  amount: number;
  currency: string;
  description: string;
  raffle_id?: string;
  ticket_id?: string;
  payer_id?: string;
  receiver_id?: string;
  commission_rate_applied?: number;
  commission_amount_calculated?: number;
  transaction_id?: string;
  created_at: string;
  // Immutable: once created, never updated
}

// NEW: Raffle Results Log for immutability
export interface RaffleResultsLog {
  id: string;
  raffle_id: string;
  winning_number: number;
  lottery_type: string;
  lottery_draw_number: string;
  lottery_draw_date: string;
  registered_by: string;
  registered_at: string;
  result_hash: string; // SHA-256 hash for tamper detection
  evidence_url?: string;
  is_official: boolean;
  // Audit trail
  previous_result_id?: string;
  change_reason?: string;
}

export interface PlatformConfig {
  id: string;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

// NEW: Rate limiting tracking
export interface RateLimitEntry {
  userId: string;
  action: string;
  timestamp: number;
}


export type AppView = 
  | 'landing' 
  | 'admin-dashboard' 
  | 'organizer-dashboard' 
  | 'organizer-create-raffle'
  | 'organizer-raffle-detail'
  | 'organizer-closing-flow'
  | 'participant-dashboard'
  | 'raffle-explorer'
  | 'raffle-detail'
  | 'raffle-public'
  | 'notification-preferences';


// Dispute types
export type DisputeStatus = 'open' | 'under_review' | 'resolved_participant' | 'resolved_organizer' | 'closed';

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Abierta',
  under_review: 'En Revisión',
  resolved_participant: 'Resuelta (Participante)',
  resolved_organizer: 'Resuelta (Organizador)',
  closed: 'Cerrada',
};

export const DISPUTE_STATUS_COLORS: Record<DisputeStatus, string> = {
  open: 'bg-red-100 text-red-700',
  under_review: 'bg-amber-100 text-amber-700',
  resolved_participant: 'bg-emerald-100 text-emerald-700',
  resolved_organizer: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-700',
};

export type DisputeMessageType = 'message' | 'status_change' | 'admin_action' | 'force_refund' | 'evidence' | 'system';

export interface Dispute {
  id: string;
  refund_request_id: string;
  raffle_id: string;
  ticket_id: string;
  participant_id: string;
  organizer_id: string;
  ticket_number: number;
  amount: number;
  currency: string;
  status: DisputeStatus;
  reason: string;
  admin_notes?: string;
  admin_decision?: string;
  assigned_admin_id?: string;
  force_refund: boolean;
  stripe_refund_id?: string;
  resolution_summary?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  // Enriched fields
  participant_name?: string;
  participant_email?: string;
  organizer_name?: string;
  organizer_email?: string;
  raffle_name?: string;
  raffle_status?: string;
  refund_reason?: string;
  refund_organizer_notes?: string;
  assigned_admin_name?: string;
}

export interface DisputeMessage {
  id: string;
  dispute_id: string;
  sender_id: string;
  sender_role: 'participant' | 'organizer' | 'admin' | 'system';
  sender_name?: string;
  message: string;
  message_type: DisputeMessageType;
  metadata?: Record<string, any>;
  is_internal: boolean;
  created_at: string;
}

export interface DisputeStats {
  total: number;
  open: number;
  under_review: number;
  resolved_participant: number;
  resolved_organizer: number;
  closed: number;
}


// Notification Preferences
export interface NotificationPreferences {
  id?: string;
  user_id?: string;
  ticket_purchase_email: boolean;
  raffle_closed_email: boolean;
  winner_declared_email: boolean;
  sales_threshold_email: boolean;
  marketing_email: boolean;
  created_at?: string;
  updated_at?: string;
}

// Email Log
export interface EmailLog {
  id: string;
  recipient_email: string;
  recipient_user_id?: string;
  email_type: string;
  subject: string;
  raffle_id?: string;
  status: 'sent' | 'delivered' | 'failed' | 'bounced';
  error_message?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// Stripe Checkout Session
export interface StripeCheckoutSession {
  id: string;
  session_id: string;
  user_id: string;
  raffle_id: string;
  ticket_numbers: number[];
  amount_total: number;
  currency: string;
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  stripe_payment_intent_id?: string;
  created_at: string;
  completed_at?: string;
}

// Stripe Connect Status
export interface StripeConnectStatus {
  connected: boolean;
  status: 'not_connected' | 'pending' | 'active' | 'disabled';
  connect_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

// Refund Request
export type RefundStatus = 'pending' | 'approved' | 'denied' | 'processing' | 'refunded' | 'failed';

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  denied: 'Rechazado',
  processing: 'Procesando',
  refunded: 'Reembolsado',
  failed: 'Fallido',
};

export const REFUND_STATUS_COLORS: Record<RefundStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  denied: 'bg-red-100 text-red-700',
  processing: 'bg-indigo-100 text-indigo-700',
  refunded: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

export interface RefundRequest {
  id: string;
  ticket_id: string;
  raffle_id: string;
  participant_id: string;
  organizer_id: string;
  ticket_number: number;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  stripe_payment_id?: string;
  stripe_refund_id?: string;
  organizer_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  refunded_at?: string;
  created_at: string;
  updated_at: string;
  // Enriched fields from edge function
  participant_name?: string;
  participant_email?: string;
  raffle_name?: string;
  raffle_status?: string;
  raffle_payment_method?: string;
}

export interface RefundStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  refunded: number;
  failed: number;
  total_amount_refunded: number;
  total_amount_pending: number;
}

// Validation rules
export const RAFFLE_VALIDATION_RULES = {
  // Cannot activate without official lottery date
  requireLotteryDateForActivation: true,
  // Cannot close without sold tickets
  requireSoldTicketsForClose: true,
  // Cannot validate if not closed
  requireClosedForValidation: true,
  // Cannot modify price after active
  immutablePriceAfterActive: true,
  // Cannot change tickets after any sale
  immutableTicketsAfterSale: true,
  // Cannot modify prize after activation
  immutablePrizeAfterActive: true,
  // Cannot delete raffle with sold tickets
  preventDeleteWithSoldTickets: true,
  // Max tickets per transaction
  maxTicketsPerTransaction: 10,
  // Max tickets per minute per user
  maxTicketsPerMinute: 20,
};
