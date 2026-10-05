const TOKEN_KEY = 'resource.accessToken';
const PROBE_KEY = 'resource.storageProbe';

/**
 * Where the access token is kept between page loads.
 *
 * `localStorage` is used when the browser allows it, `sessionStorage` as a
 * fallback, and plain memory when both are blocked (private modes, or an
 * embedded frame on another site). Memory keeps the session alive while the tab
 * stays open, but a reload ends it - the UI says so instead of silently
 * bouncing the user back to the login page.
 */
export type TokenStorageKind = 'local' | 'session' | 'memory';

/**
 * Reads `window[<name>]`. Browsers throw a SecurityError on the *property
 * access* itself when storage is denied (an embedded frame on another site),
 * so even reading it has to be guarded.
 */
function storageOrNull(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

function usable(storage: Storage | null): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

let kind: TokenStorageKind | null = null;
let memoryToken: string | null = null;

function resolveKind(): TokenStorageKind {
  if (kind) {
    return kind;
  }

  if (typeof window === 'undefined') {
    kind = 'memory';
    return kind;
  }

  if (usable(storageOrNull('localStorage'))) {
    kind = 'local';
  } else if (usable(storageOrNull('sessionStorage'))) {
    kind = 'session';
  } else {
    kind = 'memory';
  }

  return kind;
}

/** Where the token currently lives, for user facing messaging. */
export function tokenStorageKind(): TokenStorageKind {
  return resolveKind();
}

/** True when the session survives a reload in this browser. */
export function isSessionPersistent(): boolean {
  return resolveKind() !== 'memory';
}

function activeStorage(): Storage | null {
  switch (resolveKind()) {
    case 'local':
      return storageOrNull('localStorage');
    case 'session':
      return storageOrNull('sessionStorage');
    default:
      return null;
  }
}

/** Only the access token is persisted - never credentials. */
export function readStoredToken(): string | null {
  const storage = activeStorage();

  if (!storage) {
    return memoryToken;
  }

  try {
    return storage.getItem(TOKEN_KEY);
  } catch {
    return memoryToken;
  }
}

export function storeToken(token: string): void {
  memoryToken = token;

  const storage = activeStorage();

  try {
    storage?.setItem(TOKEN_KEY, token);
  } catch {
    // Session stays in memory only.
  }
}

export function clearStoredToken(): void {
  memoryToken = null;

  const storage = activeStorage();

  try {
    storage?.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}
