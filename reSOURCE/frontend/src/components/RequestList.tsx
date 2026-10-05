import { useCallback, useEffect, useState, type ReactNode } from 'react';
import RequestCard from './RequestCard';
import { EmptyPanel, ErrorPanel } from './StatePanel';
import type { RequestSummary } from '../types/request';

interface RequestListProps {
  /** Loads the rows; re-run by the retry button. */
  load: (signal?: AbortSignal) => Promise<RequestSummary[]>;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon?: React.ReactNode;
  loadingLabel: string;
  /** Rendered per row, e.g. accept/reject buttons. */
  renderActions?: (request: RequestSummary) => React.ReactNode;
  /** Shown above the card list when the list is not empty. */
  header?: ReactNode;
  /** Shown below the list, e.g. a "View all" link on the dashboard. */
  footer?: ReactNode;
  /** Caps how many cards are rendered, for the dashboard summaries. */
  limit?: number;
}

/**
 * Shared "list of requests" view: loading skeletons, empty state, error state
 * with retry, and the request cards themselves.
 */
export default function RequestList({
  load,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  loadingLabel,
  renderActions,
  header,
  footer,
  limit,
}: RequestListProps) {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal)
      .then((response) => {
        setRequests(response);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        setStatus('error');
      });

    return () => controller.abort();
  }, [load, retryToken]);

  const retry = useCallback(() => {
    // Reset here rather than in the effect: the effect only talks to the API.
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }, []);

  if (status === 'loading') {
    return (
      <div className="space-y-4" role="status" aria-label={loadingLabel}>
        {[0, 1].map((row) => (
          <div key={row} className="animate-pulse rounded-3xl border border-stone-200 bg-white p-5">
            <div className="h-5 w-1/3 rounded-full bg-stone-200" />
            <div className="mt-3 h-4 w-2/3 rounded-full bg-stone-200" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="h-16 rounded-2xl bg-stone-100" />
              <div className="h-16 rounded-2xl bg-stone-100" />
              <div className="h-16 rounded-2xl bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorPanel
        title="Unable to load requests."
        description="The reSOURCE API could not be reached. Check your connection and try again."
        onRetry={retry}
      />
    );
  }

  if (requests.length === 0) {
    return <EmptyPanel title={emptyTitle} description={emptyDescription} icon={emptyIcon} />;
  }

  const visible = limit === undefined ? requests : requests.slice(0, limit);

  return (
    <div className="space-y-4">
      {header}
      {visible.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          actions={renderActions ? renderActions(request) : null}
        />
      ))}
      {footer}
    </div>
  );
}
