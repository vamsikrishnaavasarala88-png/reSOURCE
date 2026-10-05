import { apiRequest } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { AuthUser, UpdateProfilePayload } from '../types/auth';

/** Calls `GET /api/users/me`. */
export function getMyProfile(signal?: AbortSignal): Promise<AuthUser> {
  return apiRequest<AuthUser>(endpoints.usersMe, { signal });
}

/** Calls `PUT /api/users/me`. */
export function updateMyProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
  return apiRequest<AuthUser>(endpoints.usersMe, { method: 'PUT', body: payload });
}
