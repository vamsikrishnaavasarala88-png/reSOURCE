import type { ActivityType } from './space';
import type { Booking } from './booking';

/** Life cycle of a request. Values match the backend enum. */
export type RequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

/** What the signed-in user is to a request. */
export type ViewerRole = 'REQUESTER' | 'OWNER';

/** What a request is about: a space booking enquiry or a material request. */
export type ResourceType = 'SPACE' | 'MATERIAL';

/** Public identity of a party. Names only: contact details come separately. */
export interface RequestParty {
  id: number;
  name: string;
}

/** Minimal reference to a space inside a request or booking. */
export interface SpaceRef {
  id: number;
  title: string;
  address: string;
}

/** Minimal reference to a material inside a request. */
export interface MaterialRef {
  id: number;
  title: string;
  categoryLabel: string;
  primaryImageUrl: string | null;
}

/**
 * Contact details of the other party of a confirmed booking.
 *
 * <p>The API only sends this once a request was accepted and the booking is
 * confirmed, and only to the two parties, so `null` means "not yours to see".</p>
 */
export interface ContactDetails {
  userId: number;
  name: string;
  phone: string | null;
  email: string;
}

/** One row in "My requests" or "Incoming requests". */
export interface RequestSummary {
  id: number;
  resourceType: ResourceType;
  /** Space requests only; `null` for a material request. */
  spaceId: number | null;
  spaceTitle: string | null;
  spaceAddress: string | null;
  /** Material requests only; `null` for a space request. */
  material: MaterialRef | null;
  quantityRequested: number | null;
  unit: string | null;
  /** Space requests only. */
  purpose: ActivityType | null;
  purposeLabel: string | null;
  requestDate: string | null;
  startTime: string | null;
  endTime: string | null;
  expectedPeople: number | null;
  message: string | null;
  status: RequestStatus;
  statusLabel: string;
  amount: number | null;
  isFree: boolean;
  bookingId: number | null;
  /** What the signed-in user is to this request. */
  viewerRole: ViewerRole;
  /** The other party, name only: the requester for an owner, the owner for a requester. */
  counterpart: RequestParty;
  createdAt: string;
}

/** Full request, as shown on the details page. */
export interface RequestDetail {
  id: number;
  resourceType: ResourceType;
  /** `null` for a material request. */
  space: SpaceRef | null;
  /** `null` for a space request. */
  material: MaterialRef | null;
  quantityRequested: number | null;
  unit: string | null;
  requester: RequestParty;
  owner: RequestParty;
  /** Space requests only. */
  purpose: ActivityType | null;
  purposeLabel: string | null;
  requestDate: string | null;
  startTime: string | null;
  endTime: string | null;
  expectedPeople: number | null;
  message: string | null;
  status: RequestStatus;
  statusLabel: string;
  /** The owner's configured price for this activity. */
  price: number | null;
  /** 0 when the activity is free for this space. */
  amount: number | null;
  isFree: boolean;
  viewerRole: ViewerRole;
  booking: Booking | null;
  contact: ContactDetails | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body of `POST /api/requests`. The requester comes from the token.
 *
 * <p>A space request fills the activity, date, time and people fields; a material
 * request fills `resourceId` with the material id and says how much is needed.
 * The backend validates whichever set matches `resourceType`.</p>
 */
export interface RequestPayload {
  resourceType: ResourceType;
  resourceId: number;
  /** The activity the space is needed for, as an ActivityType name. */
  purpose?: ActivityType;
  requestDate?: string;
  startTime?: string;
  endTime?: string;
  expectedPeople?: number;
  /** Material requests only: how much of the listing is wanted. */
  quantityRequested?: number;
  message?: string | null;
}
