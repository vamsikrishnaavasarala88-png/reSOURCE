import { Recycle } from 'lucide-react';
import { cn } from '../utils/cn';

interface BrandMarkProps {
  /** Renders the tagline under the wordmark. */
  showTagline?: boolean;
  className?: string;
}

/** reSOURCE wordmark used in the navbar and footer. */
export default function BrandMark({ showTagline = false, className }: BrandMarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-brand-50 shadow-sm">
        <Recycle className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col text-left leading-tight">
        <span className="text-lg font-bold tracking-tight text-stone-900">reSOURCE</span>
        {showTagline ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">
            Reuse. Reimagine. Reconnect.
          </span>
        ) : null}
      </span>
    </span>
  );
}
