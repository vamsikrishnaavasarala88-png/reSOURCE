import type { ContactDetails, RequestParty, ResourceType, SpaceRef } from './request';

/** Life cycle of a booking. Values match the backend enum. */
export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

/**
 * A confirmed booking, created when an owner accepts a request.
 *
 * `amount` is the owner's price for the activity (0 when the owner marked it
 * free), `platformFee` is 0 because no payment processing exists in this phase,
 * and `totalAmount` is their sum. Nothing here claims money changed hands.
 */
export interface Booking {
  id: number;
  requestId: number | null;
  resourceType: ResourceType;
  resourceId: number;
  space: SpaceRef;
  owner: RequestParty;
  requester: RequestParty;
  bookingDate: string;
  startTime: string;
  endTime: string;
  amount: number;
  platformFee: number;
  totalAmount: number;
  status: BookingStatus;
  statusLabel: string;
  /** The other party's contact details, only for a confirmed booking. */
  contact: ContactDetails | null;
  createdAt: string;
}
