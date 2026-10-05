import { CircleAlert, MapPinOff } from 'lucide-react';
import type { ReactNode } from 'react';
import Button from './Button';

interface ErrorPanelProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}

/** Failure state with a retry action, used by every space data view. */
export function ErrorPanel({
  title = 'Unable to load spaces.',
  description = 'The reSOURCE API could not be reached. Check your connection and try again.',
  onRetry,
  retryLabel = 'Retry',
  children,
}: ErrorPanelProps) {
  return (
    <div className="rounded-3xl border border-red-200 bg-red-50/70 px-5 py-8 text-center sm:px-8">
      <CircleAlert className="mx-auto size-8 text-red-500" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold text-red-900" role="alert">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-red-800">{description}</p>

      {children ? <div className="mt-4 text-sm text-red-800">{children}</div> : null}

      {onRetry ? (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface EmptyPanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

/** Neutral "nothing here" state, for example an empty search result. */
export function EmptyPanel({ title, description, action, icon }: EmptyPanelProps) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center sm:px-8">
      <div className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        {icon ?? <MapPinOff className="size-5" aria-hidden="true" />}
      </div>
      <h2 className="mt-3 text-base font-semibold text-stone-900">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
