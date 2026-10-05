import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

type AlertTone = 'error' | 'success';

interface AlertProps {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}

const TONES: Record<AlertTone, { wrapper: string; icon: string }> = {
  error: { wrapper: 'border-red-200 bg-red-50 text-red-800', icon: 'text-red-500' },
  success: { wrapper: 'border-brand-200 bg-brand-50 text-brand-800', icon: 'text-brand-600' },
};

/** Inline feedback message used by the auth and profile forms. */
export default function Alert({ tone = 'error', children, className }: AlertProps) {
  const toneClasses = TONES[tone];
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        toneClasses.wrapper,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', toneClasses.icon)} aria-hidden="true" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
