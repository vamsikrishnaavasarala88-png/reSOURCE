import { apiRequest } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { AuthSession, AuthUser, LoginPayload, RegisterPayload } from '../types/auth';

/**
 * Calls `POST /api/auth/register`. The API answers with the created user; the
 * caller then logs in to obtain a token.
 */
export function registerRequest(payload: RegisterPayload): Promise<AuthUser> {
  return apiRequest<AuthUser>(endpoints.register, { method: 'POST', body: payload, auth: false });
}

/** Calls `POST /api/auth/login` and returns the access token plus the user. */
export function loginRequest(payload: LoginPayload): Promise<AuthSession> {
  return apiRequest<AuthSession>(endpoints.login, { method: 'POST', body: payload, auth: false });
}

/** Calls `GET /api/auth/me` with the stored token. */
export function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  return apiRequest<AuthUser>(endpoints.authMe, { signal });
}
