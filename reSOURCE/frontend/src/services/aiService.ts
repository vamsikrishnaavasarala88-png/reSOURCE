import { ApiError, apiRequest, apiUpload } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  AiFailure,
  AiOutcome,
  AiResourceType,
  AiSearchSuccess,
  MaterialRecognition,
} from '../types/ai';

/**
 * The AI features, called on the backend only.
 *
 * <p>No API key and no provider URL ever reach this file: the browser asks the
 * reSOURCE API, and the API talks to the provider. Every call takes longer than
 * an ordinary one, so the timeouts are wider, and every failure comes back as
 * `{ ok: false, message }` so the UI can offer its manual path without an
 * unhandled rejection.</p>
 */

const AI_TIMEOUT_MS = 30000;

/** Page size the AI search asks for; matches the marketplace grid. */
const AI_PAGE_SIZE = 9;

export const SEARCH_UNAVAILABLE_MESSAGE =
  'AI search is temporarily unavailable. You can use filters instead.';

/** The wording the material marketplace uses, from the brief. */
export const MATERIAL_SEARCH_UNAVAILABLE_MESSAGE =
  'AI search unavailable. Try using category and filter options.';

export const RECOGNITION_FALLBACK_MESSAGE =
  "Couldn't confidently identify this material. Please select the category manually.";

export const RECOGNITION_UNAVAILABLE_MESSAGE =
  'AI recognition is temporarily unavailable. Please select the category manually.';

export interface AiSearchRequest {
  searchQuery: string;
  resourceType: AiResourceType;
  latitude?: number;
  longitude?: number;
  page?: number;
  size?: number;
}

/**
 * Understands a sentence and returns the real listings that match it.
 *
 * <p>The endpoint answers {@code 200} with a failure body when it cannot help -
 * unconfigured, too slow, unusable answer, or the visitor's limit reached - and
 * that is turned into a message here.</p>
 */
export async function searchWithAi<T>(
  request: AiSearchRequest,
  signal?: AbortSignal,
): Promise<AiOutcome<AiSearchSuccess<T>>> {
  try {
    const payload = await apiRequest<AiSearchSuccess<T> | AiFailure>(endpoints.aiSearchIntent, {
      method: 'POST',
      body: { ...request, page: request.page ?? 0, size: request.size ?? AI_PAGE_SIZE },
      signal,
      timeoutMs: AI_TIMEOUT_MS,
      // Public, exactly like browsing the marketplaces.
      auth: false,
    });

    if (isFailure(payload)) {
      return { ok: false, message: payload.message };
    }

    return { ok: true, data: payload };
  } catch (error) {
    return { ok: false, message: messageFor(error, SEARCH_UNAVAILABLE_MESSAGE) };
  }
}

/** Sends one photo for identification. The image is the only thing that travels. */
export async function recognizeMaterialImage(
  file: File,
  signal?: AbortSignal,
): Promise<AiOutcome<MaterialRecognition>> {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const payload = await apiUpload<MaterialRecognition | AiFailure>(
      endpoints.aiMaterialRecognition,
      formData,
      { signal, timeoutMs: AI_TIMEOUT_MS },
    );

    if (isFailure(payload)) {
      return { ok: false, message: payload.message };
    }

    return { ok: true, data: payload };
  } catch (error) {
    return { ok: false, message: messageFor(error, RECOGNITION_UNAVAILABLE_MESSAGE) };
  }
}

// -------------------------------------------------------------------- helpers

/**
 * A message a person can act on.
 *
 * <p>A complaint about the request itself (validation, or the visitor's own
 * limit) is passed through, because the backend words it better. Everything
 * else - a timeout, a provider error, no connection - becomes the manual-path
 * message for that feature.</p>
 */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status !== null && error.status < 500) {
    return error.message;
  }

  return fallback;
}

function isFailure(payload: unknown): payload is AiFailure {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    (payload as AiFailure).success === false
  );
}
