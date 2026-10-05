/** Activity a space can be listed for. Values match the backend enum. */
export type ActivityType =
  | 'MARKET'
  | 'UNION_MEETING'
  | 'STUDENT_FEST'
  | 'EXHIBITION'
  | 'MEDICAL_CAMP'
  | 'BLOOD_DONATION'
  | 'WORKSHOP'
  | 'MEETING'
  | 'SPORTS'
  | 'CULTURAL_EVENT'
  | 'OTHER';

/** Facility a space can offer. Values match the backend enum. */
export type Facility =
  | 'PARKING'
  | 'ELECTRICITY'
  | 'WATER'
  | 'WASHROOMS'
  | 'LIGHTING'
  | 'STAGE'
  | 'SEATING'
  | 'ROAD_ACCESS'
  | 'PUBLIC_TRANSPORT';

export type AreaUnit = 'SQ_FT' | 'SQ_M' | 'SQ_YD' | 'ACRES' | 'HECTARES';

export type SpaceStatus = 'ACTIVE' | 'INACTIVE' | 'DELETED';

/**
 * Sort orders accepted by the API. `distance` only makes sense when the
 * request carries a latitude/longitude.
 */
export type SpaceSort = 'newest' | 'capacityDesc' | 'areaDesc' | 'distance';

/** One activity/price pair. */
export interface SpacePricing {
  id: number;
  activityType: ActivityType;
  activityLabel: string;
  price: number;
  isFree: boolean;
  ownerNote: string | null;
}

export interface SpacePhoto {
  id: number;
  imageUrl: string;
  displayOrder: number;
}

/** Public identity of a listing's owner (name only, no contact details). */
export interface SpaceOwner {
  id: number;
  name: string;
}

/** Listing as shown in cards and search results. */
export interface SpaceSummary {
  id: number;
  title: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  area: number;
  areaUnit: AreaUnit;
  capacity: number;
  primaryImageUrl: string | null;
  facilities: string[];
  pricing: SpacePricing[];
  fromPrice: number | null;
  freeActivities: string[];
  distanceKm: number | null;
  status: SpaceStatus;
  createdAt: string;
}

/** Full listing for the details page. */
export interface SpaceDetail extends Omit<SpaceSummary, 'primaryImageUrl'> {
  description: string;
  availability: string | null;
  ownerNote: string | null;
  photos: SpacePhoto[];
  owner: SpaceOwner;
  isOwner: boolean;
  updatedAt: string;
}

/** Body of `POST /api/spaces` and `PUT /api/spaces/{id}`. */
export interface SpacePayload {
  title: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  area: number;
  areaUnit: AreaUnit;
  capacity: number;
  availability: string | null;
  ownerNote: string | null;
  facilities: Facility[];
  pricing: SpacePricingPayload[];
  status?: SpaceStatus;
}

export interface SpacePricingPayload {
  activityType: ActivityType;
  isFree: boolean;
  price: number | null;
  ownerNote: string | null;
}

/** Filters accepted by `GET /api/spaces` and `GET /api/spaces/search`. */
export interface SpaceSearchFilters {
  q?: string;
  activity?: ActivityType | '';
  maxPrice?: number | '';
  minCapacity?: number | '';
  minArea?: number | '';
  maxArea?: number | '';
  facilities?: Facility[];
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  sort?: SpaceSort;
  page?: number;
  size?: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}
