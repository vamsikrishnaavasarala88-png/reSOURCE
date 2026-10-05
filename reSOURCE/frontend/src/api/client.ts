import type { ApiErrorBody } from '../types/api';

const DEFAULT_TIMEOUT_MS = 8000;

/** Raised for every failed API call so callers only handle one error type. */
export class ApiError extends Error {
  readonly status: number | null;

  /** Field level messages from a 400/409 response, keyed by field name. */
  readonly fields: Record<string, string>;

  constructor(
    message: string,
    status: number | null = null,
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/**
 * Secondary header carrying the same token.
 *
 * Some hosting/preview proxies strip the standard `Authorization` header from
 * requests before they reach the API, which makes every signed-in call arrive
 * anonymous. The API accepts either header, so the token is sent both ways.
 * The token itself is always verified server side, so this changes nothing
 * about how access is granted.
 */
const TOKEN_HEADER = 'X-Auth-Token';

/** Headers that identify the caller for a request made with `token`. */
function authHeaders(token: string | null): Record<string, string> {
  if (!token) {
    return {};
  }

  return { Authorization: `Bearer ${token}`, [TOKEN_HEADER]: token };
}

/** Sets (or clears) the bearer token attached to outgoing requests. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Multipart upload used for space photos. `fetch` sets the boundary itself, so
 * no Content-Type header is set here.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const { signal, timeoutMs = 30000 } = options;
  const token = authToken;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...authHeaders(authToken),
      },
      body: formData,
      signal: controller.signal,
    });

    const payload = await readBody(response);

    if (!response.ok) {
      if (response.status === 401 && authToken && token === authToken) {
        unauthorizedHandler?.();
      }

      throw toApiError(payload, response.status);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (timedOut) {
      throw new ApiError('The upload took too long. Check your connection and try again.');
    }

    throw new ApiError('Unable to reach the reSOURCE API.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Called when the API rejects a request that carried a token, e.g. after the
 * token expired. The auth provider uses it to end the session.
 */
export function registerUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configured) {
    // Same-origin requests through the dev server proxy.
    return '/api';
  }

  return configured.replace(/\/+$/, '');
}

/** Base URL every request is built from. */
export const API_BASE_URL = resolveBaseUrl();

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set to false for public endpoints that should never send the token. */
  auth?: boolean;
  /** Extra headers for one call. */
  headers?: Record<string, string>;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toApiError(payload: unknown, status: number): ApiError {
  if (payload && typeof payload === 'object') {
    const { message, error, errors } = payload as ApiErrorBody;

    if (message || error) {
      return new ApiError(message ?? error ?? `Request failed with status ${status}`, status, errors ?? {});
    }
  }

  return new ApiError(`Request failed with status ${status}`, status);
}

/**
 * Turns a media path returned by the API into something an `<img>` can load.
 * Paths served by the API (for example `/api/files/spaces/...`) are rewritten
 * when the API lives on a different origin than the app.
 */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  if (!API_BASE_URL || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (API_BASE_URL !== '/api' && path.startsWith('/api/')) {
    return `${API_BASE_URL}${path.slice('/api'.length)}`;
  }

  return path;
}

/**
 * Minimal typed fetch wrapper: JSON in, JSON out, with a timeout, automatic
 * bearer token and normalised {@link ApiError}s.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    auth = true,
    headers: extraHeaders,
  } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const token = auth ? authToken : null;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...authHeaders(token),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readBody(response);

    if (!response.ok) {
      // A rejected token means the stored session is no longer usable - but only
      // if it is still the current one. A slow 401 from a token that has since
      // been replaced by a fresh login must not sign the user out again.
      if (response.status === 401 && token && token === authToken) {
        unauthorizedHandler?.();
      }

      throw toApiError(payload, response.status);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (timedOut) {
      throw new ApiError('The reSOURCE API did not respond in time.');
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('The request was cancelled.');
    }

    throw new ApiError('Unable to reach the reSOURCE API.');
  } finally {
    clearTimeout(timer);
  }
}
