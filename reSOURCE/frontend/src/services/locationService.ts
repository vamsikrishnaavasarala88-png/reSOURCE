/**
 * The browser's location, behind one small interface.
 *
 * <p>Everything that needs to know where the visitor is goes through here, so the
 * same rules apply everywhere: the position is asked for once per action, never
 * watched continuously, and every way the browser can say no - permission
 * refused, no fix available, a timeout, no geolocation API at all - comes back as
 * a plain result object with a message written for a person. Nothing throws, and
 * nothing technical leaks into the UI.</p>
 *
 * <p>The result is deliberately approximate: it is rounded to about a kilometre
 * before it leaves this module, because the marketplace needs to answer "what is
 * near me", not "where exactly are you standing". The coordinates are used by the
 * backend for distance and radius, and are never shown to anyone else.</p>
 */

/** A position good enough to sort a marketplace by distance. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** How the last attempt ended; `ready` is the only state with a position. */
export type LocationStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'timeout';

/** The outcome of one attempt, with a message already worded for a person. */
export type LocationOutcome =
  | { ok: true; coordinates: Coordinates }
  | { ok: false; status: Exclude<LocationStatus, 'idle' | 'requesting'>; message: string };

/** Shown whenever the browser could not supply a position. */
export const LOCATION_UNAVAILABLE_MESSAGE =
  'Location unavailable. You can continue by searching manually.';

/**
 * The position the visitor granted earlier in this tab, if any.
 *
 * <p>Kept in a module variable only: it is never written to storage, never sent
 * anywhere except the backend search it belongs to, and disappears when the tab
 * is closed. It exists so that moving between pages re-uses one decision from the
 * visitor instead of asking the device again.</p>
 */
let remembered: Coordinates | null = null;

/** The position from an earlier grant, without asking the browser again. */
export function lastKnownCoordinates(): Coordinates | null {
  return remembered ? { ...remembered } : null;
}

/** Forgets the remembered position, so the next page starts without one. */
export function forgetLastKnownCoordinates(): void {
  remembered = null;
}

/** Permission was refused, which is the visitor's decision and is not an error. */
const DENIED_MESSAGE =
  'Location permission was refused. Search by address or use the filters instead.';

/** The device could not get a fix - indoors, or with location switched off. */
const UNAVAILABLE_MESSAGE =
  'Your device could not find a location. Search by address or use the filters instead.';

/** The browser took too long to answer. */
const TIMEOUT_MESSAGE =
  'Finding your location took too long. You can continue by searching manually.';

/** Roughly one kilometre, so a position shared for searching stays imprecise. */
function approximate(value: Coordinates): Coordinates {
  return {
    latitude: Math.round(value.latitude * 100) / 100,
    longitude: Math.round(value.longitude * 100) / 100,
  };
}

/** About ten centimetres - the picker stores a listing's own published spot. */
function precise(value: Coordinates): Coordinates {
  return {
    latitude: Math.round(value.latitude * 1_000_000) / 1_000_000,
    longitude: Math.round(value.longitude * 1_000_000) / 1_000_000,
  };
}

/** How exact the caller needs the fix to be. */
export interface LocationOptions {
  /**
   * True only when the result becomes a listing's own published location, where
   * a kilometre of rounding would be wrong. Searching never needs this: a
   * coarse fix answers "what is near me" just as well and gives less away.
   */
  precise?: boolean;
}

/** True when this browser can ask at all. */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Asks the browser for the current position, once.
 *
 * <p>High accuracy is off on purpose: a coarse fix is quicker, lighter on the
 * device and precise enough for kilometre-scale discovery. The cached position is
 * accepted for up to five minutes so moving between pages does not prompt the
 * device again.</p>
 */
export function getCurrentLocation(options: LocationOptions = {}): Promise<LocationOutcome> {
  if (!isGeolocationSupported()) {
    return Promise.resolve({ ok: false, status: 'unavailable', message: LOCATION_UNAVAILABLE_MESSAGE });
  }

  return new Promise<LocationOutcome>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const exact = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        // Whatever the caller asked for, what later searches re-use is the coarse
        // version: one fix, one level of precision remembered per purpose.
        remembered = approximate(exact);

        resolve({
          ok: true,
          coordinates: options.precise ? precise(exact) : remembered,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          // The visitor said no: drop anything remembered from before.
          remembered = null;
          resolve({ ok: false, status: 'denied', message: DENIED_MESSAGE });
          return;
        }

        if (error.code === error.TIMEOUT) {
          resolve({ ok: false, status: 'timeout', message: TIMEOUT_MESSAGE });
          return;
        }

        resolve({ ok: false, status: 'unavailable', message: UNAVAILABLE_MESSAGE });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

/** The message to show for a failure, whichever way it failed. */
export function messageFor(outcome: LocationOutcome): string {
  return outcome.ok ? '' : outcome.message;
}
