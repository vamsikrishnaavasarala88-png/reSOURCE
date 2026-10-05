import type { ActivityType, AreaUnit, Facility, SpaceSort } from '../types/space';

/**
 * Draft search filters. Numbers stay as strings so the inputs behave while the
 * user is typing; they are converted when the request is built.
 */
export interface SpaceFilterDraft {
  activity: ActivityType | '';
  maxPrice: string;
  minCapacity: string;
  minArea: string;
  maxArea: string;
  facilities: Facility[];
  sort: SpaceSort;
  radiusKm: string;
}

export const EMPTY_FILTER_DRAFT: SpaceFilterDraft = {
  activity: '',
  maxPrice: '',
  minCapacity: '',
  minArea: '',
  maxArea: '',
  facilities: [],
  sort: 'newest',
  radiusKm: '5',
};

export interface UserLocation {
  latitude: number;
  longitude: number;
  /** True when the coordinates were rounded before being used. */
  approximate: boolean;
}

export type LocationStatus = 'idle' | 'requesting' | 'denied' | 'unavailable' | 'ready';

/** Sorts the API understands. `distance` needs a latitude and longitude. */
export const SORT_OPTIONS: ReadonlyArray<{ value: SpaceSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'capacityDesc', label: 'Most capacity' },
  { value: 'areaDesc', label: 'Largest area' },
  { value: 'distance', label: 'Nearest first' },
];

export const RADIUS_OPTIONS = ['1', '2', '5', '10', '25', '50'];

export interface SpaceSearchQuery {
  activity?: ActivityType;
  maxPrice?: number;
  minCapacity?: number;
  minArea?: number;
  maxArea?: number;
  facilities?: Facility[];
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  sort: SpaceSort;
  page: number;
  size: number;
}

/** Builds the request parameters, dropping everything the user left empty. */
export function toSearchQuery(
  draft: SpaceFilterDraft,
  location: UserLocation | null,
  page: number,
  size: number,
): SpaceSearchQuery {
  const toNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));

  return {
    activity: draft.activity || undefined,
    maxPrice: toNumber(draft.maxPrice),
    minCapacity: toNumber(draft.minCapacity),
    minArea: toNumber(draft.minArea),
    maxArea: toNumber(draft.maxArea),
    facilities: draft.facilities.length ? draft.facilities : undefined,
    latitude: location?.latitude,
    longitude: location?.longitude,
    radiusKm: location ? Number(draft.radiusKm) : undefined,
    // Distance sorting without coordinates falls back to newest first.
    sort: location || draft.sort !== 'distance' ? draft.sort : 'newest',
    page,
    size,
  };
}

/**
 * Stable string for a query, used to tell whether the results on screen still
 * match the filters the user has set.
 */
export function queryKey(query: SpaceSearchQuery): string {
  return JSON.stringify(query);
}

/** Counts the filters a user has actually set, for the "Clear filters" label. */
export function countActiveFilters(
  draft: SpaceFilterDraft,
  location: UserLocation | null,
): number {
  return [
    draft.activity ? 1 : 0,
    draft.maxPrice.trim() ? 1 : 0,
    draft.minCapacity.trim() ? 1 : 0,
    draft.minArea.trim() ? 1 : 0,
    draft.maxArea.trim() ? 1 : 0,
    draft.facilities.length,
    location ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}

/** Area filter values are always compared in square feet. */
export const AREA_FILTER_UNIT: AreaUnit = 'SQ_FT';
