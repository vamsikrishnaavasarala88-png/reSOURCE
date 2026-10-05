import { apiRequest, apiUpload } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Coordinates } from './locationService';
import type {
  PageResponse,
  SpaceDetail,
  SpacePayload,
  SpaceSearchFilters,
  SpaceSummary,
} from '../types/space';

/** True when at least one filter is set, which routes the request to search. */
function hasFilters(filters: SpaceSearchFilters): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'page' || key === 'size') {
      return false;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return value !== undefined && value !== null && value !== '';
  });
}

/** Builds a query string, dropping empty values so the backend sees only real filters. */
function toQuery(filters: SpaceSearchFilters): string {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
      return;
    }

    if (value === undefined || value === null || value === '') {
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();

  return query ? `?${query}` : '';
}

/**
 * Browses and searches spaces. Plain browsing uses `GET /api/spaces`, filtered
 * browsing uses `GET /api/spaces/search`; both accept the same parameters.
 *
 * The endpoints are public, but the access token is still sent when the visitor
 * is signed in: the backend uses it to mark the owner's own listings.
 */
export function fetchSpaces(
  filters: SpaceSearchFilters,
  signal?: AbortSignal,
): Promise<PageResponse<SpaceSummary>> {
  const path = hasFilters(filters) ? endpoints.spacesSearch : endpoints.spaces;

  return apiRequest<PageResponse<SpaceSummary>>(`${path}${toQuery(filters)}`, { signal });
}

/**
 * Calls `GET /api/spaces/{id}`. Public, with the token sent when available so
 * the response can include `isOwner` for the owner.
 */
export function fetchSpace(
  id: number | string,
  signal?: AbortSignal,
  /** The visitor's own position, so the backend can add `distanceKm` to the reply. */
  coordinates?: Coordinates | null,
): Promise<SpaceDetail> {
  const query = coordinates
    ? `?fromLatitude=${coordinates.latitude}&fromLongitude=${coordinates.longitude}`
    : '';

  return apiRequest<SpaceDetail>(endpoints.spaceById(id) + query, { signal });
}

/** Calls `GET /api/spaces/mine` for the signed-in owner's own listings. */
export function fetchMySpaces(signal?: AbortSignal): Promise<SpaceSummary[]> {
  return apiRequest<SpaceSummary[]>(endpoints.spacesMine, { signal });
}

/** Calls `POST /api/spaces`. The owner comes from the access token. */
export function createSpace(payload: SpacePayload): Promise<SpaceDetail> {
  return apiRequest<SpaceDetail>(endpoints.spaces, { method: 'POST', body: payload });
}

/** Calls `PUT /api/spaces/{id}`. The backend rejects anyone but the owner. */
export function updateSpace(id: number | string, payload: SpacePayload): Promise<SpaceDetail> {
  return apiRequest<SpaceDetail>(endpoints.spaceById(id), { method: 'PUT', body: payload });
}

/** Calls `DELETE /api/spaces/{id}`, which soft deletes the listing. */
export function deleteSpace(id: number | string): Promise<void> {
  return apiRequest<void>(endpoints.spaceById(id), { method: 'DELETE' });
}

/** Uploads one or more photos to `POST /api/spaces/{id}/photos`. */
export function uploadSpacePhotos(id: number | string, files: File[]): Promise<SpaceDetail> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  return apiUpload<SpaceDetail>(endpoints.spacePhotos(id), formData);
}

/** Calls `DELETE /api/spaces/{id}/photos/{photoId}` and returns the updated space. */
export function deleteSpacePhoto(id: number | string, photoId: number): Promise<SpaceDetail> {
  return apiRequest<SpaceDetail>(endpoints.spacePhoto(id, photoId), { method: 'DELETE' });
}

/** Persists a new photo order via `PUT /api/spaces/{id}/photos/order`. */
export function reorderSpacePhotos(
  id: number | string,
  photoIds: number[],
): Promise<SpaceDetail> {
  return apiRequest<SpaceDetail>(endpoints.spacePhotoOrder(id), {
    method: 'PUT',
    body: photoIds,
  });
}
