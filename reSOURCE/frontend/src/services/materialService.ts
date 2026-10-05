import { apiRequest, apiUpload } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { Coordinates } from './locationService';
import type {
  MaterialDetail,
  MaterialPayload,
  MaterialSearchFilters,
  MaterialSummary,
  PageResponse,
} from '../types/material';

/** True when at least one filter is set, which routes the request to search. */
function hasFilters(filters: MaterialSearchFilters): boolean {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'page' || key === 'size') {
      return false;
    }

    return value !== undefined && value !== null && value !== '';
  });
}

/** Builds a query string, dropping empty values so the backend sees only real filters. */
function toQuery(filters: MaterialSearchFilters): string {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();

  return query ? `?${query}` : '';
}

/**
 * Browses and searches materials. Plain browsing uses `GET /api/materials`,
 * filtered browsing uses `GET /api/materials/search`; both accept the same
 * parameters. The endpoints are public, but the token is sent when the visitor is
 * signed in so the backend can mark the owner's own listings.
 */
export function fetchMaterials(
  filters: MaterialSearchFilters,
  signal?: AbortSignal,
): Promise<PageResponse<MaterialSummary>> {
  const path = hasFilters(filters) ? endpoints.materialsSearch : endpoints.materials;

  return apiRequest<PageResponse<MaterialSummary>>(`${path}${toQuery(filters)}`, { signal });
}

/** Calls `GET /api/materials/{id}`. Public; the token marks ownership. */
export function fetchMaterial(
  id: number | string,
  signal?: AbortSignal,
  /** The visitor's own position, so the backend can add `distanceKm` to the reply. */
  coordinates?: Coordinates | null,
): Promise<MaterialDetail> {
  const query = coordinates
    ? `?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}`
    : '';

  return apiRequest<MaterialDetail>(endpoints.materialById(id) + query, { signal });
}

/** Calls `GET /api/materials/mine` for the signed-in owner's own listings. */
export function fetchMyMaterials(signal?: AbortSignal): Promise<MaterialSummary[]> {
  return apiRequest<MaterialSummary[]>(endpoints.materialsMine, { signal });
}

/** Calls `POST /api/materials`. The owner comes from the access token. */
export function createMaterial(payload: MaterialPayload): Promise<MaterialDetail> {
  return apiRequest<MaterialDetail>(endpoints.materials, { method: 'POST', body: payload });
}

/** Calls `PUT /api/materials/{id}`. The backend rejects anyone but the owner. */
export function updateMaterial(
  id: number | string,
  payload: MaterialPayload,
): Promise<MaterialDetail> {
  return apiRequest<MaterialDetail>(endpoints.materialById(id), { method: 'PUT', body: payload });
}

/** Calls `DELETE /api/materials/{id}`, which soft deletes the listing. */
export function deleteMaterial(id: number | string): Promise<void> {
  return apiRequest<void>(endpoints.materialById(id), { method: 'DELETE' });
}

/** Uploads one or more photos to `POST /api/materials/{id}/photos`. */
export function uploadMaterialPhotos(id: number | string, files: File[]): Promise<MaterialDetail> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  return apiUpload<MaterialDetail>(endpoints.materialPhotos(id), formData);
}

/** Calls `DELETE /api/materials/{id}/photos/{photoId}` and returns the updated listing. */
export function deleteMaterialPhoto(id: number | string, photoId: number): Promise<MaterialDetail> {
  return apiRequest<MaterialDetail>(endpoints.materialPhoto(id, photoId), { method: 'DELETE' });
}

/** Persists a new photo order via `PUT /api/materials/{id}/photos/order`. */
export function reorderMaterialPhotos(
  id: number | string,
  photoIds: number[],
): Promise<MaterialDetail> {
  return apiRequest<MaterialDetail>(endpoints.materialPhotoOrder(id), {
    method: 'PUT',
    body: photoIds,
  });
}
