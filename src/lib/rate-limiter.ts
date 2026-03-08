import { RAFFLE_VALIDATION_RULES, RateLimitEntry } from './types';

class RateLimiter {
  private entries: RateLimitEntry[] = [];
  private readonly cleanupInterval = 60000; // 1 minute

  constructor() {
    // Periodically clean old entries
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  private cleanup() {
    const oneMinuteAgo = Date.now() - 60000;
    this.entries = this.entries.filter(e => e.timestamp > oneMinuteAgo);
  }

  /**
   * Check if a user can perform a ticket purchase action
   */
  canPurchaseTickets(userId: string, ticketCount: number): { allowed: boolean; reason?: string } {
    // Check max tickets per transaction
    if (ticketCount > RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction) {
      return {
        allowed: false,
        reason: `Máximo ${RAFFLE_VALIDATION_RULES.maxTicketsPerTransaction} boletos por transacción`,
      };
    }

    // Check rate limit (tickets per minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentPurchases = this.entries.filter(
      e => e.userId === userId && e.action === 'ticket_purchase' && e.timestamp > oneMinuteAgo
    );

    const recentTicketCount = recentPurchases.length;
    if (recentTicketCount + ticketCount > RAFFLE_VALIDATION_RULES.maxTicketsPerMinute) {
      return {
        allowed: false,
        reason: `Límite de ${RAFFLE_VALIDATION_RULES.maxTicketsPerMinute} boletos por minuto alcanzado. Intenta de nuevo en un momento.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a purchase action for rate limiting
   */
  recordPurchase(userId: string, ticketCount: number) {
    const now = Date.now();
    for (let i = 0; i < ticketCount; i++) {
      this.entries.push({
        userId,
        action: 'ticket_purchase',
        timestamp: now,
      });
    }
  }

  /**
   * General rate limit check for any action
   */
  canPerformAction(userId: string, action: string, maxPerMinute: number): { allowed: boolean; reason?: string } {
    const oneMinuteAgo = Date.now() - 60000;
    const recentActions = this.entries.filter(
      e => e.userId === userId && e.action === action && e.timestamp > oneMinuteAgo
    );

    if (recentActions.length >= maxPerMinute) {
      return {
        allowed: false,
        reason: `Demasiadas solicitudes. Máximo ${maxPerMinute} por minuto. Intenta de nuevo en un momento.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a general action
   */
  recordAction(userId: string, action: string) {
    this.entries.push({
      userId,
      action,
      timestamp: Date.now(),
    });
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
