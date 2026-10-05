import type { BookingStatus } from '../types/booking';
import type { RequestStatus } from '../types/request';

/** Wording for each request status, straight from the spec. */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Awaiting owner response',
  ACCEPTED: 'Booking confirmed',
  REJECTED: 'Request rejected',
  CANCELLED: 'Request cancelled',
  COMPLETED: 'Completed',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: 'Booking confirmed',
  CANCELLED: 'Booking cancelled',
  COMPLETED: 'Completed',
};

export type StatusTone = 'pending' | 'confirmed' | 'rejected' | 'neutral';

/** Colour family for a status badge. Deliberately few and quiet. */
export function requestStatusTone(status: RequestStatus | BookingStatus): StatusTone {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'ACCEPTED':
    case 'CONFIRMED':
      return 'confirmed';
    case 'REJECTED':
      return 'rejected';
    default:
      return 'neutral';
  }
}

/** `09:00:00` from the API becomes `09:00`. */
export function formatTime(value: string): string {
  return value.slice(0, 5);
}

/** A date and a time range, e.g. `20 Oct 2026 · 09:00-14:00`. */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)}-${formatTime(endTime)}`;
}

/** Turns an amount from the API into `₹500`, `₹0` or a dash when unknown. */
export function formatAmount(amount: number | null | undefined, isFree = false): string {
  if (isFree) {
    return 'FREE';
  }

  if (amount === null || amount === undefined) {
    return '—';
  }

  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

/**
 * Long form date, e.g. `20 October 2026`.
 *
 * <p>Accepts both a plain date (`2026-10-20`) and a timestamp
 * (`2026-10-20T09:15:00Z`) so the same helper can render a request date and the
 * moment a request was sent.</p>
 */
export function formatLongDate(value: string): string {
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
