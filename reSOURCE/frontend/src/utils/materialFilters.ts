import type {
  MaterialCategory,
  MaterialCondition,
  MaterialSearchFilters,
  MaterialSort,
} from '../types/material';

/**
 * Draft material filters. Numbers stay as strings so the inputs behave while the
 * user types; they are converted when the request is built.
 */
export interface MaterialFilterDraft {
  q: string;
  category: MaterialCategory | '';
  condition: MaterialCondition | '';
  minQuantity: string;
  unit: string;
  maxPrice: string;
  freeOnly: boolean;
  sort: MaterialSort;
  radiusKm: string;
}

export const EMPTY_MATERIAL_FILTER_DRAFT: MaterialFilterDraft = {
  q: '',
  category: '',
  condition: '',
  minQuantity: '',
  unit: '',
  maxPrice: '',
  freeOnly: false,
  sort: 'newest',
  radiusKm: '5',
};

/** Sorts the API understands. `distance` needs a latitude and longitude. */
export const MATERIAL_SORT_OPTIONS: ReadonlyArray<{ value: MaterialSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'priceAsc', label: 'Price: low to high' },
  { value: 'priceDesc', label: 'Price: high to low' },
  { value: 'distance', label: 'Nearest first' },
];

export const MATERIAL_RADIUS_OPTIONS = ['1', '2', '5', '10', '25', '50'];

/** The user's position, if they chose to share one. */
export interface UserLocation {
  latitude: number;
  longitude: number;
  approximate: boolean;
}

export type LocationStatus = 'idle' | 'requesting' | 'denied' | 'unavailable' | 'ready';

/**
 * Builds the request parameters.
 *
 * <p>The quantity filter is only sent with a unit: the backend refuses a
 * quantity without one rather than comparing 200 kg against 200 pieces.</p>
 */
export function toMaterialSearchQuery(
  draft: MaterialFilterDraft,
  location: UserLocation | null,
  page: number,
  size: number,
): MaterialSearchFilters {
  const toNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
  const minQuantity = toNumber(draft.minQuantity);

  return {
    q: draft.q.trim() === '' ? undefined : draft.q.trim(),
    category: draft.category || undefined,
    condition: draft.condition || undefined,
    minQuantity,
    unit: minQuantity === undefined ? undefined : draft.unit || undefined,
    maxPrice: draft.freeOnly ? undefined : toNumber(draft.maxPrice),
    freeOnly: draft.freeOnly || undefined,
    latitude: location?.latitude,
    longitude: location?.longitude,
    radiusKm: location ? Number(draft.radiusKm) : undefined,
    sort: location || draft.sort !== 'distance' ? draft.sort : 'newest',
    page,
    size,
  };
}

/** Stable string for a query, used to tell whether the results match the filters. */
export function materialQueryKey(query: MaterialSearchFilters): string {
  return JSON.stringify(query);
}

/** Counts the filters a user has actually set, for the "Clear filters" label. */
export function countActiveMaterialFilters(
  draft: MaterialFilterDraft,
  location: UserLocation | null,
): number {
  return [
    draft.q.trim() ? 1 : 0,
    draft.category ? 1 : 0,
    draft.condition ? 1 : 0,
    draft.minQuantity.trim() ? 1 : 0,
    draft.maxPrice.trim() && !draft.freeOnly ? 1 : 0,
    draft.freeOnly ? 1 : 0,
    location ? 1 : 0,
  ].reduce((total, value) => total + value, 0);
}
