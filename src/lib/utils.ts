import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a ticket number with zero-padding based on total tickets.
 * Tickets are numbered from 0 to totalTickets-1.
 * 
 * Examples:
 *   formatTicketNumber(0, 100)    → "00"
 *   formatTicketNumber(99, 100)   → "99"
 *   formatTicketNumber(0, 1000)   → "000"
 *   formatTicketNumber(42, 1000)  → "042"
 *   formatTicketNumber(0, 100000) → "00000"
 *   formatTicketNumber(7, 10)     → "7"
 */
export function formatTicketNumber(ticketNumber: number, totalTickets: number): string {
  if (totalTickets <= 1) return ticketNumber.toString();
  const maxNumber = totalTickets - 1;
  const digits = maxNumber.toString().length;
  return ticketNumber.toString().padStart(digits, '0');
}

/**
 * Get the number of digits needed for ticket display.
 * E.g. 100 tickets → 2 digits, 1000 → 3, 100000 → 5
 */
export function getTicketDigits(totalTickets: number): number {
  if (totalTickets <= 1) return 1;
  return (totalTickets - 1).toString().length;
}
