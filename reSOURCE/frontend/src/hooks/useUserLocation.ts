import { useCallback, useState } from 'react';
import {
  forgetLastKnownCoordinates,
  getCurrentLocation,
  type Coordinates,
  type LocationOptions,
  type LocationStatus,
} from '../services/locationService';

export interface UserLocationState {
  /** The visitor's position, once granted; `null` until then. */
  coordinates: Coordinates | null;
  status: LocationStatus;
  /** A message written for a person, or `null` while everything is fine. */
  message: string | null;
}

export interface UseUserLocation extends UserLocationState {
  /** Asks once; a second call while one is running is ignored. */
  request: (options?: LocationOptions) => Promise<Coordinates | null>;
  /** Forgets the position - used when the visitor turns the location off. */
  clear: () => void;
}

/**
 * The visitor's location, held in the page that needs it.
 *
 * <p>One state machine for every page: idle until asked, requesting while the
 * browser decides, ready with rounded coordinates, or a failure state carrying a
 * friendly message. It never polls and never watches - the position is requested
 * when the visitor presses the button, and kept in component state so nothing is
 * stored anywhere it could be read later.</p>
 */
export function useUserLocation(): UseUserLocation {
  const [state, setState] = useState<UserLocationState>({
    coordinates: null,
    status: 'idle',
    message: null,
  });

  const request = useCallback(async (options?: LocationOptions) => {
    setState((current) => ({ ...current, status: 'requesting', message: null }));

    const outcome = await getCurrentLocation(options);

    if (!outcome.ok) {
      // The marketplace keeps working: no coordinates, one sentence of explanation.
      setState({ coordinates: null, status: outcome.status, message: outcome.message });

      return null;
    }

    setState({ coordinates: outcome.coordinates, status: 'ready', message: null });

    return outcome.coordinates;
  }, []);

  const clear = useCallback(() => {
    forgetLastKnownCoordinates();
    setState({ coordinates: null, status: 'idle', message: null });
  }, []);

  return { ...state, request, clear };
}
