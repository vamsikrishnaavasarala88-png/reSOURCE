import { CircleCheck, LoaderCircle, RefreshCw } from 'lucide-react';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { cn } from '../utils/cn';

interface BackendStatusBadgeProps {
  className?: string;
}

const DOT_CLASSES = {
  checking: 'bg-stone-400 animate-pulse',
  online: 'bg-brand-500',
  offline: 'bg-clay-500',
} as const;

/**
 * Small development indicator that calls `GET /api/health`.
 * When the API is unreachable it shows "Backend Offline" instead of failing,
 * so the UI never breaks without the backend.
 */
export default function BackendStatusBadge({ className }: BackendStatusBadgeProps) {
  const { state, service, checkedAt, refresh } = useBackendStatus();

  const label =
    state === 'checking'
      ? 'Checking backend'
      : state === 'online'
        ? 'Backend Connected'
        : 'Backend Offline';

  const title = [
    service ? `service: ${service}` : null,
    checkedAt ? `last checked: ${checkedAt.toLocaleTimeString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', DOT_CLASSES[state])} />
      <span title={title || undefined} className="whitespace-nowrap">
        {label}
      </span>

      {state === 'checking' ? (
        <LoaderCircle className="size-3.5 animate-spin text-stone-400" aria-hidden="true" />
      ) : null}

      {state === 'online' ? (
        <CircleCheck className="size-3.5 text-brand-600" aria-hidden="true" />
      ) : null}

      {state === 'offline' ? (
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </span>
  );
}
