import { apiRequest } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Booking } from '../types/booking';

/** Calls `GET /api/bookings/my`: bookings the user made as a requester. */
export function fetchMyBookings(signal?: AbortSignal): Promise<Booking[]> {
  return apiRequest<Booking[]>(endpoints.bookingsMine, { signal });
}

/** Calls `GET /api/bookings/owner`: bookings for the spaces the user owns. */
export function fetchOwnerBookings(signal?: AbortSignal): Promise<Booking[]> {
  return apiRequest<Booking[]>(endpoints.bookingsOwner, { signal });
}

/** Calls `GET /api/bookings/{id}`. Only the two parties may read it. */
export function fetchBooking(id: number | string, signal?: AbortSignal): Promise<Booking> {
  return apiRequest<Booking>(endpoints.bookingById(id), { signal });
}
