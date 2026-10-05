import { useCallback, useEffect, useState } from 'react';
import { fetchMaterial } from '../services/materialService';
import type { MaterialDetail } from '../types/material';

type MaterialLoadStatus = 'loading' | 'ready' | 'notfound' | 'error';

interface UseMaterialDetailResult {
  material: MaterialDetail | null;
  status: MaterialLoadStatus;
  errorMessage: string | null;
  retry: () => void;
}

/** Loads one listing for pages that only need it, with a retry hook for the error state. */
export function useMaterialDetail(id: string | undefined): UseMaterialDetailResult {
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [status, setStatus] = useState<MaterialLoadStatus>(id ? 'loading' : 'notfound');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    fetchMaterial(id, controller.signal)
      .then((response) => {
        setMaterial(response);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        const code = (error as { status?: number | null }).status ?? null;
        setErrorMessage(code === 403 ? null : ((error as Error).message ?? null));
        setStatus(code === 404 ? 'notfound' : 'error');
      });

    return () => controller.abort();
  }, [id, retryToken]);

  const retry = useCallback(() => {
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }, []);

  return { material, status, errorMessage, retry };
}
