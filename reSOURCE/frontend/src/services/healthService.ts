import { apiRequest } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { HealthResponse } from '../types/api';

/** Calls `GET /api/health` (public, so no token is attached). */
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>(endpoints.health, {
    signal,
    auth: false,
    // TEMPORARY diagnostic header: lets the dev-server trace show whether an
    // intermediary proxy forwards custom headers to the API.
    headers: { 'X-Client': 'reSOURCE-web' },
  });
}
