import { apiRequest } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RequestDetail, RequestPayload, RequestSummary } from '../types/request';

/** Calls `POST /api/requests`. The requester is taken from the access token. */
export function createRequest(payload: RequestPayload): Promise<RequestDetail> {
  return apiRequest<RequestDetail>(endpoints.requests, { method: 'POST', body: payload });
}

/** Calls `GET /api/requests/my`: the requests the user sent. */
export function fetchMyRequests(signal?: AbortSignal): Promise<RequestSummary[]> {
  return apiRequest<RequestSummary[]>(endpoints.requestsMine, { signal });
}

/** Calls `GET /api/requests/incoming`: requests for the spaces the user owns. */
export function fetchIncomingRequests(signal?: AbortSignal): Promise<RequestSummary[]> {
  return apiRequest<RequestSummary[]>(endpoints.requestsIncoming, { signal });
}

/** Calls `GET /api/requests/{id}`. Only the requester and the owner may read it. */
export function fetchRequest(id: number | string, signal?: AbortSignal): Promise<RequestDetail> {
  return apiRequest<RequestDetail>(endpoints.requestById(id), { signal });
}

/** Owner accepts; the backend creates the booking in the same transaction. */
export function acceptRequest(id: number | string): Promise<RequestDetail> {
  return apiRequest<RequestDetail>(endpoints.requestAccept(id), { method: 'POST' });
}

/** Owner rejects a pending request. No booking is created. */
export function rejectRequest(id: number | string): Promise<RequestDetail> {
  return apiRequest<RequestDetail>(endpoints.requestReject(id), { method: 'POST' });
}

/** Requester cancels their own pending request. */
export function cancelRequest(id: number | string): Promise<RequestDetail> {
  return apiRequest<RequestDetail>(endpoints.requestCancel(id), { method: 'POST' });
}
