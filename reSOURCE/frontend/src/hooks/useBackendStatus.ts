import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from '../services/healthService';

export type BackendState = 'checking' | 'online' | 'offline';

export interface BackendStatus {
  state: BackendState;
  /** Service name reported by the API, available when the backend is online. */
  service: string | null;
  checkedAt: Date | null;
  refresh: () => void;
}

const DEFAULT_POLL_INTERVAL_MS = 30000;

/**
 * Checks whether the backend is reachable.
 * A failed request never throws to the UI: it simply flips the state to
 * `offline`, so the app keeps working without the API.
 */
export function useBackendStatus(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS): BackendStatus {
  const [state, setState] = useState<BackendState>('checking');
  const [service, setService] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(() => {
    setState('checking');
    setAttempt((value) => value + 1);
  }, []);

  /** Silent re-check used by the background poll: no "checking" flicker. */
  const recheck = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchHealth(controller.signal)
      .then((health) => {
        if (cancelled) return;
        setState(health.status === 'UP' ? 'online' : 'offline');
        setService(health.service);
      })
      .catch(() => {
        if (cancelled) return;
        setState('offline');
        setService(null);
      })
      .finally(() => {
        if (!cancelled) setCheckedAt(new Date());
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return undefined;

    const timer = window.setInterval(recheck, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, recheck]);

  return { state, service, checkedAt, refresh };
}
