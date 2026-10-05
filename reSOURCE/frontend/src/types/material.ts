import type { PageResponse } from './space';

/** Category of surplus material. Values match the backend enum. */
export type MaterialCategory =
  | 'BRICKS'
  | 'CEMENT'
  | 'TILES'
  | 'WOOD'
  | 'METAL'
  | 'PIPES'
  | 'SAND'
  | 'STONE'
  | 'OTHER';

/** How the owner describes the state of the material. Values match the backend. */
export type MaterialCondition = 'NEW' | 'GOOD' | 'USED' | 'DAMAGED';

export type MaterialStatus = 'ACTIVE' | 'INACTIVE' | 'DELETED';

/** Sort orders accepted by the API. */
export type MaterialSort = 'newest' | 'priceAsc' | 'priceDesc' | 'distance';

export interface MaterialPhoto {
  id: number;
  imageUrl: string;
  displayOrder: number;
}

/** Public identity of a listing's owner: name only, never contact details. */
export interface MaterialOwner {
  id: number;
  name: string;
}

/** Listing as shown in the marketplace grid. */
export interface MaterialSummary {
  id: number;
  title: string;
  category: MaterialCategory;
  categoryLabel: string;
  quantity: number;
  unit: string;
  condition: MaterialCondition;
  conditionLabel: string;
  price: number;
  isFree: boolean;
  address: string;
  latitude: number | null;
  longitude: number | null;
  primaryImageUrl: string | null;
  distanceKm: number | null;
  status: MaterialStatus;
  createdAt: string;
}

/** Full listing for the details page. */
export interface MaterialDetail extends Omit<MaterialSummary, 'primaryImageUrl'> {
  description: string;
  ownerNote: string | null;
  photos: MaterialPhoto[];
  owner: MaterialOwner;
  /** True when the signed-in user owns this listing. */
  isOwner: boolean;
  updatedAt: string;
}

/**
 * Body of `POST /api/materials` and `PUT /api/materials/{id}`.
 * The owner always comes from the access token.
 */
export interface MaterialPayload {
  title: string;
  category: MaterialCategory;
  description: string;
  quantity: number;
  unit: string;
  condition: MaterialCondition;
  price: number;
  isFree: boolean;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  ownerNote?: string | null;
  /** Only sent when updating: the owner can pause or resume a listing. */
  status?: MaterialStatus;
}

/** Query parameters accepted by `GET /api/materials`. */
export interface MaterialSearchFilters {
  q?: string;
  category?: MaterialCategory;
  condition?: MaterialCondition;
  /** Only meaningful together with `unit`: quantities are never compared across units. */
  minQuantity?: number;
  unit?: string;
  /** 0 means free only, matching the space marketplace. */
  maxPrice?: number;
  freeOnly?: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  sort?: MaterialSort;
  page?: number;
  size?: number;
}

export type { PageResponse };
